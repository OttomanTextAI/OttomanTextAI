import json
import os

from openai import OpenAI


SELECTED_TEXT_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının
seçili metin analiz asistanısın.

Kullanıcı, bir belgenin belirli bir bölümünü seçti.
Seçim tek bir kelime, kısa bir ifade, cümle veya daha uzun
bir metin olabilir.

Görevin sana verilen seçili metni dilsel ve içerik açısından
analiz etmektir.

Şunları üret:

1. explanation
- Seçili metnin açık ve kısa anlamını açıkla.
- Tek bir kelime seçilmişse kelimenin anlamını veya olası
  anlamlarını belirt.
- Eski, Osmanlıca veya günümüzde daha az kullanılan bir ifade
  ise günümüz Türkçesindeki karşılığını açıkla.

2. simplified
- Metni anlamını bozmadan sade ve güncel Türkçeyle ifade et.
- Tek kelimeyse en uygun güncel Türkçe karşılığını yaz.
- Zaten güncel Türkçeyse aynı veya daha anlaşılır karşılığını ver.

3. context
- Seçili bölümün yalnızca kendi içeriğinden anlaşılabilecek
  bağlamını açıkla.
- Metin çok kısaysa veya tek kelimeyse bağlamın sınırlı olduğunu
  açıkça belirt.
- Belgenin seçili olmayan bölümleri hakkında varsayım yapma.

4. people
Seçili bölümde açıkça geçen kişi isimleri.

5. places
Seçili bölümde açıkça geçen yer, şehir, bölge veya ülke isimleri.

6. dates
Seçili bölümde açıkça geçen tarih veya dönem ifadeleri.

7. events
Seçili bölümde açıkça geçen önemli olaylar, savaşlar,
kuşatmalar, antlaşmalar veya tarihsel gelişmeler.

8. keywords
- Bölümü temsil eden önemli kelime ve kavramlar.
- Tek kelimelik seçimlerde anlamlıysa seçilen kelimeyi de ekle.

9. uncertain_points
- Anlamı kesin olmayan, birden fazla anlama gelebilen,
  yazımından emin olunamayan veya daha geniş belge bağlamına
  ihtiyaç duyan noktaları belirt.
- Tek kelimelik seçimlerde farklı yorum ihtimali varsa burada açıkla.

Kurallar:
- Analizin merkezinde yalnızca kullanıcının seçtiği metin olsun.
- Seçili metinde bulunmayan kişi, tarih, yer veya tarihsel olay ekleme.
- Ancak kelime anlamını ve güncel Türkçe karşılığını açıklamak için
  genel dil bilgisini kullanabilirsin.
- Genel tarih bilgisi ekleme.
- Bilgi uydurma.
- Bir bilgi metinde yoksa ilgili listeyi boş bırak.
- explanation alanını boş bırakma.
- simplified alanını mümkün olduğunca boş bırakma.
- context alanını boş bırakma; bağlam yoksa bunu açıkça belirt.
- Kısa ve anlaşılır cevaplar üret.
- Cevabı Türkçe ver.
- SADECE geçerli JSON döndür.
- Markdown kullanma.

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

            if start != -1 and end != -1 and end > start:
                try:
                    result = json.loads(
                        cleaned[start:end + 1]
                    )
                except json.JSONDecodeError:
                    result = {}
            else:
                result = {}

            if not result:
                print(
                    "[SELECTED TEXT] Invalid model response:",
                    repr(response_text),
                    flush=True,
                )
                
        if not isinstance(result, dict):
            result = {}

        list_fields = [
            "people",
            "places",
            "dates",
            "events",
            "keywords",
            "uncertain_points",
        ]

        for field in list_fields:
            if not isinstance(result.get(field, []), list):
                result[field] = []

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