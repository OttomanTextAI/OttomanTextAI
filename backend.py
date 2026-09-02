import base64
import json
import os
import re
import traceback
from io import BytesIO
from pathlib import Path

import time
import random

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
import openai
from openai import OpenAI

from src.common.config import load_yaml_config
from src.image_enhancement.enhance import enhance_image

# Loads RELAY_API_KEY / RELAY_BASE_URL / GEMINI_API_KEY from a local .env for
# development. In production (Render) these are set directly as environment
# variables and no .env file is present, so this is a no-op there.
load_dotenv()

app = Flask(__name__)

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
        "printed-degraded",
    ).strip().lower()

    if profile not in {
        "printed",
        "printed-degraded",
        "delicate",
        "manuscript",
    }:
        return jsonify(
            {
                "error": (
                    "profile must be one of: "
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

    "ocr: Görüntüde gerçekten okuyabildiğin Osmanlıca metni "
    "Arap harfleriyle yaz. Latin harfi kullanma. Okuyamadığın veya emin "
    "olmadığın her harf/kelime/satır için onu ASLA sessizce tahminle "
    "doldurma; metnin o noktasına [okunamadı] ya da elindeki en olası "
    "tahminle birlikte [belirsiz: en olası \"X\"] işaretini koy ve bu "
    "durumu hem notes hem uncertain_lines alanında ayrıca belirt. Emin "
    "olmadığın bir yerde dürüstçe \"okuyamadım\" demek, yanlış bir "
    "tahminde bulunmaktan HER ZAMAN daha değerlidir. "

    "translit: ocr alanındaki metnin Latin harflerine harf çevirisini "
    "(transliterasyon) yaz. Emin olmadığın kısımlarda tahmin uydurma, "
    "[okunamadı] / [belirsiz: en olası \"X\"] işaretlerini ocr ile tutarlı "
    "şekilde koru. "

    "trans: OCR metninin günümüz Türkçesi karşılığını yaz. "

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
    try:
        llm_config = get_llm_config()
    except (FileNotFoundError, ValueError) as error:
        return jsonify(
            {
                "error": f"configs/llm.yaml okunamadı: {error}"
            }
        ), 500

    model = llm_config.get("model")
    generation = llm_config.get("generation") or {}
    temperature = generation.get("temperature", 0.2)
    max_tokens = generation.get("max_tokens", 4096)

    if not model:
        return jsonify(
            {
                "error": "configs/llm.yaml içinde 'model' alanı tanımlı değil."
            }
        ), 500

    # .strip() guards against a very common copy-paste mistake: a stray
    # trailing newline, space, or leftover quote character in the
    # environment variable value. A malformed key otherwise fails with a
    # confusing provider-side error instead of a clear message, which is
    # hard to debug blind — so we normalize here.
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

    try:
        image_bytes = uploaded_file.read()

        encoded_image = base64.b64encode(
            image_bytes
        ).decode("utf-8")

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": ANALYSIS_PROMPT,
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

        completion = None
        max_attempts = 3
        retry_delays = [2, 5]

        for attempt in range(max_attempts):
            try:
                completion = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=120,
                )
                break

            except (openai.APITimeoutError, openai.APIConnectionError) as error:
                if attempt < max_attempts - 1:
                    delay = retry_delays[attempt]

                    print(
                        f"[translate] Relay timeout/connection error. "
                        f"Retrying in {delay}s "
                        f"({attempt + 2}/{max_attempts})...",
                        flush=True,
                    )

                    time.sleep(delay)
                    continue

                return jsonify(
                    {
                        "error": (
                            "Relay yanıt vermedi (zaman aşımı). "
                            "Lütfen birkaç saniye sonra tekrar deneyin."
                        )
                    }
                ), 504

            except openai.RateLimitError as error:
                if attempt < max_attempts - 1:
                    delay = retry_delays[attempt]

                    print(
                        f"[translate] Relay rate limit. "
                        f"Retrying in {delay}s "
                        f"({attempt + 2}/{max_attempts})...",
                        flush=True,
                    )

                    time.sleep(delay)
                    continue

                return jsonify(
                    {
                        "error": "Relay API rate limit aşıldı.",
                        "details": str(error),
                    }
                ), 429

            except openai.APIStatusError as error:
                if (
                    error.status_code in {500, 502, 503, 504}
                    and attempt < max_attempts - 1
                ):
                    delay = retry_delays[attempt]

                    print(
                        f"[translate] Relay temporary error "
                        f"{error.status_code}. "
                        f"Retrying in {delay}s "
                        f"({attempt + 2}/{max_attempts})...",
                        flush=True,
                    )

                    time.sleep(delay)
                    continue

                # str(error) is usually just a short summary (e.g. "Error
                # code: 403 - blocked"). The full JSON body — quota,
                # key restriction, content-policy reason, etc. — is on the
                # underlying httpx response, so log that explicitly too;
                # it's the only way to see it in the Render logs.
                try:
                    relay_body = error.response.text
                except Exception:
                    relay_body = getattr(error, "body", None)

                print(
                    f"[translate] Relay API error {error.status_code}. "
                    f"Full response body: {relay_body}",
                    flush=True,
                )

                return jsonify(
                    {
                        "error": "Relay API request failed.",
                        "details": str(error),
                    }
                ), error.status_code

        # Retry bittikten SONRA cevabı kontrol ediyoruz.
        if completion is None:
            return jsonify(
                {
                    "error": "Relay API yanıtı alınamadı."
                }
            ), 502

        raw_text = completion.choices[0].message.content or ""
        finish_reason = completion.choices[0].finish_reason

        # A response cut off by the token limit or looping on the same
        # sentence/line is a known failure mode that otherwise surfaces as
        # a confusing "invalid JSON" 502. Catch it here with a clear
        # message instead of letting the JSON parser fail cryptically.
        if finish_reason == "length" or has_excessive_repetition(raw_text):
            return jsonify(
                {
                    "error": (
                        "Model, belgeyi işlerken aynı ifadeyi tekrar tekrar "
                        "üretti veya yanıtı token sınırına takıldı. Lütfen "
                        "tekrar deneyin; sorun devam ederse belgeyi daha "
                        "küçük bir bölüm hâlinde göndermeyi deneyin."
                    )
                }
            ), 502

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
            return jsonify(
                {
                    "error": (
                        "Model transkripsiyon veya çeviri üretemedi."
                    )
                }
            ), 502

        result = {
            "ocr": parsed.get("ocr", ""),
            "trans": parsed.get("trans", ""),
        }

        optional_string_fields = [
            "translit",
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

        return jsonify(result)

    except json.JSONDecodeError:
        return jsonify(
            {
                "error": (
                    "Relay response was not valid JSON."
                )
            }
        ), 502

    except Exception as error:
        return jsonify(
            {
                "error": str(error)
            }
        ), 500

ASSISTANT_SYSTEM_PROMPT = (
    "Sen 'Osmanlıca Çeviri Sistemi' adlı web uygulamasının yardımcı "
    "asistanısın. Kullanıcılara Osmanlı Türkçesi, Osmanlıca belgeler, "
    "eski yazı/Arap harfleri, tarih ve bu uygulamanın nasıl kullanılacağı "
    "hakkında kısa, açık ve doğru cevaplar ver. Emin olmadığın bir konuda "
    "kesin bilgi uydurma, bilmediğini söyle. Cevapların Türkçe ve "
    "kullanıcı dostu olsun, gereksiz uzatma."
)


@app.route("/api/assistant", methods=["POST"])
def assistant_endpoint():
    """
    Text-only chat assistant for general questions about Ottoman Turkish
    and how to use the app. Separate from /api/translate; does not touch
    image OCR/enhancement logic.

    Expects:
        JSON body: { "message": "...", "history": [{"role": "user"|"bot", "text": "..."}] }

    Returns:
        JSON: { "reply": "..." }
    """
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"').strip("'")

    if not api_key:
        return jsonify(
            {
                "error": "GEMINI_API_KEY is not configured."
            }
        ), 500

    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    history = data.get("history") or []

    if not user_message:
        return jsonify(
            {
                "error": "message field is required."
            }
        ), 400

    model = "gemini-3.6-flash"

    url = (
        "https://generativelanguage.googleapis.com/"
        f"v1beta/models/{model}:generateContent"
    )

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    contents = [
        {"role": "user", "parts": [{"text": ASSISTANT_SYSTEM_PROMPT}]},
        {"role": "model", "parts": [{"text": "Anladım, yardımcı olmaya hazırım."}]},
    ]

    for turn in history[-10:]:
        role = "user" if turn.get("role") == "user" else "model"
        text = (turn.get("text") or "").strip()
        if text:
            contents.append({"role": role, "parts": [{"text": text}]})

    contents.append({"role": "user", "parts": [{"text": user_message}]})

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
        },
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=45,
        )

        if not response.ok:
            return jsonify(
                {
                    "error": "Gemini API request failed.",
                    "details": response.text,
                }
            ), response.status_code

        response_data = response.json()

        reply_text = (
            response_data
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        ).strip()

        if not reply_text:
            return jsonify(
                {
                    "error": "Model bir yanıt üretemedi."
                }
            ), 502

        return jsonify({"reply": reply_text})

    except requests.exceptions.Timeout:
        return jsonify(
            {
                "error": "Sunucu yanıt vermedi (zaman aşımı). Lütfen tekrar deneyin."
            }
        ), 504

    except Exception as error:
        return jsonify(
            {
                "error": str(error)
            }
        ), 500

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok"
        }
    )


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
    )