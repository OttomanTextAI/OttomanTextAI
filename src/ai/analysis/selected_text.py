import json
import os

from openai import OpenAI


SELECTED_TEXT_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının
seçili metin analiz asistanısın.

Kullanıcı, bir belgenin belirli bir bölümünü seçti.

Görevin yalnızca sana verilen seçili metni analiz etmektir.

Şunları üret:

1. explanation
Seçili bölümün açık ve kısa açıklaması.

2. simplified
Metni anlamını bozmadan daha sade ve güncel Türkçeyle ifade et.

3. context
Bu bölümün kendi içeriğinden anlaşılabilen bağlamı açıkla.
Belgede olmayan tarihsel bilgileri ekleme.

4. people
Bu bölümde geçen kişi isimleri.

5. places
Bu bölümde geçen yer, şehir, bölge veya ülke isimleri.

6. dates
Bu bölümde geçen tarih veya dönem ifadeleri.

7. events
Bu bölümde geçen önemli olaylar, savaşlar, kuşatmalar,
antlaşmalar veya tarihsel gelişmeler.

8. keywords
Bölümü temsil eden önemli kelime ve kavramlar.

9. uncertain_points
Anlamı kesin olmayan, yoruma açık veya bağlam gerektiren
ifadeler varsa belirt.

Kurallar:
- Yalnızca verilen metni kullan.
- Bilgi uydurma.
- Genel tarih bilgisini cevaba ekleme.
- Bir bilgi metinde yoksa ilgili listeyi boş bırak.
- Kısa ve anlaşılır cevaplar üret.
- SADECE geçerli JSON döndür.

JSON formatı:

{
  "explanation": "...",
  "simplified": "...",
  "context": "...",
  "people": [],
  "places": [],
  "dates": [],
  "events": [],
  "keywords": [],
  "uncertain_points": []
}
""".strip()


class SelectedTextAnalyzer:
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

    def analyze(
        self,
        selected_text: str,
    ) -> dict:
        if not selected_text or not selected_text.strip():
            raise ValueError(
                "Selected text cannot be empty."
            )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": SELECTED_TEXT_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": selected_text.strip(),
                },
            ],
            temperature=0.1,
            max_tokens=900,
        )

        response_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

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
            start = cleaned.find("{")
            end = cleaned.rfind("}")

            if start == -1 or end == -1 or end <= start:
                print(
                    "[SELECTED TEXT] Invalid model response:",
                    response_text,
                    flush=True,
                )

                raise RuntimeError(
                    "Selected text analysis response was not valid JSON."
                )

            json_candidate = cleaned[start:end + 1]

            try:
                result = json.loads(json_candidate)

            except json.JSONDecodeError as error:
                print(
                    "[SELECTED TEXT] Invalid model response:",
                    response_text,
                    flush=True,
                )

                raise RuntimeError(
                    "Selected text analysis response was not valid JSON."
                ) from error

        return {
            "explanation": result.get(
                "explanation",
                "",
            ),
            "simplified": result.get(
                "simplified",
                "",
            ),
            "context": result.get(
                "context",
                "",
            ),
            "people": result.get(
                "people",
                [],
            ),
            "places": result.get(
                "places",
                [],
            ),
            "dates": result.get(
                "dates",
                [],
            ),
            "events": result.get(
                "events",
                [],
            ),
            "keywords": result.get(
                "keywords",
                [],
            ),
            "uncertain_points": result.get(
                "uncertain_points",
                [],
            ),
        }