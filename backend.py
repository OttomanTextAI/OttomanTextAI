import base64
import json
import os
import re
import traceback
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import time
import random

import cv2
import numpy as np
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
import openai
from openai import OpenAI

from src.common.config import load_yaml_config
from src.image_enhancement.enhance import enhance_image
from src.ai.rag.retriever import DocumentRetriever
from src.ai.assistant.qa import DocumentQA
from src.ai.analysis.selected_text import SelectedTextAnalyzer
from src.ai.analysis.suggestions import AISuggestionGenerator
from src.ai.assistant.question_generator import DocumentQuestionGenerator
from src.ai.analysis.research import ResearchSuggestionGenerator
from src.ai.filters.entity_filter import EntityFilterClassifier
# Loads RELAY_API_KEY / RELAY_BASE_URL / GEMINI_API_KEY from a local .env for
# development. In production (Render) these are set directly as environment
# variables and no .env file is present, so this is a no-op there.
load_dotenv()

app = Flask(__name__)

document_retriever = None
document_qa = None

# All /api/* routes (enhance, translate, assistant, health) share this one
# allowlist so a route can never end up with looser or stricter CORS than
# the others.
ALLOWED_ORIGINS = [
    "https://ottomantextai.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
CORS(app, resources={r"/api/*": {"origins": ALLOWED_ORIGINS}})

# A phone-camera photo can be tens of MB. Without a cap, a very large
# upload can run enhance_image() long/heavy enough to hit the gunicorn
# worker timeout or the platform's memory limit — the worker dies mid
# request with no HTTP response at all, which the browser then reports
# as a misleading "blocked by CORS policy" error instead of a clear one.
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # 20 MB


@app.errorhandler(RequestEntityTooLarge)
def handle_request_entity_too_large(error):
    return jsonify(
        {
            "error": "Yüklenen dosya çok büyük (limit: 20MB)."
        }
    ), 413


LLM_CONFIG_PATH = Path(__file__).resolve().parent / "configs" / "llm.yaml"


def get_llm_config():
    """
    Load configs/llm.yaml (provider, model, generation params). Read fresh
    each call so editing the model there doesn't require a server restart.
    """
    return load_yaml_config(LLM_CONFIG_PATH)


def has_excessive_repetition(text, max_repeats=4, min_fragment_length=15):
    """
    Cheap guard against a model looping on the same sentence/line until it
    hits max_tokens, which truncates the JSON mid-object and would
    otherwise surface as a confusing "not valid JSON" error. Only flags a
    line/sentence that repeats several times, not incidental short phrases.
    """
    if not text:
        return False

    fragments = re.split(r"[\n.!?]+", text)
    seen_counts = {}

    for fragment in fragments:
        cleaned = fragment.strip()

        if len(cleaned) < min_fragment_length:
            continue

        seen_counts[cleaned] = seen_counts.get(cleaned, 0) + 1

        if seen_counts[cleaned] >= max_repeats:
            return True

    return False


def _build_messages(prompt, image_bytes):
    """Build the chat-completions message list for a single image."""
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")

    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": prompt,
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": (
                            "data:image/png;base64,"
                            + encoded_image
                        )
                    },
                },
            ],
        }
    ]


def _relay_completion(
    client,
    model,
    messages,
    temperature,
    max_tokens,
    max_attempts=3,
    retry_delays=(2, 5),
    label="translate",
):
    """
    Call RelayGPU once, retrying up to max_attempts times on transient
    timeout/connection/rate-limit/5xx errors (unchanged from the original
    single-call retry behavior). Returns
    {"ok": True, "raw_text": ..., "finish_reason": ...} on success, or
    {"ok": False, "message": <dict>, "status_code": <int>} describing the
    HTTP response the caller should return on a definitive failure.
    """
    for attempt in range(max_attempts):
        try:
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=120,
            )

            # Accessed defensively (not completion.choices[0].message...
            # directly): an abnormal relay response — e.g. an empty
            # choices list, or a message with no content attribute at
            # all — would otherwise raise IndexError/AttributeError here
            # and get swallowed by the caller's generic except Exception
            # with no logging, which is exactly the kind of silent
            # failure this function exists to avoid.
            choices = getattr(completion, "choices", None) or []
            choice = choices[0] if choices else None
            message = getattr(choice, "message", None) if choice else None
            raw_text = (getattr(message, "content", None) or "") if message else ""
            finish_reason = getattr(choice, "finish_reason", None) if choice else None

            # An empty content field with no exception raised is a
            # different failure mode than looping/truncation (e.g. a
            # content filter, a refusal, or a relay-side error folded
            # into the response instead of raised as an HTTP error).
            # finish_reason alone doesn't explain it, so dump the whole
            # completion object — that's the only place the real reason
            # (native_finish_reason, a refusal/error field, usage, etc.)
            # is likely to show up.
            if not raw_text:
                try:
                    completion_dump = completion.model_dump()
                except Exception:
                    completion_dump = str(completion)

                print(
                    f"[translate:{label}] Empty content in Relay "
                    f"response (finish_reason={finish_reason}, "
                    f"choices_count={len(choices)}). "
                    f"Full completion object: {completion_dump}",
                    flush=True,
                )

            return {
                "ok": True,
                "raw_text": raw_text,
                "finish_reason": finish_reason,
            }

        except (openai.APITimeoutError, openai.APIConnectionError) as error:
            if attempt < max_attempts - 1:
                delay = retry_delays[attempt]

                print(
                    f"[translate:{label}] Relay timeout/connection error. "
                    f"Retrying in {delay}s "
                    f"({attempt + 2}/{max_attempts})...",
                    flush=True,
                )

                time.sleep(delay)
                continue

            return {
                "ok": False,
                "message": {
                    "error": (
                        "Relay yanıt vermedi (zaman aşımı). "
                        "Lütfen birkaç saniye sonra tekrar deneyin."
                    )
                },
                "status_code": 504,
            }

        except openai.RateLimitError as error:
            if attempt < max_attempts - 1:
                delay = retry_delays[attempt]

                print(
                    f"[translate:{label}] Relay rate limit. "
                    f"Retrying in {delay}s "
                    f"({attempt + 2}/{max_attempts})...",
                    flush=True,
                )

                time.sleep(delay)
                continue

            return {
                "ok": False,
                "message": {
                    "error": "Relay API rate limit aşıldı.",
                    "details": str(error),
                },
                "status_code": 429,
            }

        except openai.APIStatusError as error:
            if (
                error.status_code in {500, 502, 503, 504}
                and attempt < max_attempts - 1
            ):
                delay = retry_delays[attempt]

                print(
                    f"[translate:{label}] Relay temporary error "
                    f"{error.status_code}. "
                    f"Retrying in {delay}s "
                    f"({attempt + 2}/{max_attempts})...",
                    flush=True,
                )

                time.sleep(delay)
                continue

            # str(error) is usually just a short summary (e.g. "Error
            # code: 403 - blocked"). The full JSON body — quota, key
            # restriction, content-policy reason, etc. — is on the
            # underlying httpx response, so log that explicitly too; it's
            # the only way to see it in the Render logs.
            try:
                relay_body = error.response.text
            except Exception:
                relay_body = getattr(error, "body", None)

            print(
                f"[translate:{label}] Relay API error {error.status_code}. "
                f"Full response body: {relay_body}",
                flush=True,
            )

            return {
                "ok": False,
                "message": {
                    "error": "Relay API request failed.",
                    "details": str(error),
                },
                "status_code": error.status_code,
            }

    # Every branch above returns; kept only as a defensive fallback.
    return {
        "ok": False,
        "message": {"error": "Relay API yanıtı alınamadı."},
        "status_code": 502,
    }


