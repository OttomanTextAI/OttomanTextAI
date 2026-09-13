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

        print(
            "[RESEARCH SUGGESTIONS RAW RESPONSE]",
            repr(response_text),
            flush=True,
        )

        result = parse_model_json(
            response_text
        )

        def has_usable_result(data: dict) -> bool:
            if not isinstance(data, dict):
                return False

            suggestions = data.get("suggestions")

            if not isinstance(suggestions, list) or not suggestions:
                return False

            for suggestion in suggestions:
                if not isinstance(suggestion, dict):
                    continue

                title = str(
                    suggestion.get("title", "")
                ).strip()

                if title:
                    return True

            return False


        if not has_usable_result(result):
            print(
                "[RESEARCH SUGGESTIONS] Invalid or empty result. Retrying...",
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
                            "Önceki cevap gerekli suggestions yapısını üretmedi "
                            "veya geçerli JSON değildi. "
                            "Belge anlamlı olduğu için suggestions listesi boş OLMAMALI. "
                            "En az 1, en fazla 2 kısa araştırma önerisi üret. "
                            "Her öneride type, title, query ve reason alanları olsun. "
                            "type yalnızca topic, person, period, event, place "
                            "veya concept değerlerinden biri olsun. "
                            "Reason en fazla 12 kelime olsun. "
                            "SADECE geçerli JSON döndür. "
                            "JSON dışında hiçbir açıklama yazma."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=400,
            )

            print(
                "[RESEARCH SUGGESTIONS RETRY FINISH REASON]",
                retry_completion.choices[0].finish_reason,
                flush=True,
            )

            retry_text = (
                retry_completion.choices[0].message.content
                or ""
            ).strip()

            print(
                "[RESEARCH SUGGESTIONS RETRY RESPONSE]",
                repr(retry_text),
                flush=True,
            )

            result = parse_model_json(
                retry_text
            )

            if not has_usable_result(result):
                print(
                    "[RESEARCH SUGGESTIONS] Retry returned unusable result:",
                    result,
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

            suggestion_type = str(
                suggestion.get(
                    "type",
                    "topic",
                )
            ).strip().lower()

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
                "note_suitable": True,
                "note_text": (
                    f"Araştırma Önerisi: {title}"
                    + (f"\nAraştırma: {query}" if query else "")
                    + (f"\nNeden: {reason}" if reason else "")
            ),
        }
            )

        return normalized