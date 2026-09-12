import os

from openai import OpenAI

from src.ai.json_utils import parse_model_json
from src.ai.context_optimizer import optimize_document_context


FIVE_W_ONE_H_SYSTEM_PROMPT = """
Sen Osmanlıca belgelerin günümüz Türkçesi çevirileri üzerinde
belge analizi yapan bir asistansın.

Görevin, yalnızca verilen belge metnine dayanarak 5N1K analizi üretmektir.

Şu altı başlığı değerlendir:

- kim: Belgede geçen önemli kişi veya taraflar kimlerdir?
- ne: Belgede temel olarak ne anlatılmaktadır / ne yapılmaktadır?
- nerede: Olayın, belgenin veya anlatının geçtiği yer neresidir?
- ne_zaman: Belgede belirtilen tarih, dönem veya zaman nedir?
- neden: Belgede anlatılan olayın veya işlemin nedeni nedir?
- nasil: Olay veya işlem nasıl gerçekleşmektedir / nasıl açıklanmaktadır?

Kurallar:

1. SADECE verilen belge metnindeki bilgileri kullan.
2. Belgede bulunmayan bilgileri tarihsel bilginle TAMAMLAMA.
3. Bir başlık için yeterli bilgi yoksa:
   "tespit_edilemedi": true
   yap ve "cevap" alanını boş bırak.
4. Aynı bilgiyi gereksiz yere farklı başlıklarda tekrar etme.
5. Cevapları kısa ve açık Türkçe ile yaz.
6. Her başlığa 0.0 ile 1.0 arasında güven skoru ver.
7. "dayanak" alanında cevabı destekleyen çok kısa belge ifadesi veya açıklaması ver.
8. Güven skoru gerçek istatistiksel doğruluk değildir;
   modelin belge içeriğine göre değerlendirdiği güven düzeyidir.
9. JSON dışında hiçbir şey üretme.

SADECE şu JSON yapısını döndür:

{
  "kim": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  },
  "ne": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  },
  "nerede": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  },
  "ne_zaman": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  },
  "neden": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  },
  "nasil": {
    "cevap": "",
    "dayanak": "",
    "confidence": 0.0,
    "tespit_edilemedi": false
  }
}
""".strip()


class FiveWOneHAnalyzer:
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

        self.model = model

        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )

    @staticmethod
    def _normalize_result(result: dict) -> dict:
        fields = [
            "kim",
            "ne",
            "nerede",
            "ne_zaman",
            "neden",
            "nasil",
        ]

        normalized = {}

        for field in fields:
            item = result.get(field)

            if not isinstance(item, dict):
                item = {}

            confidence = item.get("confidence", 0.0)

            try:
                confidence = float(confidence)
            except (TypeError, ValueError):
                confidence = 0.0

            confidence = max(
                0.0,
                min(1.0, confidence),
            )

            answer = str(
                item.get("cevap") or ""
            ).strip()

            evidence = str(
                item.get("dayanak") or ""
            ).strip()

            not_detected = bool(
                item.get("tespit_edilemedi", False)
            )

            if not answer:
                not_detected = True

            normalized[field] = {
                "cevap": answer,
                "dayanak": evidence,
                "confidence": confidence,
                "tespit_edilemedi": not_detected,
            }

        return normalized

    def analyze(
        self,
        document_text: str,
    ) -> dict:
        document_text = (document_text or "").strip()

        if not document_text:
            raise ValueError(
                "Document text cannot be empty."
            )


        document_text = optimize_document_context(
            document_text,
            max_chars=9000,
        )
        
        prompt = (
            "BELGE METNİ:\n\n"
            f"{document_text}"
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": FIVE_W_ONE_H_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.1,
            max_tokens=700,
        )

        raw_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

        result = parse_model_json(
            raw_text
        )

        if not result:
            retry_prompt = (
                prompt
                + "\n\nÖnceki yanıt geçerli JSON değildi. "
                "Sadece istenen JSON nesnesini üret. "
                "Kısa cevaplar kullan ve JSON'u mutlaka tamamla."
            )

            retry_completion = (
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": FIVE_W_ONE_H_SYSTEM_PROMPT,
                        },
                        {
                            "role": "user",
                            "content": retry_prompt,
                        },
                    ],
                    temperature=0.1,
                    max_tokens=700,
                )
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
                    "[5N1K] Retry JSON parsing failed.",
                    flush=True,
                )
                result = {}

        return self._normalize_result(result)