import base64
import json
import os
from io import BytesIO

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


@app.route("/api/translate", methods=["POST"])
def translate_endpoint():
    """
    Run Gemini OCR + Turkish translation on an enhanced image.

    Expects:
        multipart/form-data
        image: enhanced image file

    Returns:
        JSON:
        {
            "ocr": "...",
            "trans": "..."
        }
    """
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        return jsonify(
            {
                "error": "GEMINI_API_KEY is not configured."
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

        prompt = (
            "Lütfen bu Osmanlıca belgenin tüm satırlarını ve "
            "paragraflarını eksiksiz transkribe et ve çevir. "
            "ocr alanına yalnızca Arap harfli Osmanlıca metni yaz. "
            "Latin harfi karıştırma. "
            "trans alanına metnin günümüz Türkçesi karşılığını yaz. "
            "Yanıt yalnızca geçerli JSON olsun: "
            '{"ocr":"...","trans":"..."}'
        )

        model = "gemini-2.5-flash"

        url = (
            "https://generativelanguage.googleapis.com/"
            f"v1beta/models/{model}:generateContent"
            f"?key={api_key}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        },
                        {
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": encoded_image,
                            }
                        },
                    ]
                }
            ]
        }

        response = requests.post(
            url,
            json=payload,
            timeout=120,
        )

        if not response.ok:
            return jsonify(
                {
                    "error": (
                        "Gemini API request failed."
                    ),
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
            cleaned_text = cleaned_text.replace(
                "```json",
                ""
            ).replace(
                "```",
                ""
            ).strip()

        parsed = json.loads(
            cleaned_text
        )

        return jsonify(
            {
                "ocr": parsed.get("ocr", ""),
                "trans": parsed.get("trans", ""),
            }
        )

    except json.JSONDecodeError:
        return jsonify(
            {
                "error": (
                    "Gemini response was not valid JSON."
                )
            }
        ), 502

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