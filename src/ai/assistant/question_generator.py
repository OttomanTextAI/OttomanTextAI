import os

from openai import OpenAI

from src.ai.context_optimizer import optimize_document_context
from src.ai.json_utils import parse_model_json

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

Çıktın TAM OLARAK şu yapıda olmalı:

{
  "questions": [
    "Birinci soru?",
    "İkinci soru?",
    "Üçüncü soru?"
  ]
}

"questions" alanı mutlaka bir JSON listesi olmalıdır.
Liste dışında hiçbir alan veya açıklama ekleme.
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
            document_text,
            max_chars=8000,
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
            max_tokens=400,
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

        result = parse_model_json(
            response_text
        )

        if not result or "questions" not in result:
            print(
                "[AI QUESTIONS] JSON parsing/format validation failed.",
                flush=True,
            )
            result = {}

        if not result:
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
                            "Önceki cevap istenen JSON formatına uymadı. "
                            'SADECE {"questions":["Soru 1?","Soru 2?","Soru 3?"]} '
                            "yapısında geçerli JSON döndür. "
                            "questions mutlaka bir liste olsun. "
                            "Her soru en fazla 8 kelime olsun. "
                            "Başka hiçbir alan veya açıklama ekleme."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=300,
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

            result = parse_model_json(
                retry_text
            )

        if not result or "questions" not in result:
            print(
                "[AI QUESTIONS] Retry JSON parsing/format failed.",
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

        cleaned_questions = []

        for question in questions:
            if not isinstance(question, str):
                continue

            question = question.strip()

            if not question:
                continue

            if question not in cleaned_questions:
                cleaned_questions.append(question)

            if len(cleaned_questions) == 3:
                break

        print(
            "[AI QUESTIONS FINAL]",
            cleaned_questions,
            flush=True,
        )

        return cleaned_questions