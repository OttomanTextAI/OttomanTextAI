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
- Recommendation alanında belge üzerinde yapılabilecek anlamlı sonraki inceleme adımları öner.
- Örneğin kişi, yer, tarih, olay, kavram, dil, dönem veya belge türü açısından daha ayrıntılı inceleme önerebilirsin.
- Ancak belgede hiç geçmeyen özel kişi, kurum, arşiv veya olay isimleri uydurma.
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
- Belge metni anlamlı ve boş değilse en az 1 prediction üret.
- Belge metni anlamlı ve boş değilse en az 1 recommendation üret.
- En fazla 3 prediction üret.
- En fazla 3 recommendation üret.
- prediction alanları yalnızca belge metninden çıkarılabilir yorumlar olsun.
- recommendation alanları belge üzerinde yapılabilecek sonraki analiz veya inceleme adımları olsun.
- reason alanları kısa ve belgeye dayalı olsun.
- Kesin olmayan çıkarımları düşük confidence ile belirt.
- Yalnızca belge tamamen anlamsız, boş veya analiz edilemeyecek durumdaysa listeyi boş bırak.
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
            max_tokens=2200,
        )

        answer_text = (
            response.choices[0].message.content or ""
        ).strip()

        print(
            "[AI PREDICTIONS] Raw model response:",
            repr(answer_text),
            flush=True,
        )

        if answer_text.startswith("```"):
            answer_text = answer_text.strip("`").strip()

            if answer_text.startswith("json"):
                answer_text = answer_text[4:].strip()

        try:
            result = json.loads(answer_text)

        except json.JSONDecodeError:
            print(
                "[AI PREDICTIONS] Invalid or truncated JSON. Retrying...",
                flush=True,
            )

            retry_response = self.client.chat.completions.create(
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
                            f"{context}\n\n"
                            "Önceki cevap geçerli JSON olarak tamamlanamadı. "
                            "Bu kez çok kısa cevap ver. "
                            "En fazla 2 prediction ve 2 recommendation üret. "
                            "Reason alanları en fazla 12 kelime olsun. "
                            "JSON nesnesini mutlaka tamamen kapat."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=1200,
            )

            retry_text = (
                retry_response.choices[0].message.content or ""
            ).strip()

            print(
                "[AI PREDICTIONS] Retry response:",
                repr(retry_text),
                flush=True,
            )

            if retry_text.startswith("```"):
                retry_text = retry_text.strip("`").strip()

                if retry_text.startswith("json"):
                    retry_text = retry_text[4:].strip()

            try:
                result = json.loads(retry_text)
            except json.JSONDecodeError:
                print(
                    "[AI PREDICTIONS] Retry JSON parsing failed.",
                    flush=True,
                )
                result = {}

        if not isinstance(result, dict):
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
        print(
            "[AI PREDICTIONS] Parsed result:",
            {
                "predictions": cleaned_predictions,
                "recommendations": cleaned_recommendations,
            },
            flush=True,
        )
        return {
            "predictions": cleaned_predictions,
            "recommendations": cleaned_recommendations,
        }