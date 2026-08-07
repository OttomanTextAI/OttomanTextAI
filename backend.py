from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from io import BytesIO

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
        profile: printed or manuscript

    Returns:
        Enhanced PNG image.
    """
    if "image" not in request.files:
        return jsonify(
            {
                "error": "image field is required."
            }
        ), 400

    uploaded_file = request.files[
        "image"
    ]

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
        "manuscript",
    }:
        return jsonify(
            {
                "error": (
                    "profile must be "
                    "'printed' or 'manuscript'."
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