def _get_relay_result(
    client,
    model,
    messages,
    temperature,
    max_tokens,
    max_repetition_attempts=2,
    repetition_retry_delay=1.5,
    label="main",
):
    """
    Get a usable response from RelayGPU, retrying the whole request up to
    max_repetition_attempts times when the model loops on the same
    phrase, gets cut off at the token limit, or returns something that
    isn't a usable ocr/trans JSON object at all (empty content, invalid
    JSON, missing fields — a relay-side hiccup deserves the same
    "just try again" treatment as a looping model). Returns
    {"ok": True, "parsed": <cleaned result dict>} on success,
    {"ok": False, "reason": "network", "message": ..., "status_code": ...}
    on a definitive API/network failure, or
    {"ok": False, "reason": "unusable"} if every attempt failed.
    """
    for repetition_attempt in range(max_repetition_attempts):
        call_result = _relay_completion(
            client,
            model,
            messages,
            temperature,
            max_tokens,
            label=label,
        )

        if not call_result["ok"]:
            return {
                "ok": False,
                "reason": "network",
                "message": call_result["message"],
                "status_code": call_result["status_code"],
            }

        raw_text = call_result["raw_text"]
        finish_reason = call_result["finish_reason"]

        failure_reason = None
        parsed = None

        if finish_reason == "length" or has_excessive_repetition(raw_text):
            failure_reason = (
                f"repetition detected (finish_reason={finish_reason})"
            )
        else:
            try:
                parsed = _parse_and_clean_relay_response(raw_text)
            except json.JSONDecodeError as error:
                failure_reason = f"invalid/empty JSON response ({error})"

            if parsed is None and failure_reason is None:
                failure_reason = "response missing ocr/trans fields"

        if failure_reason is not None:
            if repetition_attempt < max_repetition_attempts - 1:
                print(
                    f"[translate:{label}] Attempt "
                    f"{repetition_attempt + 2}/{max_repetition_attempts} "
                    f"due to {failure_reason}.",
                    flush=True,
                )

                time.sleep(repetition_retry_delay)
                continue

            return {"ok": False, "reason": "unusable"}

        return {"ok": True, "parsed": parsed}

    return {"ok": False, "reason": "unusable"}


def _parse_and_clean_relay_response(raw_text):
    """
    Parse a raw model response into the cleaned result dict returned by
    /api/translate. Returns None if the model didn't produce usable
    ocr/trans content. Raises json.JSONDecodeError if the response isn't
    valid JSON and no {...} block could be recovered from it.
    """
    cleaned_text = raw_text.strip()

    if cleaned_text.startswith("```"):
        cleaned_text = (
            cleaned_text
            .replace("```json", "")
            .replace("```", "")
            .strip()
        )

    print(
        "[translate] RAW RELAY RESPONSE:",
        cleaned_text[:2000],
        flush=True,
    )

    try:
        parsed = json.loads(cleaned_text)
    except json.JSONDecodeError:
        # Some models add stray prose around the JSON object despite
        # instructions not to. Fall back to extracting the first
        # {...} block before giving up, so a well-behaved-but-chatty
        # response doesn't needlessly fail.
        json_match = re.search(r"\{[\s\S]*\}", cleaned_text)
        if not json_match:
            raise
        parsed = json.loads(json_match.group(0))

    if not parsed.get("ocr") or not parsed.get("trans"):
        return None

    result = {
        "ocr": parsed.get("ocr", ""),
        "trans": parsed.get("trans", ""),
    }

    optional_string_fields = [
        "translit",
        "trans_en",
        "document_type",
        "style",
        "summary",
        "script_type",
        "script_purpose",
        "period_estimate",
        "date_hijri",
        "date_gregorian",
        "notes",
    ]

    for field in optional_string_fields:
        value = parsed.get(field)

        if isinstance(value, str) and value.strip():
            result[field] = value.strip()

    optional_list_fields = [
        "key_points",
        "people",
        "places",
        "concepts",
    ]

    for field in optional_list_fields:
        value = parsed.get(field)

        if isinstance(value, list):
            cleaned_list = [
                item.strip()
                for item in value
                if isinstance(item, str) and item.strip()
            ]

            if cleaned_list:
                result[field] = cleaned_list

    # uncertain_lines is a list of {reference, guess} objects rather
    # than plain strings, so it needs its own cleanup pass instead of
    # optional_list_fields above. Parsed defensively since the model
    # may not follow the exact shape asked for in the prompt.
    uncertain_lines = parsed.get("uncertain_lines")

    if isinstance(uncertain_lines, list):
        cleaned_uncertain_lines = []

        for item in uncertain_lines:
            if isinstance(item, dict):
                reference = str(
                    item.get("reference")
                    or item.get("satir")
                    or ""
                ).strip()
                guess = str(
                    item.get("guess")
                    or item.get("tahmin")
                    or ""
                ).strip()

                if reference or guess:
                    cleaned_uncertain_lines.append(
                        {
                            "reference": reference,
                            "guess": guess,
                        }
                    )

            elif isinstance(item, str) and item.strip():
                cleaned_uncertain_lines.append(
                    {
                        "reference": item.strip(),
                        "guess": "",
                    }
                )

        if cleaned_uncertain_lines:
            result["uncertain_lines"] = cleaned_uncertain_lines

    confidence = parsed.get("confidence")

    if isinstance(confidence, (int, float)):
        result["confidence"] = max(
            0,
            min(100, round(confidence)),
        )

    return result


