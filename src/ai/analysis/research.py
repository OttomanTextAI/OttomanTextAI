import os

from openai import OpenAI

from src.ai.context_optimizer import optimize_document_context
from src.ai.json_utils import parse_model_json

RESEARCH_SUGGESTION_SYSTEM_PROMPT = """
Sen Akıllı Osmanlıca Asistanı'nın araştırma önerisi üreten AI modülüsün.

Görevin, sana verilen belge metnini analiz ederek kullanıcının
belge hakkında daha fazla araştırabileceği anlamlı başlıklar önermektir.

Öneriler şu kategorilerden oluşabilir:
- topic: belgede geçen önemli konu veya tema
- person: belgede geçen önemli kişi
- period: tarihsel dönem veya zaman aralığı
- event: önemli olay
- place: önemli yer veya bölge
- concept: araştırılabilecek önemli kavram

Kurallar:
- Yalnızca verilen belge metninden hareket et.
- Belgede olmayan kişi, olay veya tarih uydurma.
- Genel tarih bilgisiyle boşluk doldurma.
- En fazla 3 araştırma önerisi üret.
- Her reason en fazla 12 kelime olsun.
- title ve query kısa olsun.
- Açıklama veya ek metin üretme.
- JSON'u mümkün olduğunca kısa tut.
- Her öneri kısa ve açıklayıcı olsun.
- query alanı kullanıcının arama yapabileceği kısa bir araştırma sorgusu olsun.
- reason alanı en fazla 1 kısa cümle olsun.
- JSON'dan önce veya sonra hiçbir açıklama yazma.
- Markdown veya ```json kod bloğu kullanma.
- SADECE geçerli JSON döndür.

JSON formatı:

{
  "suggestions": [
    {
      "type": "topic",
      "title": "Araştırma başlığı",
      "query": "arama sorgusu",
      "reason": "Bu önerinin belgeyle ilişkisi"
    }
  ]
}
""".strip()


class ResearchSuggestionGenerator:
    def __init__(
        self,
        model: str = "google/gemini-3.5-flash",
    ) -> None:
        api_key = (os.getenv("RELAY_API_KEY") or "").strip()
        base_url = (os.getenv("RELAY_BASE_URL") or "").strip()

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
    ) -> list:
        if not document_text or not document_text.strip():
            raise ValueError(
                "Document text cannot be empty."
            )

        optimized_text = optimize_document_context(
            document_text,
            max_chars=9000,
        )

        print(
            "[RESEARCH CONTEXT]",
            f"{len(document_text)} -> {len(optimized_text)} chars",
            flush=True,
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": RESEARCH_SUGGESTION_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "BELGE METNİ:\n"
                        f"{optimized_text}"
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=650,
        )

        finish_reason = completion.choices[0].finish_reason

        print(
            "[RESEARCH SUGGESTIONS FINISH REASON]",
            finish_reason,
            flush=True,
        )

        response_text = (
            completion.choices[0].message.content or ""
        ).strip()

        result = parse_model_json(
            response_text
        )

        if not result:
            print(
                "[RESEARCH SUGGESTIONS] Invalid JSON. Retrying...",
                flush=True,
            )

            retry_completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": RESEARCH_SUGGESTION_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": (
                            "BELGE METNİ:\n"
                            f"{optimized_text}\n\n"
                            "Önceki cevap geçerli JSON değildi. "
                            "En fazla 2 kısa araştırma önerisi üret. "
                            "Sadece geçerli JSON döndür."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=400,
            )

            retry_text = (
                retry_completion.choices[0].message.content
                or ""
            ).strip()

            result = parse_model_json(
                retry_text
            )

            if not result:
                print(
                    "[RESEARCH SUGGESTIONS] Retry JSON parsing failed.",
                    flush=True,
                )
                result = {}
                                
        if not isinstance(result, dict):
            result = {}

        suggestions = result.get(
            "suggestions",
            [],
        )

        if not isinstance(suggestions, list):
            suggestions = []

        allowed_types = {
            "topic",
            "person",
            "period",
            "event",
            "place",
            "concept",
        }

        normalized = []

        for suggestion in suggestions[:3]:
            if not isinstance(suggestion, dict):
                continue

            suggestion_type = suggestion.get(
                "type",
                "topic",
            )

            if suggestion_type not in allowed_types:
                suggestion_type = "topic"

            title = str(
                suggestion.get("title", "")
            ).strip()

            query = str(
                suggestion.get("query", "")
            ).strip()

            reason = str(
                suggestion.get("reason", "")
            ).strip()

            if not title:
                continue

            normalized.append(
                {
                    "type": suggestion_type,
                    "title": title,
                    "query": query,
                    "reason": reason,
                }
            )

        return normalized