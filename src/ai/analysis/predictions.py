import json
import os

from openai import OpenAI

from src.ai.context_optimizer import optimize_document_context


PREDICTION_SYSTEM_PROMPT = """
Sen Osmanlıca belge analizi yapan akademik bir AI asistansın.

Görevin:
- Verilen belge metninden güvenli çıkarımlar yapmak.
- Belgenin içeriğine dayanarak kullanıcıya yararlı inceleme önerileri sunmak.
- Belge dışında kesin bilgi uydurmamak.
- Belge metninde açık dayanağı olmayan kurum, kişi, unvan, arşiv, mevzuat veya dönem adı üretme.
- Recommendation alanında yalnızca belge metninden doğrudan türetilebilecek inceleme adımları öner.
- Genel tarih bilgisini belge bilgisiymiş gibi kullanma.
- Tahmin ile doğrudan belge bilgisini birbirinden ayırmak.
- Her tahmine 0.0 ile 1.0 arasında confidence vermek.
- Emin olmadığın çıkarımlarda düşük confidence kullanmak.
- Kısa ve doğrudan cevap vermek.
- Sadece geçerli JSON döndürmek.
- Markdown veya ek açıklama yazmamak.

JSON formatı:

{
  "predictions": [
    {
      "prediction": "Belgeden çıkarılabilecek kısa tahmin.",
      "confidence": 0.82,
      "reason": "Belgedeki dayanak."
    }
  ],
  "recommendations": [
    {
      "recommendation": "Kullanıcı için sonraki inceleme önerisi.",
      "reason": "Neden yararlı olduğu."
    }
  ]
}

Kurallar:
- En fazla 3 prediction üret.
- En fazla 3 recommendation üret.
- reason alanları kısa olsun.
- Belgede yeterli dayanak yoksa listeyi boş bırak.
"""


class DocumentPredictionGenerator:
    def __init__(self, model: str):
        self.model = model

        self.client = OpenAI(
            api_key=os.getenv("RELAY_API_KEY"),
            base_url=os.getenv("RELAY_BASE_URL"),
        )

    def generate(self, document_text: str) -> dict:
        document_text = document_text.strip()

        if not document_text:
            raise ValueError("Document text is required.")

        context = optimize_document_context(
            document_text,
            max_chars=14000,
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": PREDICTION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "BELGE METNİ:\n"
                        f"{context}"
                    ),
                },
            ],
            temperature=0.1,
            max_tokens=1800,
        )

        answer_text = (
            response.choices[0].message.content or ""
        ).strip()

        if answer_text.startswith("```"):
            answer_text = answer_text.strip("`").strip()

            if answer_text.startswith("json"):
                answer_text = answer_text[4:].strip()

        try:
            result = json.loads(answer_text)

        except json.JSONDecodeError:
            start = answer_text.find("{")
            end = answer_text.rfind("}")

            if start != -1 and end != -1 and end > start:
                try:
                    result = json.loads(
                        answer_text[start:end + 1]
                    )
                except json.JSONDecodeError:
                    result = {}
            else:
                result = {}

        predictions = result.get(
            "predictions",
            [],
        )

        recommendations = result.get(
            "recommendations",
            [],
        )

        if not isinstance(predictions, list):
            predictions = []

        if not isinstance(recommendations, list):
            recommendations = []

        cleaned_predictions = []

        for item in predictions[:3]:
            if not isinstance(item, dict):
                continue

            prediction = str(
                item.get("prediction", "")
            ).strip()

            reason = str(
                item.get("reason", "")
            ).strip()

            confidence = item.get(
                "confidence",
                0.0,
            )

            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.0

            confidence = max(
                0.0,
                min(confidence, 1.0),
            )

            if prediction:
                cleaned_predictions.append({
                    "prediction": prediction,
                    "confidence": confidence,
                    "reason": reason,
                })

        cleaned_recommendations = []

        for item in recommendations[:3]:
            if not isinstance(item, dict):
                continue

            recommendation = str(
                item.get("recommendation", "")
            ).strip()

            reason = str(
                item.get("reason", "")
            ).strip()

            if recommendation:
                cleaned_recommendations.append({
                    "recommendation": recommendation,
                    "reason": reason,
                })

        return {
            "predictions": cleaned_predictions,
            "recommendations": cleaned_recommendations,
        }