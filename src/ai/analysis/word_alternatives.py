import json
import os

from openai import OpenAI


WORD_ALTERNATIVES_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının kelime düzeyinde
okuma asistanısın.

Kullanıcı, çeviri sonucunda belirsiz/alternatif okunabilir olarak
işaretlenmiş TEK bir kelime veya kısa bir ifadeye tıkladı. Sana bu
kelimeyi, geçtiği cümleyi ve belgenin OCR metnini (ocr_context)
vereceğim. ocr_context, bu kelimenin de içinde geçtiği GERÇEK belge
metnidir — kelimenin Arap harfli karşılığı orada mutlaka vardır.

Aşağıdaki üç alanın HİÇBİRİ boş/eksik dönmemeli — kullanıcıya asla boş
bir kart gösterilmemeli:

1. ocr_form (ZORUNLU, boş bırakma): ocr_context içinde, verilen
   word/sentence'a karşılık gelen Arap harfli (Osmanlıca) kısmı bul ve
   birebir aynen yaz. ocr_context'te tam eşleşme bulamazsan bile, en
   yakın karşılık gelen kısmı yaz — SADECE ocr_context tamamen boşsa
   veya kelime hiçbir şekilde belgeyle ilişkilendirilemiyorsa boş string
   döndür.

2. origin (ZORUNLU, boş bırakma): kelimenin kökenini kısaca belirt
   (Arapça, Farsça, Türkçe, Osmanlıca bileşik vb.). Kelime sıradan,
   bilinen bir Türkçe kelimeyse bile "Türkçe" ya da "Standart Türkçe
   kelime" yaz — belirsizlik yokmuş gibi görünse de bu alanı ASLA boş
   bırakma.

3. alternatives (ZORUNLU, EN AZ 1 ÖĞE): en fazla 3 alternatif okuma/
   yorum öner. Eğer kelimenin tek, net ve doğru bir okuması olduğunu
   düşünüyorsan (başka makul bir alternatif göremiyorsan), yine de
   TAMAMEN BOŞ liste döndürme — bu durumda mevcut/doğru okumanın
   KENDİSİNİ, confidence değeri 0.95 veya üzeri olacak şekilde TEK öğe
   olarak listele. Böylece kullanıcı en azından "model buna emin,
   başka alternatif yok" bilgisini görür. Her öğe {"text": "...",
   "confidence": 0.0-1.0} biçiminde bir obje olmalı.

Diğer kurallar:
- Yalnızca verilen kelime/cümle/OCR bağlamına dayan, belgede olmayan
  bilgi uydurma (ama yukarıdaki 3 alan için de ASLA boş bırakma kuralı
  geçerli — en azından en olası/mevcut değeri yaz).
- SADECE geçerli JSON döndür, öncesinde/sonrasında açıklama yazma,
  markdown veya ```json kod bloğu kullanma.

JSON formatı:

{
  "alternatives": [
    {"text": "...", "confidence": 0.95}
  ],
  "origin": "...",
  "ocr_form": "..."
}
""".strip()


class WordAlternativesGenerator:
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
        word: str,
        sentence: str = "",
        ocr_context: str = "",
        target_lang: str = "",
    ) -> dict:
        if not word or not word.strip():
            raise ValueError(
                "Word cannot be empty."
            )

        # ocr_context can be the whole document's OCR text; keep the
        # request small/fast (this is a lazy, per-click call, not part of
        # the main translation) by trimming it rather than sending pages
        # of text for a single-word lookup.
        trimmed_ocr_context = (ocr_context or "").strip()[:2000]

        user_content = (
            f"target_lang: {target_lang or 'bilinmiyor'}\n"
            f"word: {word.strip()}\n"
            f"sentence: {(sentence or '').strip()}\n"
            f"ocr_context: {trimmed_ocr_context}"
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": WORD_ALTERNATIVES_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            temperature=0.2,
            max_tokens=500,
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
                    "[WORD ALTERNATIVES] Invalid model response:",
                    repr(response_text),
                    flush=True,
                )

        if not isinstance(result, dict):
            result = {}

        raw_alternatives = result.get("alternatives", [])

        if not isinstance(raw_alternatives, list):
            raw_alternatives = []

        alternatives = []

        for item in raw_alternatives[:3]:
            text = str(item).strip() if not isinstance(item, dict) else str(
                item.get("text", "")
            ).strip()

            if text:
                alternatives.append(text)

        # Prompt modeli en az 1 öğe döndürmeye (belirsizse birkaç
        # alternatif, netse tek/yüksek-confidence'lı mevcut okuma)
        # yönlendiriyor, ama model buna her zaman uymayabilir. Kullanıcının
        # tamamen boş bir kartla karşılaşmaması için, model yine de boş
        # liste döndürürse tıklanan kelimenin kendisini tek seçenek olarak
        # kullan — bu, "model başka alternatif görmüyor" durumuna eşdeğer.
        if not alternatives:
            alternatives = [word.strip()]

        origin = str(result.get("origin", "")).strip()
        ocr_form = str(result.get("ocr_form", "")).strip()

        # origin de aynı şekilde ASLA boş dönmemeli (bkz. prompt kural 2);
        # model buna uymazsa bile kullanıcı boş bir alan yerine en azından
        # "belirlenemedi" görsün.
        if not origin:
            origin = "Belirlenemedi"

        return {
            "alternatives": alternatives,
            "origin": origin,
            "ocr_form": ocr_form,
        }
