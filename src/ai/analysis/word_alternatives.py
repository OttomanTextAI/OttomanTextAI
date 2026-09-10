import json
import os

from openai import OpenAI


WORD_ALTERNATIVES_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının kelime düzeyinde
okuma asistanısın.

Kullanıcı, çeviri sonucunda belirsiz/alternatif okunabilir olarak
işaretlenmiş TEK bir kelime veya kısa bir ifadeye tıkladı. Sana bu
kelimeyi, geçtiği cümleyi ve (varsa) belgenin OCR metnini vereceğim.

Görevin:
- Bu kelime için en fazla 3 alternatif okuma/yorum öner (mümkünse az ve
  öz; emin değilsen daha az öneri ver, uydurma alternatif ekleme).
- ocr_form: verilen OCR bağlamından bu kelimenin Arap harfli (Osmanlıca)
  hâlini bul ve yaz. Bağlamda kesin olarak bulamıyorsan boş string
  döndür, tahmin uydurma.
- origin: kelimenin kökenini (Arapça, Farsça, Türkçe vb.) TEK KISA
  ifadeyle belirt (en fazla birkaç kelime). Emin değilsen boş string
  döndür.
- Yalnızca verilen kelime/cümle/OCR bağlamına dayan, belgede olmayan
  bilgi uydurma.
- SADECE geçerli JSON döndür, öncesinde/sonrasında açıklama yazma,
  markdown veya ```json kod bloğu kullanma.

JSON formatı:

{
  "alternatives": ["...", "...", "..."],
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

        origin = str(result.get("origin", "")).strip()
        ocr_form = str(result.get("ocr_form", "")).strip()

        return {
            "alternatives": alternatives,
            "origin": origin,
            "ocr_form": ocr_form,
        }
