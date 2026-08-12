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
        "printed",
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
    "Lütfen bu Osmanlıca belgenin tüm satırlarını ve paragraflarını "
    "eksiksiz transkribe et, çevir ve kısa bir içerik analizi çıkar. "
    "ocr alanına yalnızca Arap harfli Osmanlıca metni yaz, Latin harfi "
    "karıştırma. trans alanına metnin günümüz Türkçesi karşılığını yaz. "
    "Diğer analiz alanlarını YALNIZCA metinden gerçekten çıkarabildiğin "
    "kadarıyla doldur; emin olmadığın bir alanı boş string (\"\") olarak "
    "bırak, ASLA uydurma bilgi verme. confidence alanına transkripsiyon ve "
    "çeviriye olan güvenini 0-100 arasında bir tam sayı olarak yaz. "
    "Yanıt YALNIZCA şu alanları içeren geçerli bir JSON olsun: "
    '{"ocr":"...", "trans":"...", "document_type":"...", '
    '"confidence": 0, "style":"...", "summary":"...", '
    '"key_points":["...","..."], "people":["..."], "places":["..."], '
    '"concepts":["..."], "script_type":"...", "script_purpose":"...", '
    '"period_estimate":"...", "date_hijri":"...", "date_gregorian":"...", '
    '"notes":"..."}'
)


@app.route("/api/translate", methods=["POST"])
def translate_endpoint():
    """
    Run Gemini OCR + Turkish translation + light content analysis on an
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
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"').strip("'")

    if not api_key:
        return jsonify(
            {
                "error": "GEMINI_API_KEY is not configured."
            }
        ), 500

    # Real Gemini API keys are long (~39 chars) and start with "AIza".
    # This isn't a full validation, just an early, cheap sanity check so
    # a malformed key fails with a clear message instead of a cryptic
    # Google-side 401.
    masked = f"{api_key[:4]}...{api_key[-4:]} (len={len(api_key)})" if len(api_key) > 8 else "(too short)"

    # If "AIzaSy" (the standard Google API key prefix) shows up more than
    # once inside the value, two keys got concatenated somewhere upstream
    # of this code (e.g. a stale value plus a new paste, or the variable
    # being set in more than one place — a .env file AND the Render
    # dashboard, for example). This pinpoints that case precisely instead
    # of just reporting a wrong length.
    prefix_occurrences = api_key.count("AIzaSy")
    print(f"[translate] Using GEMINI_API_KEY: {masked} | 'AIzaSy' occurrences in value: {prefix_occurrences}")

    if prefix_occurrences > 1:
        return jsonify(
            {
                "error": (
                    "GEMINI_API_KEY içinde birden fazla anahtar birleşmiş "
                    "görünüyor (değer içinde 'AIzaSy' 1'den fazla kez "
                    "geçiyor). Bu değişken muhtemelen birden fazla yerde "
                    "tanımlı (örn. hem Render Environment sekmesinde hem "
                    "bir .env dosyasında, ya da bir Environment Group "
                    "içinde). Sadece TEK bir yerde, tek bir değer olarak "
                    "tanımlı olduğundan emin olun."
                ),
                "debug_masked_key": masked,
            }
        ), 500

    if len(api_key) < 30 or " " in api_key or "\n" in api_key:
        return jsonify(
            {
                "error": (
                    "GEMINI_API_KEY bozuk görünüyor (uzunluk veya içerik "
                    "beklenenden farklı). Render > Environment sekmesinde "
                    "değeri kontrol edin: başında/sonunda boşluk, tırnak "
                    "veya satır sonu olmamalı."
                ),
                "debug_masked_key": masked,
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

        model = "gemini-3.6-flash"

        url = (
            "https://generativelanguage.googleapis.com/"
            f"v1beta/models/{model}:generateContent"
        )

        headers = {
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": ANALYSIS_PROMPT
                        },
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": encoded_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "object",
                    "properties": {
                        "ocr": {
                            "type": "string"
                        },
                        "trans": {
                            "type": "string"
                        },
                        "document_type": {
                            "type": "string"
                        },
                        "confidence": {
                            "type": "integer"
                        },
                        "style": {
                            "type": "string"
                        },
                        "summary": {
                            "type": "string"
                        },
                        "key_points": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "people": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "places": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "concepts": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        },
                        "script_type": {
                            "type": "string"
                        },
                        "script_purpose": {
                            "type": "string"
                        },
                        "period_estimate": {
                            "type": "string"
                        },
                        "date_hijri": {
                            "type": "string"
                        },
                        "date_gregorian": {
                            "type": "string"
                        },
                        "notes": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "ocr",
                        "trans"
                    ]
                }
            }
        }



        response = None

        for attempt in range(2):
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=45,
            )

            if response.status_code not in {
                429,
                500,
                502,
                503,
                504,
            }:
                break

            if attempt == 0:
                print(
                    f"[translate] Gemini temporary error "
                    f"{response.status_code}. Retrying once...",
                    flush=True,
                )
                time.sleep(2)

        # Retry bittikten SONRA cevabı kontrol ediyoruz.
        if response is None:
            return jsonify(
                {
                    "error": "Gemini API yanıtı alınamadı."
                }
            ), 502

        if not response.ok:
            return jsonify(
                {
                    "error": "Gemini API request failed.",
                    "details": response.text,
                }
            ), response.status_code

        response_data = response.json()

        raw_text = (
            response_data
            .get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
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
            "[translate] RAW GEMINI RESPONSE:",
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
                    "Gemini response was not valid JSON."
                )
            }
        ), 502

    except requests.exceptions.Timeout:
        return jsonify(
            {
                "error": (
                    "Gemini yanıt vermedi (zaman aşımı). "
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