def _split_image_top_bottom(image_bytes, overlap_ratio=0.08):
    """
    Decode image bytes and split into a top half and a bottom half with a
    vertical overlap, so a text line sitting on the split point isn't cut
    off in both pieces.
    """
    encoded_input = np.frombuffer(image_bytes, dtype=np.uint8)
    decoded_image = cv2.imdecode(encoded_input, cv2.IMREAD_UNCHANGED)

    if decoded_image is None:
        raise ValueError("Split image bytes could not be decoded.")

    height = decoded_image.shape[0]
    midpoint = height // 2
    overlap = int(height * overlap_ratio)

    top = decoded_image[0 : min(height, midpoint + overlap), :]
    bottom = decoded_image[max(0, midpoint - overlap) :, :]

    top_encoded_ok, top_encoded = cv2.imencode(".png", top)
    bottom_encoded_ok, bottom_encoded = cv2.imencode(".png", bottom)

    if not top_encoded_ok or not bottom_encoded_ok:
        raise ValueError("Split image halves could not be encoded.")

    return top_encoded.tobytes(), bottom_encoded.tobytes()


def _merge_split_results(top, bottom):
    """
    Merge the cleaned results of the top and bottom image halves into a
    single result dict with the same shape /api/translate normally
    returns, so the split strategy is invisible to the frontend.
    """
    merged = {
        "ocr": "\n".join(
            part
            for part in (top.get("ocr", ""), bottom.get("ocr", ""))
            if part
        ),
        "trans": "\n".join(
            part
            for part in (top.get("trans", ""), bottom.get("trans", ""))
            if part
        ),
    }

    if not merged["ocr"] or not merged["trans"]:
        return None

    if top.get("translit") or bottom.get("translit"):
        merged["translit"] = "\n".join(
            part
            for part in (
                top.get("translit", ""),
                bottom.get("translit", ""),
            )
            if part
        )

    if top.get("trans_en") or bottom.get("trans_en"):
        merged["trans_en"] = "\n".join(
            part
            for part in (
                top.get("trans_en", ""),
                bottom.get("trans_en", ""),
            )
            if part
        )

    # Document-level fields aren't per-half, so prefer whichever half
    # produced a value (top first, since it usually carries the
    # document's opening/header information).
    singular_fields = [
        "document_type",
        "style",
        "summary",
        "script_type",
        "script_purpose",
        "period_estimate",
        "date_hijri",
        "date_gregorian",
        "notes",
    ]

    for field in singular_fields:
        value = top.get(field) or bottom.get(field)

        if value:
            merged[field] = value

    list_fields = ["key_points", "people", "places", "concepts"]

    for field in list_fields:
        combined = list(top.get(field, [])) + list(bottom.get(field, []))
        deduped = list(dict.fromkeys(combined))

        if deduped:
            merged[field] = deduped

    uncertain_lines = (
        list(top.get("uncertain_lines", []))
        + list(bottom.get("uncertain_lines", []))
    )

    if uncertain_lines:
        merged["uncertain_lines"] = uncertain_lines

    top_confidence = top.get("confidence")
    bottom_confidence = bottom.get("confidence")

    if isinstance(top_confidence, (int, float)) and isinstance(
        bottom_confidence, (int, float)
    ):
        merged["confidence"] = round(
            (top_confidence + bottom_confidence) / 2
        )
    elif isinstance(top_confidence, (int, float)):
        merged["confidence"] = top_confidence
    elif isinstance(bottom_confidence, (int, float)):
        merged["confidence"] = bottom_confidence

    return merged


def _try_split_image_translation(
    client,
    model,
    temperature,
    max_tokens,
    image_bytes,
    prompt,
):
    """
    Split the image top/bottom and translate each half separately
    (in parallel where possible, falling back to sequential on any
    unexpected error), then merge the two results into one. Returns the
    merged result dict, or None if the split strategy didn't produce a
    usable result.
    """
    try:
        top_bytes, bottom_bytes = _split_image_top_bottom(image_bytes)
    except Exception as error:
        print(
            f"[translate] Split-image preparation failed: {error}",
            flush=True,
        )
        return None

    top_messages = _build_messages(prompt, top_bytes)
    bottom_messages = _build_messages(prompt, bottom_bytes)

    def get_half(messages, label):
        return _get_relay_result(
            client,
            model,
            messages,
            temperature,
            max_tokens,
            max_repetition_attempts=2,
            label=label,
        )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            top_future = executor.submit(
                get_half, top_messages, "split-top"
            )
            bottom_future = executor.submit(
                get_half, bottom_messages, "split-bottom"
            )

            top_result = top_future.result()
            bottom_result = bottom_future.result()

    except Exception as error:
        print(
            f"[translate] Parallel split-image request failed "
            f"({error}); falling back to sequential requests.",
            flush=True,
        )

        top_result = get_half(top_messages, "split-top")
        bottom_result = get_half(bottom_messages, "split-bottom")

    if not top_result["ok"] or not bottom_result["ok"]:
        return None

    return _merge_split_results(
        top_result["parsed"],
        bottom_result["parsed"],
    )


