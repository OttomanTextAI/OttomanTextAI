import json
import os

from openai import OpenAI

from src.ai.context_optimizer import optimize_document_context

ENTITY_FILTER_SYSTEM_PROMPT = """
Sen Akıllı Osmanlıca Asistanı'nın belge içeriği sınıflandırma modülüsün.

Görevin, sana verilen belge metnindeki önemli öğeleri tespit etmek
ve uygun kategorilere ayırmaktır.

Kategoriler:
- person: gerçek kişi adı veya açıkça belirli kişi
- place: şehir, bölge, ülke, yapı veya önemli mekân
- date: yıl, tarih veya tarihsel zaman ifadesi
- event: savaş, fetih, antlaşma veya önemli olay
- concept: önemli kavram, terim veya belge içi özel ifade
- institution: kurum, devlet, teşkilat veya resmî yapı
- role: unvan, toplumsal rol, meslek veya kişi tipi
- work: eser, şiir, kitap, belge veya metin adı

Kurallar:
- Yalnızca verilen belge metnini kullan.
- Belgede bulunmayan öğeleri ekleme.
- Aynı öğeyi gereksiz yere tekrar etme.
- Her kelimeyi varlık olarak işaretleme.
- Yalnızca belgenin anlaşılması açısından anlamlı öğeleri seç.
- Genel sıfatları veya insan türlerini otomatik olarak person yapma.
- "bilgin", "cahil", "şair", "padişah", "asker" gibi ifadeler
  belirli kişi adı değilse role kategorisine girsin.
- Gerçek kişi adı veya açıkça tanımlanan belirli kişi person olsun.
- text alanında belgede geçtiği biçimi koru.
- category alanı yalnızca izin verilen kategorilerden biri olsun.
- subtype alanı öğenin daha özel türünü kısa şekilde açıklasın.
- importance yalnızca "high", "medium" veya "low" olsun.
- importance, öğenin belgeyi anlamadaki önemini göstersin.
- role alanı, öğenin belge içindeki işlevini kısa şekilde açıklasın.
- context alanı kısa olsun ve öğenin geçtiği bağlamı açıklasın.
- mentions, öğenin belge içinde kaç kez geçtiğini yaklaşık olarak göstersin.
- confidence 0 ile 1 arasında sayı olsun.
- confidence kesin doğruluk olasılığı değildir; AI güven göstergesidir.
- En fazla 20 öğe döndür.
- JSON'dan önce veya sonra açıklama yazma.
- Markdown veya ```json kod bloğu kullanma.
- SADECE geçerli JSON döndür.

JSON formatı:

{
  "entities": [
    {
      "text": "Fatih Sultan Mehmed",
      "category": "person",
      "subtype": "Osmanlı padişahı",
      "importance": "high",
      "role": "Metinde adı geçen tarihî kişi",
      "context": "Belgenin sonunda Avnî mahlasıyla ilişkilendiriliyor",
      "mentions": 1,
      "confidence": 0.98
    }
  ]
}
""".strip()

class EntityFilterClassifier:
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

    def classify(
        self,
        document_text: str,
    ) -> list:
        if not document_text or not document_text.strip():
            raise ValueError(
                "Document text cannot be empty."
            )

        optimized_text = optimize_document_context(
            document_text
        )

        print(
            "[ENTITY FILTER CONTEXT]",
            f"{len(document_text)} -> {len(optimized_text)} chars",
            flush=True,
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": ENTITY_FILTER_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": (
                        "BELGE METNİ:\n"
                        f"{optimized_text}"
                    ),
                },
            ],
            temperature=0.1,
            max_tokens=2200,
        )

        finish_reason = completion.choices[0].finish_reason

        print(
            "[ENTITY FILTER FINISH REASON]",
            finish_reason,
            flush=True,
        )

        response_text = (
            completion.choices[0].message.content or ""
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
            print(
                "[ENTITY FILTER] Invalid or truncated JSON. Retrying...",
                flush=True,
            )

            retry_completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": ENTITY_FILTER_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": (
                            "BELGE METNİ:\n"
                            f"{optimized_text}\n\n"
                            "Önceki cevap geçerli JSON olarak tamamlanamadı. "
                            "Bu kez çok kısa cevap ver. "
                            "En fazla 10 öğe döndür. "
                            "context alanları en fazla 8 kelime olsun. "
                            "JSON nesnesini mutlaka tamamen kapat."
                        ),
                    },
                ],
                temperature=0.1,
                max_tokens=2200,
            )

            retry_finish_reason = (
                retry_completion.choices[0].finish_reason
            )

            print(
                "[ENTITY FILTER RETRY FINISH REASON]",
                retry_finish_reason,
                flush=True,
            )

            retry_text = (
                retry_completion.choices[0].message.content or ""
            ).strip()

            print(
                "[ENTITY FILTER RETRY RESPONSE]",
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
                    "[ENTITY FILTER] Retry JSON parsing failed.",
                    flush=True,
                )
                result = {}
                
        if not isinstance(result, dict):
            result = {}

        entities = result.get(
            "entities",
            [],
        )

        if not isinstance(entities, list):
            entities = []

        allowed_categories = {
            "person",
            "place",
            "date",
            "event",
            "concept",
            "institution",
            "role",
            "work",
        }

        normalized = []
        seen = set()

        allowed_importance = {
            "high",
            "medium",
            "low",
        }

        for entity in entities[:20]:
            if not isinstance(entity, dict):
                continue

            text = str(
                entity.get("text", "")
            ).strip()

            if not text:
                continue

            category = str(
                entity.get("category", "concept")
            ).strip().lower()

            if category not in allowed_categories:
                category = "concept"

            subtype = str(
                entity.get("subtype", "")
            ).strip()

            importance = str(
                entity.get("importance", "medium")
            ).strip().lower()

            if importance not in allowed_importance:
                importance = "medium"

            role = str(
                entity.get("role", "")
            ).strip()

            context = str(
                entity.get("context", "")
            ).strip()

            try:
                mentions = int(
                    entity.get("mentions", 1)
                )
            except (TypeError, ValueError):
                mentions = 1

            mentions = max(1, mentions)

            try:
                confidence = float(
                    entity.get("confidence", 0.5)
                )
            except (TypeError, ValueError):
                confidence = 0.5

            confidence = max(
                0.0,
                min(confidence, 1.0),
            )

            duplicate_key = (
                text.lower(),
                category,
            )

            if duplicate_key in seen:
                continue

            seen.add(duplicate_key)

            normalized.append(
                {
                    "text": text,
                    "category": category,
                    "subtype": subtype,
                    "importance": importance,
                    "role": role,
                    "context": context,
                    "mentions": mentions,
                    "confidence": confidence,
                }
            )

        return normalized