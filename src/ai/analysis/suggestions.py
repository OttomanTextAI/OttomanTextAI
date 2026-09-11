import os

from openai import OpenAI

from src.ai.json_utils import parse_model_json


AI_SUGGESTION_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının
AI öneri asistanısın.

Kullanıcıya, belirsiz veya alternatif okunabilecek bir ifade
için yardımcı olacaksın.

Görevin:
- Verilen ifade için en olası okuma/yorum önerisini üret.
- Gerekliyse en fazla 3 alternatif öneri sun.
- Her öneri için 0 ile 1 arasında confidence değeri ver.
- En güçlü öneriyi recommended alanında belirt.
- Emin olmadığın durumda confidence değerini yüksek verme.
- Alternatiflerin neden mümkün olduğunu kısa şekilde açıkla.
- Kullanıcıya karar bırak; kesin olmayan bir öneriyi kesinmiş gibi sunma.
- Yalnızca verilen metne dayan.
- SADECE geçerli JSON döndür.
- JSON'dan önce veya sonra hiçbir açıklama yazma.
- Markdown veya ```json kod bloğu kullanma.
- Tüm alanları mutlaka JSON içinde döndür.
- En fazla 1 recommended ve 3 alternative üret.
- reason alanı en fazla 12 kelime olsun.
- Açıklamaları kısa tut.
- Aynı bilgiyi tekrar etme.
- JSON'u mümkün olan en kısa biçimde döndür.

JSON formatı:

{
  "recommended": {
    "text": "...",
    "confidence": 0.92,
    "reason": "..."
  },
  "alternatives": [
    {
      "text": "...",
      "confidence": 0.63,
      "reason": "..."
    }
  ],
  "uncertainty": "low"
}
""".strip()


class AISuggestionGenerator:
    def __init__(
        self,
        model: str,
    ) -> None:
        api_key = (
            os.getenv("RELAY_API_KEY")
            or ""
        ).strip()

        base_url = (
            os.getenv("RELAY_BASE_URL")
            or ""
        ).strip()

        if not api_key:
            raise RuntimeError(
                "RELAY_API_KEY is not configured."
            )

        if not base_url:
            raise RuntimeError(
                "RELAY_BASE_URL is not configured."
            )

        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )

        self.model = model

    def generate(
        self,
        text: str,
    ) -> dict:
        if not text or not text.strip():
            raise ValueError(
                "Text cannot be empty."
            )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": AI_SUGGESTION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": text.strip(),
                },
            ],
            temperature=0.2,
            max_tokens=1600,
        )

        finish_reason = completion.choices[0].finish_reason

        print(
            "[AI SUGGESTIONS FINISH REASON]",
            finish_reason,
            flush=True,
        )

        response_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

        result = parse_model_json(
            response_text
        )

        if not result:
            print(
                "[AI SUGGESTIONS] Invalid model response:",
                repr(response_text),
                flush=True,
            )
            result = {}
       
        recommended = result.get(
            "recommended",
            {},
        )

        alternatives = result.get(
            "alternatives",
            [],
        )

        if not isinstance(recommended, dict):
            recommended = {}

        if not isinstance(alternatives, list):
            alternatives = []

        recommended_text = str(
            recommended.get("text", "")
        ).strip()

        recommended_reason = str(
            recommended.get("reason", "")
        ).strip()

        try:
            recommended_confidence = float(
                recommended.get("confidence", 0.0)
            )
        except (TypeError, ValueError):
            recommended_confidence = 0.0

        recommended_confidence = max(
            0.0,
            min(recommended_confidence, 1.0),
        )

        normalized_alternatives = []

        for alternative in alternatives[:3]:
            if not isinstance(alternative, dict):
                continue

            alternative_text = str(
                alternative.get("text", "")
            ).strip()

            reason = str(
                alternative.get("reason", "")
            ).strip()

            try:
                confidence = float(
                    alternative.get("confidence", 0.0)
                )
            except (TypeError, ValueError):
                confidence = 0.0

            confidence = max(
                0.0,
                min(confidence, 1.0),
            )

            if alternative_text:
                normalized_alternatives.append({
                    "text": alternative_text,
                    "confidence": confidence,
                    "reason": reason,
                })

        uncertainty = result.get(
            "uncertainty",
            "medium",
        )

        if uncertainty not in {
            "low",
            "medium",
            "high",
        }:
            uncertainty = "medium"

        return {
            "recommended": {
                "text": recommended_text,
                "confidence": recommended_confidence,
                "reason": recommended_reason,
            },
            "alternatives": normalized_alternatives,
            "uncertainty": uncertainty,
        }