@app.route("/api/enhance", methods=["POST"])
def enhance_endpoint():
    """
    Enhance an uploaded Ottoman document image.

    Expects:
        multipart/form-data
        image: uploaded image file
        profile: printed, printed-degraded, delicate, or manuscript

    Returns:
        Enhanced PNG image.
    """
    if "image" not in request.files:
        return jsonify(
            {
                "error": "image field is required."
            }
        ), 400

    uploaded_file = request.files["image"]

    if uploaded_file.filename == "":
        return jsonify(
            {
                "error": "No image selected."
            }
        ), 400

    profile = request.form.get(
        "profile",
        "auto",
    ).strip().lower()

    if profile not in {
        "auto",
        "printed",
        "printed-degraded",
        "delicate",
        "manuscript",
    }:
        return jsonify(
            {
                "error": (
                    "profile must be one of: "
                    "'auto', "
                    "'printed', "
                    "'printed-degraded', "
                    "'delicate', "
                    "'manuscript'."
                )
            }
        ), 400

    try:
        input_bytes = uploaded_file.read()

        # If the worker dies mid-request (OOM kill, native crash, gunicorn
        # --timeout 120 hit on a large photo) there is no Python exception
        # to catch — the connection just drops and the browser reports a
        # misleading CORS error. This line at least tells us from the
        # Render logs whether processing started at all for that request.
        print(
            f"[enhance] start profile={profile} "
            f"bytes={len(input_bytes)}",
            flush=True,
        )

        output_bytes = enhance_image(
            input_bytes,
            profile=profile,
        )

        print(
            f"[enhance] done profile={profile} "
            f"output_bytes={len(output_bytes)}",
            flush=True,
        )

        return send_file(
            BytesIO(output_bytes),
            mimetype="image/png",
            as_attachment=False,
            download_name="enhanced.png",
        )

    except Exception as error:
        print(
            f"[enhance] failed profile={profile}: {error}\n"
            f"{traceback.format_exc()}",
            flush=True,
        )
        return jsonify(
            {
                "error": str(error)
            }
        ), 500


# Fields the model is asked for beyond the original ocr/trans pair. Every
# field is optional on the frontend side — if the model omits one or returns
# an empty value, the results panel simply skips that piece rather than
# showing a placeholder.
ANALYSIS_PROMPT = (
    "Bu görüntü bir Osmanlıca belgedir. "
    "Belgeyi dikkatlice oku ve yalnızca belgenin içeriğini analiz et. "

    "ÇOK ÖNEMLİ: Hiçbir cümleyi, ifadeyi veya satırı metin içinde ard arda "
    "ya da yanıtın farklı yerlerinde birebir tekrar etme; her bilgiyi "
    "yalnızca bir kez yaz. Aynı ifadeyi tekrar tekrar üretmek yerine, emin "
    "değilsen kısa kes ve belirsizliği açıkça işaretle. "

    "SERT KURAL: Aynı kelimeyi veya ifadeyi art arda EN FAZLA 1-2 kez "
    "yazabilirsin; bunun ötesinde bir tekrara ASLA girme. Bir cümleyi veya "
    "kalıbı 3. kez yazmak üzereysen dur, o satırı [okunamadı] veya "
    "[belirsiz] olarak işaretleyip bir SONRAKİ satıra geç. Aynı döngüye "
    "girdiğini fark edersen yanıtı hemen orada makul bir şekilde sonlandır; "
    "sonsuz tekrar üretmek, kısa ve eksik ama düzgün bir yanıt vermekten "
    "HER ZAMAN daha kötüdür. "

    "ocr: Görüntüde gerçekten okuyabildiğin Osmanlıca metni "
    "Arap harfleriyle yaz. Latin harfi kullanma. Okuyamadığın veya emin "
    "olmadığın her harf/kelime/ifade için bağlamdan (çevredeki kelimeler, "
    "cümlenin anlamı, dönemin yazım alışkanlıkları) en olası tahminini "
    "yap ve tahmin ettiğin kısmın TAMAMINI çift yıldız içine al: "
    "**tahmin edilen kısım** (örn. \"...بو **کلمه ایله** بیرلیکده...\") — "
    "başlangıç ve bitiş yıldızları, tahmin ettiğin kısmın tam sınırlarını "
    "göstermeli (sadece bitişe tek yıldız koyma, nereden başladığı belirsiz "
    "kalır). Bu işaretleme, kullanıcının hangi kısmın gerçekten okunduğunu, "
    "hangisinin tahmin olduğunu her zaman ayırt edebilmesi içindir. "
    "Yalnızca hiçbir makul tahmin dahi yapamayacağın kadar okunaksız "
    "kısımlarda [okunamadı] kullan. Her iki durumu da (tahmin edilen "
    "kısımlar ve [okunamadı] kısımlar) ayrıca notes ve uncertain_lines "
    "alanında özetle. "

    "translit: ocr alanındaki metnin Latin harflerine harf çevirisini "
    "(transliterasyon) yaz. Bu, ocr'daki her kelimenin birebir okunuşudur; "
    "günümüz Türkçesine çevrilmiş, sadeleştirilmiş veya yorumlanmış bir "
    "cümle DEĞİLDİR ve trans alanıyla KESİNLİKLE AYNI OLMAMALIDIR. "
    "translit alanına trans alanındaki gibi bir günümüz Türkçesi cümlesini "
    "veya kelimesini ASLA karıştırma; iki alanı sırayla, birbirine "
    "geçirmeden, birbirinden tamamen bağımsız olarak üret. ocr alanında "
    "**çift yıldızla** işaretlediğin her tahmini kısmın Latin karşılığını "
    "da aynı şekilde **çift yıldız** içine alarak yaz, işaretlemeyi ocr "
    "ile birebir tutarlı tut. "

    "trans: OCR metninin günümüz Türkçesi karşılığını yaz. translit/ocr "
    "alanlarında **çift yıldızla** işaretlenmiş (tahmin edilmiş) "
    "kısımların buradaki karşılığını da aynı şekilde **çift yıldız** "
    "içine alarak işaretle. "

    "trans_en: OCR metninin İngilizce çevirisini yaz. trans alanındaki "
    "aynı çeviri olsun, sadece dili İngilizce olsun. Burada da tahmin "
    "edilmiş kısımları aynı şekilde **çift yıldız** içine alarak işaretle. "

    "document_type: Belgenin türünü kısa yaz. "
    "Örnek: Ferman, Mektup, Gazete, Şiir / Manzume, Resmî Yazı. "

    "confidence: Okuma ve çeviri güvenini 0-100 arasında tam sayı olarak yaz. "

    "style: Belgenin dil ve üslubunu kısa belirt. "

    "summary: Yalnızca BELGENİN İÇERİĞİNİ 2-4 cümleyle özetle. "
    "JSON, schema, prompt, format, model, output, validation veya "
    "kendi çalışma sürecin hakkında ASLA açıklama yazma. "

    "key_points: Belgeden çıkarılabilen en önemli 2-5 bilgiyi yaz. "

    "people: Belgede açıkça geçen kişi isimlerini yaz. "
    "Yoksa boş liste döndür. "

    "places: Belgede açıkça geçen yer isimlerini yaz. "
    "Yoksa boş liste döndür. "

    "concepts: Belgede geçen önemli tarihî, idarî, dinî veya "
    "kültürel kavramları yaz. Yoksa boş liste döndür. "

    "script_type: Görüntüden güvenle anlaşılabiliyorsa yazı türünü belirt. "
    "Örnek: Nesih, Rik'a, Divanî, Ta'lik, Siyakat. "
    "Emin değilsen boş string döndür. "

    "script_purpose: Yazının/belgenin kullanım amacını kısa belirt. "
    "Emin değilsen boş string döndür. "

    "period_estimate: Metin veya görselden güvenle çıkarılabiliyorsa "
    "tahmini dönemi yaz. Emin değilsen boş string döndür. "

    "date_hijri: Belgede açıkça bulunan Hicrî tarihi yaz. "
    "Yoksa boş string döndür. "

    "date_gregorian: Belgede açıkça bulunan veya güvenle dönüştürülebilen "
    "Miladî tarihi yaz. Yoksa boş string döndür. "

    "notes: Okunamayan, belirsiz veya dikkat edilmesi gereken bir kısım "
    "varsa kısa genel bir not yaz. Yoksa boş string döndür. "

    "uncertain_lines: Belgede net okuyamadığın veya emin olmadığın HER "
    "satır/kelime için ayrı bir liste öğesi üret; notes alanındaki genel "
    "bir cümle yeterli değildir, her belirsizliği tek tek listele. Her öğe "
    "şu iki alanı içeren bir obje olsun: "
    "reference (hangi satır/bölüm olduğuna dair kısa referans, örn. "
    "\"3. satır\" ya da o satırın ilk birkaç kelimesi) ve "
    "guess (elindeki en olası tahminin, tahmin yürütemiyorsan boş string). "
    "Belgede belirsiz kısım yoksa boş liste döndür. "

    "UYARI: Belgenin içeriğinde bulunmayan isim, tarih, kişi, yer veya olay "
    "uydurma. JSON formatı hakkında açıklama üretme. Aynı cümleyi veya "
    "ifadeyi yanıt içinde birden fazla kez tekrar etme; her bilgiyi "
    "yalnızca bir kez ifade et."
)

