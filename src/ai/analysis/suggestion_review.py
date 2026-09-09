import json
import os

from openai import OpenAI


SUGGESTION_REVIEW_SYSTEM_PROMPT = """
Sen Osmanlıca belge analizi ve çeviri değerlendirme asistanısın.

Görevin:
- Orijinal metni incelemek.
- AI tarafından önerilen metni incelemek.
- Kullanıcının yaptığı düzenlemeyi incelemek.
- Kullanıcı düzenlemesinin bağlama göre ne kadar uygun olduğunu değerlendirmek.
- Gerekirse daha iyi bir alternatif önermek.

Kurallar:
- Kullanıcı düzenlemesini otomatik olarak doğru kabul etme.
- Sadece verilen metinlere dayan.
- Bilmediğin bilgiyi uydurma.
- Confidence değeri 0.0 ile 1.0 arasında olmalı.
- Cevap kısa ve doğrudan olmalı.
- Sadece geçerli JSON döndür.
- Markdown veya ek açıklama yazma.

JSON formatı:

{
  "accepted": true,
  "confidence": 0.90,
  "reason": "Kısa değerlendirme.",
  "recommended_text": "Önerilen son metin",
  "changed_from_ai": true
}
"""


class SuggestionReviewer:
    def __init__(self, model: str):
        self.model = model

        self.client = OpenAI(
            api_key=os.getenv("RELAY_API_KEY"),
            base_url=os.getenv("RELAY_BASE_URL"),
        )

    def review(
        self,
        original_text: str,
        ai_suggestion: str,
        user_edit: str,
    ) -> dict:

        original_text = original_text.strip()
        ai_suggestion = ai_suggestion.strip()
        user_edit = user_edit.strip()

        if not original_text or not user_edit:
            raise ValueError(
                "Original text and user edit are required."
            )

        user_prompt = (
            f"ORİJİNAL METİN:\n{original_text}\n\n"
            f"AI ÖNERİSİ:\n{ai_suggestion}\n\n"
            f"KULLANICI DÜZENLEMESİ:\n{user_edit}"
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": SUGGESTION_REVIEW_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.1,
            max_tokens=900,
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

        if not result:
            return {
                "accepted": False,
                "confidence": 0.0,
                "reason": (
                    "AI değerlendirmesi oluşturulamadı."
                ),
                "recommended_text": user_edit,
                "changed_from_ai": (
                    user_edit != ai_suggestion
                ),
            }

        confidence = result.get(
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

        return {
            "accepted": bool(
                result.get("accepted", False)
            ),
            "confidence": confidence,
            "reason": str(
                result.get(
                    "reason",
                    "",
                )
            ).strip(),
            "recommended_text": str(
                result.get(
                    "recommended_text",
                    user_edit,
                )
            ).strip(),
            "changed_from_ai": (
                user_edit != ai_suggestion
            ),
        }