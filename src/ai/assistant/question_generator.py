import json
import os

from openai import OpenAI

from src.ai.context_optimizer import optimize_document_context


QUESTION_GENERATION_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının
AI soru öneri sistemisin.

Sana bir belgenin modern Türkçe metni verilecek.

Görevin, kullanıcının belgeyi anlamasına yardımcı olacak
en fazla 3 kısa ve anlamlı soru üretmektir.

Kurallar:
- Sorular yalnızca verilen belgeyle ilgili olsun.
- Cevabı belge üzerinden araştırılabilecek sorular üret.
- Aynı anlama gelen soruları tekrar etme.
- Kişi, tarih, yer, olay ve belgenin amacı gibi önemli
  unsurlara öncelik ver.
- Belgede hiç geçmeyen kişi, olay veya kavramları ekleme.
- Sorular kısa ve kullanıcı dostu olsun.
- SADECE geçerli JSON döndür.
- JSON'dan önce veya sonra hiçbir açıklama yazma.
- Markdown veya ```json kod bloğu kullanma.
- Tüm alanları mutlaka JSON içinde döndür.
- Sorular tek cümle olsun ve gereksiz açıklama içerme.
- En fazla 3 soru üret.
- Her soru en fazla 10 kelime olsun.
- Sadece soru metinlerini üret, açıklama ekleme.
- JSON'u kısa ve kompakt tut.

JSON formatı:

{
  "questions": [
    "...",
    "...",
    "..."
  ]
}
""".strip()


class DocumentQuestionGenerator:
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
        document_text: str,
    ) -> list[str]:
        if not document_text or not document_text.strip():
            raise ValueError(
                "Document text cannot be empty."
            )

        optimized_text = optimize_document_context(
            document_text
        )

        print(
            "[AI QUESTIONS CONTEXT]",
            f"{len(document_text)} -> {len(optimized_text)} chars",
            flush=True,
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": QUESTION_GENERATION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": optimized_text,
                },
            ],
            temperature=0.2,
            max_tokens=1200,
        )

        

        finish_reason = completion.choices[0].finish_reason

        print(
            "[AI QUESTIONS FINISH REASON]",
            finish_reason,
            flush=True,
        )

        response_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

        print(
            "[AI QUESTIONS RAW RESPONSE]",
            repr(response_text),
            flush=True,
        )

        cleaned = response_text

        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]

        if cleaned.startswith("```"):
            cleaned = cleaned[3:]

        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        cleaned = cleaned.strip()

        try:
            result = json.loads(cleaned)

        except json.JSONDecodeError:
            print(
                "[AI QUESTIONS] Invalid or truncated JSON. Retrying...",
                flush=True,
            )

            retry_completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": QUESTION_GENERATION_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": (
                            f"{optimized_text}\n\n"
                            "Önceki cevap geçerli JSON olarak tamamlanamadı. "
                            "Bu kez yalnızca 3 kısa soru döndür. "
                            "Her soru en fazla 8 kelime olsun. "
                            "JSON'u mutlaka tamamen kapat."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=800,
            )

            retry_finish_reason = (
                retry_completion.choices[0].finish_reason
            )

            print(
                "[AI QUESTIONS RETRY FINISH REASON]",
                retry_finish_reason,
                flush=True,
            )

            retry_text = (
                retry_completion.choices[0].message.content
                or ""
            ).strip()

            print(
                "[AI QUESTIONS RETRY RESPONSE]",
                repr(retry_text),
                flush=True,
            )

            if retry_text.startswith("```json"):
                retry_text = retry_text[7:]

            if retry_text.startswith("```"):
                retry_text = retry_text[3:]

            if retry_text.endswith("```"):
                retry_text = retry_text[:-3]

            retry_text = retry_text.strip()

            try:
                result = json.loads(retry_text)

            except json.JSONDecodeError:
                print(
                    "[AI QUESTIONS] Retry JSON parsing failed.",
                    flush=True,
                )
                result = {}

        if not isinstance(result, dict):
            result = {}

        questions = result.get(
            "questions",
            [],
        )

        if not isinstance(questions, list):
            questions = []

        return [
            str(question).strip()
            for question in questions[:3]
            if str(question).strip()
        ]