def _index_translation_for_rag(result):
    """
    Index the modern Turkish translation for the document assistant.

    RAG indexing is best-effort: a failure here must never cause
    the main translation request to fail.
    """
    global document_retriever, document_qa

    try:
        if not isinstance(result, dict):
            return

        modern_text = (result.get("trans") or "").strip()

        if not modern_text:
            print(
                "[RAG INDEX] No modern Turkish text found; skipping.",
                flush=True,
            )
            return

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            print(
                "[RAG INDEX] LLM model is not configured; skipping.",
                flush=True,
            )
            return

        retriever = DocumentRetriever()

        chunks = retriever.index_document(modern_text)

        qa = DocumentQA(
            retriever=retriever,
            model=model,
        )

        # Replace the active document only after indexing succeeds.
        document_retriever = retriever
        document_qa = qa

        print(
            f"[RAG INDEX] Document indexed successfully "
            f"({len(chunks)} chunks).",
            flush=True,
        )

    except Exception as error:
        # RAG must never break the translation pipeline.
        print(
            f"[RAG INDEX] Failed: "
            f"{type(error).__name__}: {error}",
            flush=True,
        )


@app.route("/api/translate", methods=["POST"])
def translate_endpoint():
    """
    Run  OCR + Turkish translation + light content analysis on an
    enhanced image.

    Expects:
        multipart/form-data
        image: enhanced image file

    Returns:
        JSON with at minimum "ocr" and "trans". May also include optional
        analysis fields (translit, document_type, confidence, summary,
        key_points, people, places, concepts, script_type, script_purpose,
        period_estimate, date_hijri, date_gregorian, notes, uncertain_lines)
        when the model was able to determine them. uncertain_lines is a
        list of {"reference": ..., "guess": ...} objects, one per line/word
        the model could not read with confidence. Fields it couldn't
        determine are omitted or empty rather than guessed.

    LLM provider/model come from configs/llm.yaml, credentials come from
    the RELAY_API_KEY / RELAY_BASE_URL environment variables (.env locally,
    real env vars on the deployment platform). Neither ever appears in
    frontend code or in the config file.
    """
    # Captured first thing so the time budget below covers the entire
    # request, not just the OCR/translation cascade.
    request_start_time = time.monotonic()
    TIME_BUDGET_SECONDS = 240

    def _time_budget_exceeded():
        return (time.monotonic() - request_start_time) > TIME_BUDGET_SECONDS

    try:
        llm_config = get_llm_config()
    except (FileNotFoundError, ValueError) as error:
        print(
            f"[translate] get_llm_config() failed: "
            f"{type(error).__name__}: {error}\n"
            f"{traceback.format_exc()}",
            flush=True,
        )
        return jsonify(
            {
                "error": f"configs/llm.yaml okunamadı: {error}"
            }
        ), 500

    try:
        model = llm_config.get("model")
        generation = llm_config.get("generation") or {}
        temperature = generation.get("temperature", 0.2)
        max_tokens = generation.get("max_tokens", 4096)

        if not model:
            return jsonify(
                {
                    "error": (
                        "configs/llm.yaml içinde 'model' alanı "
                        "tanımlı değil."
                    )
                }
            ), 500

        # .strip() guards against a very common copy-paste mistake: a
        # stray trailing newline, space, or leftover quote character in
        # the environment variable value. A malformed key otherwise
        # fails with a confusing provider-side error instead of a clear
        # message, which is hard to debug blind — so we normalize here.
        api_key = (os.getenv("RELAY_API_KEY") or "").strip()
        base_url = (os.getenv("RELAY_BASE_URL") or "").strip()

        if not api_key:
            return jsonify(
                {
                    "error": "RELAY_API_KEY is not configured."
                }
            ), 500

        if not base_url:
            return jsonify(
                {
                    "error": "RELAY_BASE_URL is not configured."
                }
            ), 500

        client = OpenAI(api_key=api_key, base_url=base_url)

        if "image" not in request.files:
            return jsonify(
                {
                    "error": "image field is required."
                }
            ), 400

        uploaded_file = request.files["image"]

        if uploaded_file.filename == "":
            return jsonify(
                {
                    "error": "No image selected."
                }
            ), 400

    except Exception as error:
        # Nothing between config validation and the relay call should
        # normally raise, but if it does, this is the gap that used to
        # let an exception through with zero logging — make sure that
        # can never happen silently again.
        print(
            f"[translate] Unexpected error before relay call: "
            f"{type(error).__name__}: {error}\n"
            f"{traceback.format_exc()}",
            flush=True,
        )
        return jsonify(
            {
                "error": str(error)
            }
        ), 500

    # Time budget for the whole cascade (main attempt -> split-image ->
    # fallback model). Gunicorn's --timeout is set higher than this
    # (see Dockerfile), so if we're already close to it, entering another
    # multi-request stage would just get the worker killed mid-flight
    # instead of returning a clean JSON error. Checked before each stage
    # below rather than relied on as a hard deadline mid-stage.
    TIME_BUDGET_ERROR_RESPONSE = jsonify(
        {
            "error": (
                "Model, belgeyi işlerken aynı ifadeyi tekrar "
                "tekrar üretti veya yanıtı token sınırına "
                "takıldı. Lütfen tekrar deneyin; sorun devam "
                "ederse belgeyi daha küçük bir bölüm hâlinde "
                "göndermeyi deneyin."
            )
        }
    ), 502

    try:
        image_bytes = uploaded_file.read()
        messages = _build_messages(ANALYSIS_PROMPT, image_bytes)

        main_result = _get_relay_result(
            client,
            model,
            messages,
            temperature,
            max_tokens,
            max_repetition_attempts=2,
            label="main",
        )

        if main_result["ok"]:
            result = main_result["parsed"]
            _index_translation_for_rag(result)
            return jsonify(result)

        if main_result["reason"] == "network":
            return jsonify(
                main_result["message"]
            ), main_result["status_code"]

        # reason == "unusable": both normal attempts either looped,
        # returned empty/invalid JSON, or were missing ocr/trans, after
        # already retrying once internally. Instead of failing right
        # away, try splitting the image into top/bottom halves — a
        # difficult full-page image often succeeds once each half is a
        # simpler, smaller request.
        if _time_budget_exceeded():
            print(
                "[translate] Aborting cascade early: time budget (240s) "
                "exceeded before starting split-image strategy",
                flush=True,
            )
            return TIME_BUDGET_ERROR_RESPONSE

        print(
            "[translate] Falling back to split-image strategy after "
            "2 failed attempts",
            flush=True,
        )

        split_result = _try_split_image_translation(
            client,
            model,
            temperature,
            max_tokens,
            image_bytes,
            ANALYSIS_PROMPT,
        )

        if split_result is not None:
            _index_translation_for_rag(split_result)
            return jsonify(split_result)

        # Split strategy also failed. Last resort: try the whole
        # (unsplit) image once more with a different model, in case this
        # particular model is what's looping on this document.
        fallback_model = llm_config.get("fallback_model")

        if fallback_model:
            if _time_budget_exceeded():
                print(
                    "[translate] Aborting cascade early: time budget "
                    "(240s) exceeded before starting fallback-model "
                    "attempt",
                    flush=True,
                )
                return TIME_BUDGET_ERROR_RESPONSE

            print(
                f"[translate] Falling back to alternate model "
                f"({fallback_model}) after split-image strategy also "
                f"failed",
                flush=True,
            )

            fallback_result = _get_relay_result(
                client,
                fallback_model,
                messages,
                temperature,
                max_tokens,
                max_repetition_attempts=1,
                label="fallback-model",
            )

        if fallback_result["ok"]:
            result = fallback_result["parsed"]
            _index_translation_for_rag(result)
            return jsonify(result)

        return TIME_BUDGET_ERROR_RESPONSE

    except json.JSONDecodeError as error:
        print(
            f"[translate] JSONDecodeError parsing relay response: "
            f"{error}\n"
            f"{traceback.format_exc()}",
            flush=True,
        )
        return jsonify(
            {
                "error": (
                    "Relay response was not valid JSON."
                )
            }
        ), 502

    except Exception as error:
        print(
            f"[translate] Unhandled exception: "
            f"{type(error).__name__}: {error}\n"
            f"{traceback.format_exc()}",
            flush=True,
        )
        return jsonify(
            {
                "error": str(error)
            }
        ), 500

