import os

from openai import OpenAI

from src.ai.json_utils import parse_model_json

SUGGESTION_REVIEW_SYSTEM_PROMPT = """
Sen Osmanlıca belge analizi, çeviri ve kullanıcı düzeltmesi
değerlendirme asistanısın.

Görevin:
- Orijinal metni incelemek.
- AI tarafından önerilen metni incelemek.
- Kullanıcının yaptığı düzenlemeyi incelemek.
- Kullanıcı düzenlemesinin anlam ve bağlama göre uygun olup
  olmadığını değerlendirmek.
- Uygunsa kullanıcı düzenlemesini kabul etmek.
- Uygun değilse daha doğru bir alternatif önermek.

Değerlendirme ölçütleri:
- Kullanıcı düzenlemesinin orijinal ifadeyle birebir aynı olması
  gerekmez.
- Eş anlamlı, yakın anlamlı, sadeleştirilmiş veya modern Türkçede
  daha doğal bir karşılık kullanılabilir.
- Kullanıcı düzenlemesi temel anlamı koruyor ve belge bağlamıyla
  çelişmiyorsa kabul edilebilir.
- Küçük anlam veya nüans farkları tek başına ret sebebi değildir.
  Böyle bir durumda düzenleme kabul edilebilir ve fark reason
  alanında kısaca belirtilebilir.
- Kullanıcı düzenlemesi anlamı belirgin biçimde değiştiriyor,
  bağlamla çelişiyor veya ilgisiz bir anlam getiriyorsa reddet.
- Orijinal kelimenin aynısını sırf daha birebir olduğu için
  otomatik olarak tercih etme.
- Ama anlam kaybı ciddi ise kullanıcı düzenlemesini kabul etme.

Örnek:
Orijinal: "kimsesiz"
AI önerisi: "kimsesiz"
Kullanıcı düzenlemesi: "yalnız"

Bu değişiklik bağlama uygunsa kabul edilebilir.
"Yalnız" kelimesinin "kimsesiz" ifadesindeki sahipsizlik
nüansını tam taşımadığı reason alanında belirtilebilir.

Başka örnek:
Orijinal: "kimsesiz"
AI önerisi: "kimsesiz"
Kullanıcı düzenlemesi: "hasretin"

Bu değişiklik anlam bakımından ilgisiz olduğu için
kabul edilmemelidir.

Kurallar:
- Kullanıcı düzenlemesini otomatik olarak doğru kabul etme.
- AI önerisini de otomatik olarak doğru kabul etme.
- Orijinal metni, bağlamı ve anlamı birlikte değerlendir.
- Sadece verilen metinlere dayan.
- Bilmediğin bilgiyi uydurma.
- accepted, kullanıcı düzenlemesi kullanılabilir durumdaysa true olsun.
- recommended_text, accepted=true ise tercihen kullanıcının
  düzenlemesi olsun.
- accepted=false ise recommended_text en uygun metni içersin.
- changed_from_ai, recommended_text AI önerisinden farklıysa true olsun.
- confidence değeri 0.0 ile 1.0 arasında olmalı.
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
""".strip()


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
            max_tokens=350,
        )

        answer_text = (
            response.choices[0].message.content or ""
        ).strip()

        result = parse_model_json(
            answer_text
        )
            
        if not result:
            fallback_text = (
                ai_suggestion
                if ai_suggestion
                else original_text
            )

            return {
                "accepted": False,
                "confidence": 0.0,
                "reason": (
                    "AI değerlendirmesi oluşturulamadı."
                ),
                "recommended_text": fallback_text,
                "changed_from_ai": (
                    fallback_text != ai_suggestion
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

        accepted = bool(
            result.get("accepted", False)
        )

        recommended_text = str(
            result.get(
                "recommended_text",
                "",
            )
        ).strip()

        if not recommended_text:
            if accepted:
                recommended_text = user_edit
            else:
                recommended_text = (
                    ai_suggestion
                    if ai_suggestion
                    else original_text
                )

        return {
            "accepted": accepted,
            "confidence": confidence,
            "reason": str(
                result.get(
                    "reason",
                    "",
                )
            ).strip(),
            "recommended_text": recommended_text,
            "changed_from_ai": (
                recommended_text != ai_suggestion
            ),
        }