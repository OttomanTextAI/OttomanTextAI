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

1. ocr_form (ZORUNLU, boş bırakma): ocr_context'i DİKKATLİCE oku, verilen
   word/sentence'ın ocr_context içindeki Arap harfli karşılığını BUL ve
   onu ocr_form alanına AYNEN (ocr_context'te yazdığı gibi) yaz. Bu bir
   tahmin değil, ocr_context'in içinde zaten mevcut olan bir arama
   işlemidir — kelime, translit/trans biçiminde farklı görünse de
   ocr_context'teki Arap harfli karşılığını mutlaka bulabilirsin.
   ÖRNEK: word "edip" ise ve ocr_context içinde "ايدوب" geçiyorsa,
   ocr_form kesinlikle "ايدوب" olmalıdır (boş değil). SADECE ocr_context
   alanı tamamen boş/verilmemişse ocr_form'u boş string yap; aksi halde
   MUTLAKA bir değer yaz.

2. origin (ZORUNLU, boş bırakma): kelimenin kökenini kısaca belirt
   (Arapça, Farsça, Türkçe, Osmanlıca bileşik vb.). Kelime sıradan,
   bilinen bir Türkçe kelimeyse bile bu alanı "Türkçe" yaz — ASLA boş
   string döndürme. ÖRNEK: word "su" ise, origin kesinlikle "Türkçe"
   olmalıdır (boş değil). Bu alanı boş bırakmak KABUL EDİLEMEZ; emin
   olamadığın durumda bile en olası kökeni yaz, boş string yazma.

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
            # 500 was too low and was the ACTUAL root cause of ocr_form/
            # origin coming back empty: this model spends a chunk of its
            # token budget on hidden reasoning before emitting any visible
            # JSON, so at max_tokens=500 the response was silently cut off
            # (finish_reason="length") a few characters into the JSON —
            # confirmed by calling the relay directly and inspecting the
            # raw (truncated) completion. 2000 leaves enough headroom for
            # that reasoning plus the full JSON body; the prompt fixes
            # above are necessary but were never the actual bottleneck.
            max_tokens=2000,
        )

        finish_reason = completion.choices[0].finish_reason

        if finish_reason == "length":
            print(
                "[WORD ALTERNATIVES] Response was truncated "
                "(finish_reason=length) — model may need more max_tokens.",
                flush=True,
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

        # ocr_form için de boş bırakmıyoruz — ama yalnızca aranacak bir
        # ocr_context GERÇEKTEN verilmişken. Aksi halde ("ocr_context"
        # boşsa, örn. context olmadan tek kelime testi) boş ocr_form
        # zaten beklenen/doğru davranış; uydurma bir Arapça metin
        # yazmaktansa (yanlış bilgi, boş bırakmaktan kötüdür) bu tek
        # durumda boş bırakıyoruz.
        if not ocr_form and trimmed_ocr_context:
            ocr_form = "Bulunamadı"

        return {
            "alternatives": alternatives,
            "origin": origin,
            "ocr_form": ocr_form,
        }
