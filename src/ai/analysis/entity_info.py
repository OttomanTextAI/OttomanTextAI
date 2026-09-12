import os

from openai import OpenAI

from src.ai.json_utils import parse_model_json


ENTITY_INFO_SYSTEM_PROMPT = """
Sen Divane adlı Osmanlıca belge analiz uygulamasının bağlam-duyarlı bilgi
asistanısın.

Kullanıcı, çeviri metninde geçen bir kişi/yer/kavram/tarih/olay ifadesine
tıkladı. Sana bu ifadeyi (entity), türünü (entity_type: person/place/
concept/date/event) ve metinde geçtiği cümleyi (sentence) vereceğim.

Görevin: HEM verilen bağlamı (sentence) HEM DE genel bilgini kullanarak,
bu ifade hakkında KISA (2-4 cümle), bağlamdan çok uzaklaşmadan öğretici bir
bilgi ver. Sadece cümleyi tekrar etme — bağlama, genel/tarihi bilgi ekle.

Türüne göre şunlara odaklan:
- place (yer): günümüzdeki konumu/idari bağlılığı (hangi il/ülke) VE
  metnin anlattığı dönemdeki tarihi/stratejik bağlamı belirt.
- person (kişi): kim olduğu (tarihi kimliği, dönemi) VE metindeki rolü.
- concept (kavram): kavramın ne anlama geldiği VE metindeki kullanım
  bağlamı.
- date (tarih): bu tarihin (hicri/miladi) neye karşılık geldiği VE
  metindeki önemi.
- event (olay): olayın ne zaman/nerede yaşandığı, tarafları/sonucu VE
  metindeki bağlamdaki önemi.

Diğer kurallar:
- Uzun paragraf yazma, KISA VE ÖZ tut (2-4 cümle, bir makale değil, hızlı
  bir bilgi notu).
- Yalnızca verilen bağlama ve güvenilir genel bilgine dayan; emin
  olmadığın ayrıntıları kesinmiş gibi sunma, tarih/isim uydurma.
- SADECE geçerli JSON döndür, öncesinde/sonrasında açıklama yazma,
  markdown veya ```json kod bloğu kullanma.

JSON formatı:

{
  "info": "..."
}
""".strip()


class EntityInfoGenerator:
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
        entity: str,
        entity_type: str = "",
        sentence: str = "",
    ) -> dict:
        if not entity or not entity.strip():
            raise ValueError(
                "Entity cannot be empty."
            )

        user_content = (
            f"entity_type: {entity_type or 'bilinmiyor'}\n"
            f"entity: {entity.strip()}\n"
            f"sentence: {(sentence or '').strip()}"
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": ENTITY_INFO_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
            temperature=0.3,
            # See the identical lesson in word_alternatives.py: this model
            # spends part of its token budget on hidden reasoning before
            # emitting visible JSON, so a low max_tokens silently truncates
            # the response (finish_reason="length") before "info" is even
            # written. 2000 leaves enough headroom for that plus the (short)
            # 2-4 sentence answer.
            max_tokens=2000,
        )

        finish_reason = completion.choices[0].finish_reason

        if finish_reason == "length":
            print(
                "[ENTITY INFO] Response was truncated "
                "(finish_reason=length) — model may need more max_tokens.",
                flush=True,
            )

        response_text = (
            completion.choices[0].message.content
            or ""
        ).strip()

        result = parse_model_json(
            response_text
        )

        if not result:
            print(
                "[ENTITY INFO] Invalid model response:",
                repr(response_text),
                flush=True,
            )
            result = {}

        info = str(result.get("info", "")).strip()

        return {
            "info": info,
        }