ASSISTANT_SYSTEM_PROMPT = (
    "Sen 'Divane' adlı Osmanlıca çeviri web uygulamasının yardımcı "
    "asistanısın. Kullanıcılara Osmanlı Türkçesi, Osmanlıca belgeler, "
    "eski yazı/Arap harfleri, tarih ve bu uygulamanın nasıl kullanılacağı "
    "hakkında kısa, açık ve doğru cevaplar ver. Emin olmadığın bir konuda "
    "kesin bilgi uydurma, bilmediğini söyle. Cevapların Türkçe ve "
    "kullanıcı dostu olsun, gereksiz uzatma."
)

@app.route("/api/assistant", methods=["POST"])
def assistant_endpoint():
    """
    Document-aware AI assistant.

    Answers questions primarily from the currently indexed document.
    The response format keeps the existing "reply" field so the
    current frontend remains compatible.

    Expects:
        JSON body:
        {
            "message": "...",
            "history": [...]
        }

    Returns:
        JSON:
        {
            "reply": "...",
            "sources": [...]
        }
    """
    global document_qa

    try:
        data = request.get_json(silent=True) or {}

        user_message = (
            data.get("message")
            or ""
        ).strip()

        if not user_message:
            return jsonify(
                {
                    "error": "message field is required."
                }
            ), 400

        if document_qa is None:
            return jsonify(
                {
                    "reply": (
                        "Belge hakkında yardımcı olabilmem için "
                        "önce bir belgenin işlenmesi gerekiyor."
                    ),
                    "sources": [],
                }
            )

        result = document_qa.answer(
            question=user_message,
            top_k=3,
        )

        return jsonify(
            {
                "reply": result["answer"],
                "answer_type": result["answer_type"],
                "related_information": result[
                    "related_information"
                ],
                "external_answer_available": result[
                    "external_answer_available"
                ],
                "sources": result["sources"],
            }
        )

    except Exception as error:
        print(
            f"[ASSISTANT RAG] "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "Assistant request failed.",
                "details": str(error),
            }
        ), 500

