import base64
import json
import os
from io import BytesIO

import time
import random

import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from src.image_enhancement.enhance import enhance_image


app = Flask(__name__)
CORS(app)


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

        output_bytes = enhance_image(
            input_bytes,
            profile=profile,
        )

        return send_file(
            BytesIO(output_bytes),
            mimetype="image/png",
            as_attachment=False,
            download_name="enhanced.png",
        )

    except Exception as error:
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

    "ocr: Görüntüde gerçekten okuyabildiğin Osmanlıca metni "
    "Arap harfleriyle yaz. Latin harfi kullanma. "

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
    "varsa kısa not yaz. Yoksa boş string döndür. "

    "UYARI: Belgenin içeriğinde bulunmayan isim, tarih, kişi, yer veya olay "
    "uydurma. JSON formatı hakkında açıklama üretme."
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
        analysis fields (document_type, confidence, summary, key_points,
        people, places, concepts, script_type, script_purpose,
        period_estimate, date_hijri, date_gregorian, notes) when the model
        was able to determine them. Fields it couldn't determine are
        omitted or empty rather than guessed.
    """
    # .strip() guards against a very common copy-paste mistake: a stray
    # trailing newline, space, or leftover quote character in the
    # environment variable value. Google's API treats a malformed key as
    # "no credential at all" and returns a confusing OAuth-related 401
    # instead of a clear "invalid key" message, which is hard to debug
    # blind — so we normalize here and log a masked version of what we
    # actually received.
    api_key = (os.getenv("RELAY_API_KEY") or "").strip()
    base_url = (
        os.getenv("RELAY_BASE_URL")
        or "https://relaygpu.com/v2/openai/v1"
    ).strip()

    if not api_key:
        return jsonify(
            {
                "error": "RELAY_API_KEY is not configured."
            }
        ), 500


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

        model = "VISION_MODEL_ADI"

        url = f"{base_url}/chat/completions"

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": [
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
            ],
            "temperature": 0.2,
        }
        



        response = None

        max_attempts = 3
        retry_delays = [2, 5]

        for attempt in range(max_attempts):
            try:
                response = requests.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=45,
                )

            except requests.exceptions.Timeout:
                if attempt < max_attempts - 1:
                    delay = retry_delays[attempt]

                    print(
                        f"[translate] Relay timeout. "
                        f"Retrying in {delay}s "
                        f"({attempt + 2}/{max_attempts})...",
                        flush=True,
                    )

                    time.sleep(delay)
                    continue

                raise

            if response.status_code not in {
                429,
                500,
                502,
                503,
                504,
            }:
                break

            if attempt < max_attempts - 1:
                delay = retry_delays[attempt]

                print(
                    f"[translate] Realy temporary error "
                    f"{response.status_code}. "
                    f"Retrying in {delay}s "
                    f"({attempt + 2}/{max_attempts})...",
                    flush=True,
                )

                time.sleep(delay)

        # Retry bittikten SONRA cevabı kontrol ediyoruz.
        if response is None:
            return jsonify(
                {
                    "error": "Relay API yanıtı alınamadı."
                }
            ), 502

        if not response.ok:
            return jsonify(
                {
                    "error": "Relay API request failed.",
                    "details": response.text,
                }
            ), response.status_code

        response_data = response.json()

        print(
            "[translate] FULL RELAY RESPONSE:",
            json.dumps(
                response_data,
                ensure_ascii=False,
                indent=2,
            )[:10000],
            flush=True,
        )
        

        response_data = response.json()

        raw_text = (
            response_data
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

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

        parsed = json.loads(cleaned_text)

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

    except requests.exceptions.Timeout:
        return jsonify(
            {
                "error": (
                    "Relay yanıt vermedi (zaman aşımı). "
                    "Lütfen birkaç saniye sonra tekrar deneyin."
                )
            }
        ), 504

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