EXTERNAL_ASSISTANT_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının araştırma asistanısın.

Kullanıcı, daha önce yüklediği belgeyle ilgili bir soru sordu.
Belge içinde bu sorunun doğrudan cevabı bulunamadığı için,
kullanıcı özellikle belge dışı bilgilerle devam etmeyi seçti.

Görevin:
- Kullanıcının sorusunu genel tarihsel ve akademik bilginle cevaplamak.
- Belgeye ait bilgi ile belge dışı genel bilgiyi birbirine karıştırmamak.
- Kesin olmadığın bilgileri kesinmiş gibi sunmamak.
- Gerekirse "genel tarihsel bilgiye göre" gibi ifadeler kullanmak.
- Cevabı Türkçe, açık ve gereksiz uzatmadan vermek.
""".strip()


@app.route("/api/assistant/external", methods=["POST"])
def assistant_external_endpoint():
    """
    Answer a question using general model knowledge after the user
    explicitly chooses to continue outside the uploaded document.

    Expected JSON:
        {
            "message": "...",
            "document_context": "..."
        }

    Returns:
        {
            "reply": "...",
            "answer_type": "external"
        }
    """
    try:
        data = request.get_json(silent=True) or {}

        user_message = (
            data.get("message")
            or ""
        ).strip()

        document_context = (
            data.get("document_context")
            or ""
        ).strip()

        if not user_message:
            return jsonify(
                {
                    "error": "message field is required."
                }
            ), 400

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            return jsonify(
                {
                    "error": "LLM model is not configured."
                }
            ), 500

        api_key = (
            os.getenv("RELAY_API_KEY")
            or ""
        ).strip()

        base_url = (
            os.getenv("RELAY_BASE_URL")
            or ""
        ).strip()

        if not api_key:
            return jsonify(
                {
                    "error": "RELAY_API_KEY is not configured."
                }
            ), 500

        if not base_url:
            return jsonify(
                {
                    "error": "RELAY_BASE_URL is not configured."
                }
            ), 500

        client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )

        context_text = ""

        if document_context:
            context_text = (
                "\n\nBELGEDE BULUNAN YAKIN BİLGİ:\n"
                f"{document_context}"
            )

        user_prompt = (
            f"KULLANICI SORUSU:\n"
            f"{user_message}"
            f"{context_text}"
        )

        completion = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": EXTERNAL_ASSISTANT_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.2,
            max_tokens=900,
        )

        reply_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

        if not reply_text:
            return jsonify(
                {
                    "error": (
                        "Model did not produce an answer."
                    )
                }
            ), 502

        return jsonify(
            {
                "reply": reply_text,
                "answer_type": "external",
            }
        )

    except Exception as error:
        print(
            f"[ASSISTANT EXTERNAL] "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "External assistant request failed.",
                "details": str(error),
            }
        ), 500

@app.route("/api/ai/suggestions", methods=["POST"])
def ai_suggestions():
    """
    Generate AI alternatives for an uncertain reading,
    interpretation or translation.

    Expected JSON:
        {
            "text": "..."
        }
    """
    try:
        data = request.get_json(silent=True) or {}

        text = (
            data.get("text")
            or ""
        ).strip()

        if not text:
            return jsonify(
                {
                    "error": "Text is required."
                }
            ), 400

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            return jsonify(
                {
                    "error": "LLM model is not configured."
                }
            ), 500

        generator = AISuggestionGenerator(
            model=model,
        )

        result = generator.generate(
            text=text,
        )

        return jsonify(
            {
                "success": True,
                "suggestion": result,
            }
        )

    except Exception as error:
        print(
            f"[AI SUGGESTIONS] "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "AI suggestion generation failed.",
                "details": str(error),
            }
        ), 500

    
@app.route("/api/ai/analyze-selection", methods=["POST"])
def ai_analyze_selection():
    """
    Analyze a user-selected section of document text.

    Expected JSON:
        {
            "text": "..."
        }

    Returns AI-generated analysis of only the selected text.
    """
    try:
        data = request.get_json(silent=True) or {}

        selected_text = (
            data.get("text")
            or ""
        ).strip()

        if not selected_text:
            return jsonify(
                {
                    "error": "Selected text is required."
                }
            ), 400

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            return jsonify(
                {
                    "error": "LLM model is not configured."
                }
            ), 500

        analyzer = SelectedTextAnalyzer(
            model=model,
        )

        result = analyzer.analyze(
            selected_text=selected_text,
        )

        return jsonify(
            {
                "success": True,
                "analysis": result,
            }
        )

    except Exception as error:
        print(
            f"[AI SELECTION] "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "Selected text analysis failed.",
                "details": str(error),
            }
        ), 500

@app.route("/api/ai/entity-filter", methods=["GET"])
def ai_entity_filter():
    global document_retriever

    if (
        document_retriever is None
        or not document_retriever.document_indexed
        or not document_retriever.document_text
    ):
        return jsonify(
            {
                "error": (
                    "Entity classification requires "
                    "an indexed document."
                )
            }
        ), 400

    try:
        model = get_llm_config().get("model")

        classifier = EntityFilterClassifier(
            model=model,
        )

        entities = classifier.classify(
            document_text=document_retriever.document_text,
        )

        return jsonify(
            {
                "success": True,
                "entities": entities,
            }
        )

    except Exception as error:
        print(
            "[ENTITY FILTER]",
            type(error).__name__,
            str(error),
            flush=True,
        )

        return jsonify(
            {
                "error": (
                    "Entity classification failed."
                ),
                "details": str(error),
            }
        ), 500

    
@app.route("/api/ai/research-suggestions", methods=["GET"])
def ai_research_suggestions():
    global document_retriever

    if (
        document_retriever is None
        or not document_retriever.document_indexed
        or not document_retriever.document_text
    ):
        return jsonify(
            {
                "error": (
                    "Research suggestions require "
                    "an indexed document."
                )
            }
        ), 400

    try:
        model = get_llm_config().get("model")

        generator = ResearchSuggestionGenerator(
            model=model,
        )

        suggestions = generator.generate(
            document_text=document_retriever.document_text,
        )

        return jsonify(
            {
                "success": True,
                "suggestions": suggestions,
            }
        )

    except Exception as error:
        print(
            "[RESEARCH SUGGESTIONS]",
            type(error).__name__,
            str(error),
            flush=True,
        )

        return jsonify(
            {
                "error": (
                    "Research suggestion generation failed."
                ),
                "details": str(error),
            }
        ), 500
    
@app.route("/api/ai/suggested-questions", methods=["GET"])
def ai_suggested_questions():
    """
    Generate suggested questions for the currently indexed document.

    The active document text is reused from the RAG retriever,
    so the frontend does not need to send the document again.
    """
    global document_retriever

    try:
        if (
            document_retriever is None
            or not document_retriever.document_indexed
            or not document_retriever.document_text
        ):
            return jsonify(
                {
                    "error": "No document has been indexed yet."
                }
            ), 400

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            return jsonify(
                {
                    "error": "LLM model is not configured."
                }
            ), 500

        generator = DocumentQuestionGenerator(
            model=model,
        )

        questions = generator.generate(
            document_text=document_retriever.document_text,
        )

        return jsonify(
            {
                "success": True,
                "questions": questions,
            }
        )

    except Exception as error:
        print(
            f"[AI QUESTIONS] "
            f"{type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "Question generation failed.",
                "details": str(error),
            }
        ), 500

    
@app.route("/api/ai/index-document", methods=["POST"])
def ai_index_document():
    """
    Index modern Turkish document text for RAG-based
    document question answering.

    Expected JSON:
        {
            "text": "..."
        }
    """
    global document_retriever, document_qa

    try:
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()

        if not text:
            return jsonify(
                {
                    "error": "Document text is required."
                }
            ), 400

        llm_config = get_llm_config()
        model = llm_config.get("model")

        if not model:
            return jsonify(
                {
                    "error": "LLM model is not configured."
                }
            ), 500

        retriever = DocumentRetriever()

        chunks = retriever.index_document(text)

        qa = DocumentQA(
            retriever=retriever,
            model=model,
        )

        # Replace the active document only after the new
        # document has been indexed successfully.
        document_retriever = retriever
        document_qa = qa

        return jsonify(
            {
                "success": True,
                "chunk_count": len(chunks),
            }
        )

    except Exception as error:
        print(
            f"[AI INDEX] {type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "Document indexing failed.",
                "details": str(error),
            }
        ), 500


@app.route("/api/ai/ask", methods=["POST"])
def ai_ask_document():
    """
    Answer a question using only the currently indexed document.

    Expected JSON:
        {
            "question": "..."
        }
    """
    global document_qa

    try:
        if document_qa is None:
            return jsonify(
                {
                    "error": (
                        "No document has been indexed yet."
                    )
                }
            ), 400

        data = request.get_json(silent=True) or {}
        question = (data.get("question") or "").strip()

        if not question:
            return jsonify(
                {
                    "error": "Question is required."
                }
            ), 400

        result = document_qa.answer(
            question=question,
            top_k=3,
        )

        return jsonify(
            {
                "success": True,
                "answer": result["answer"],
                "sources": result["sources"],
            }
        )

    except Exception as error:
        print(
            f"[AI ASK] {type(error).__name__}: {error}",
            flush=True,
        )

        return jsonify(
            {
                "error": "Document question answering failed.",
                "details": str(error),
            }
        ), 500
    
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok"
        }
    )


# --- TEMPORARY DEBUG ENDPOINT — remove once the RelayGPU 403 is diagnosed ---
# Intentionally unauthenticated so the JSON can be read by just navigating
# to the URL in a browser, no Render log access needed. Do not leave in
# production longer than needed for this investigation.
@app.route("/api/debug-relay", methods=["GET"])
def debug_relay():
    api_key = (os.getenv("RELAY_API_KEY") or "").strip()
    base_url = (os.getenv("RELAY_BASE_URL") or "").strip()

    if not api_key:
        return jsonify({"ok": False, "error": "RELAY_API_KEY is not configured."})

    if not base_url:
        return jsonify({"ok": False, "error": "RELAY_BASE_URL is not configured."})

    client = OpenAI(api_key=api_key, base_url=base_url)

    try:
        completion = client.chat.completions.create(
            model="google/gemini-3.5-flash",
            messages=[
                {"role": "user", "content": "merhaba, bu bir test"}
            ],
            timeout=30,
        )
        return jsonify(
            {
                "ok": True,
                "reply": completion.choices[0].message.content,
            }
        )

    except openai.APIStatusError as error:
        try:
            relay_body = error.response.text
        except Exception:
            relay_body = getattr(error, "body", None)

        return jsonify(
            {
                "ok": False,
                "status_code": error.status_code,
                "details": str(error),
                "relay_response_body": relay_body,
            }
        )

    except Exception as error:
        return jsonify(
            {
                "ok": False,
                "error": str(error),
            }
        )
# --- end TEMPORARY DEBUG ENDPOINT ---


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
    )