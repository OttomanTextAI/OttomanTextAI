import os

from openai import OpenAI

from src.ai.rag.retriever import DocumentRetriever
from src.ai.json_utils import parse_model_json

DOCUMENT_QA_SYSTEM_PROMPT = """
Sen Akıllı Osmanlıca Asistanı'nın belge analiz asistanısın.

Görevin, kullanıcının sorusunu yalnızca sana verilen belge
bağlamına dayanarak değerlendirmek ve cevaplamaktır.

Üç olası durum vardır:
1. DIRECT
Sorunun cevabı belge bağlamında açıkça bulunuyorsa:
- answer_type = "direct"
- Soruyu doğrudan cevapla.
- Belgede olmayan hiçbir bilgi ekleme.
- answer yalnızca belgeye dayanmalı.

2. RELATED
Sorunun doğrudan cevabı belge bağlamında bulunmuyorsa ancak soru:
- yüklenen belgeyle,
- belgede geçen kişi, yer, olay, dönem veya kavramlarla,
- Osmanlıca, Osmanlı tarihi, tarihsel belgeler veya belge analiziyle
anlamlı şekilde ilişkiliyse:
- answer_type = "related"
- Önce, doğrudan cevabın yüklenen belgede bulunmadığını açıkça belirt.
- Belgede soruyla ilişkili bilgi varsa bunu kısa şekilde açıkla.
- Bu aşamada genel bilgi kullanma.
- Yalnızca belge bağlamında bulunan en yakın bilgiyi açıkla.
- Genel bilgi gerekiyorsa bunu sen üretme; yalnızca external_answer_available = true olarak işaretle.
- Belgede kesin olarak çıkarılamayan sonuçları gerçekmiş gibi sunma.
- related_information alanına belge içinde bulunan ilgili bilgileri
  en fazla 3 kısa madde halinde ekle.

3. UNAVAILABLE
Sorunun cevabı belge bağlamında bulunmuyorsa ve soru:
- yüklenen belgeyle,
- belgede geçen kişi, yer, olay, dönem veya kavramlarla,
- Osmanlıca, Osmanlı tarihi, tarihsel belgeler veya belge analiziyle
anlamlı şekilde ilişkili değilse:
- answer_type = "unavailable"
- Sorunun sistemin kapsamı dışında olduğunu kısa şekilde belirt.
- Genel bilgi kullanarak cevap verme.
- related_information boş liste olsun.

Genel kurallar:
- Öncelik her zaman verilen belge bağlamıdır.
- Belge içinde cevap varsa genel bilgi kullanma.
- Genel bilgi yalnızca answer_type = "related" olduğunda kullanılabilir.
- answer_type = "unavailable" olduğunda genel bilgi kullanma.
- Bilgi uydurma.
- Cevabı Türkçe ver.
- Tarih, kişi, yer ve olay adlarını belge bilgisinden aktarırken belgede geçtiği biçimiyle koru.
- answer alanını kısa ve doğrudan tut.
- answer en fazla 4 cümle olsun.
- related_information en fazla 3 kısa madde içersin.
- JSON dışında hiçbir metin üretme.
- Markdown kullanma.
- Önceki konuşma verilmişse takip sorularını bu konuşmaya göre yorumla.
- Önceki konuşmadaki bilgileri yalnızca belge bağlamı ve aktif konu ile uyumluysa kullan.

Örnek kararlar:
- Belgede "Fatih Sultan Mehmed" geçiyor ve kullanıcı "Fatih Sultan Mehmed kaç yaşında öldü?" diye soruyorsa:
  answer_type = "related"
- Kullanıcı "Fransa nerede?" diye soruyorsa ve bunun belgeyle veya sistemin alanıyla ilgisi yoksa:
  answer_type = "unavailable"

SADECE geçerli JSON döndür.
JSON formatı:

{
  "answer_type": "direct | related | unavailable",
  "answer": "Kullanıcıya gösterilecek cevap",
  "related_information": ["ilgili bilgi 1", "ilgili bilgi 2"],
  "external_answer_available": true
}

external_answer_available:
- direct için false
- related için true
- unavailable için false
""".strip()


class DocumentQA:
    def __init__(
        self,
        retriever: DocumentRetriever,
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

        self.retriever = retriever
        self.model = model

    def answer(
        self,
        question: str,
        top_k: int = 3,
        history: list | None = None,
        selected_context: dict | None = None,
    ) -> dict:
        if not question or not question.strip():
            raise ValueError("Question cannot be empty.")

        retrieval_query = question.strip()

        if isinstance(selected_context, dict):
            selected_context_text = str(
                selected_context.get("text", "")
            ).strip()

            if selected_context_text:
                retrieval_query = (
                    f"{selected_context_text}\n"
                    f"{retrieval_query}"
                )

        results = self.retriever.retrieve(
            query=retrieval_query,
            top_k=top_k,
        )

        if not results:
            results = []

        context_parts = []

        for result in results:
            context_parts.append(
                f"[Parça {result.chunk.chunk_id}]\n"
                f"{result.chunk.text}"
            )

        context = "\n\n".join(context_parts)

        if not context.strip():
            context = (
                "Bu soru için belge bağlamından "
                "ilgili bir parça getirilemedi."
            )
        history = history or []

        recent_history = history[-4:]

        history_parts = []

        for item in recent_history:
            if not isinstance(item, dict):
                continue

            role = str(
                item.get("role", "")
            ).strip().lower()

            content = str(
                item.get("content", "")
            ).strip()

            if not content:
                continue

            if role not in {
                "user",
                "assistant",
            }:
                continue

            label = (
                "Kullanıcı"
                if role == "user"
                else "Asistan"
            )

            history_parts.append(
                f"{label}: {content}"
            )

        conversation_history = "\n".join(
            history_parts
        )

        history_section = ""

        if conversation_history:
            history_section = (
                "ÖNCEKİ KONUŞMA:\n"
                f"{conversation_history}\n\n"
            )

        selected_context_section = ""

        if isinstance(selected_context, dict):
            context_type = str(
                selected_context.get("type", "")
            ).strip()

            context_text = str(
                selected_context.get("text", "")
            ).strip()

            context_details = str(
                selected_context.get("details", "")
            ).strip()

            if context_text:
                selected_context_section = (
                    "KULLANICININ SEÇTİĞİ AKTİF KONU:\n"
                    f"Tür: {context_type or 'belirtilmedi'}\n"
                    f"İçerik: {context_text}\n"
                )

                if context_details:
                    selected_context_section += (
                        f"Ek bilgi: {context_details}\n"
                    )

                selected_context_section += (
                    "Takip sorularındaki 'bu kişi', 'bu konu', "
                    "'bu olay', 'bu kavram' gibi ifadeleri öncelikle "
                    "bu aktif konuya göre yorumla.\n\n"
                )

        user_prompt = (
            f"BELGE BAĞLAMI:\n"
            f"{context}\n\n"
            f"{selected_context_section}"
            f"{history_section}"
            f"KULLANICI SORUSU:\n"
            f"{question.strip()}"
        )

        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": DOCUMENT_QA_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            temperature=0.1,
            max_tokens=700,
        )

        finish_reason = completion.choices[0].finish_reason

        if finish_reason == "length":
            print(
                "[DOCUMENT QA] Response stopped because max token limit was reached.",
                flush=True,
            )

        answer_text = (
            completion.choices[0].message.content or ""
        ).strip()

        parsed_answer = parse_model_json(
            answer_text
        )

        if not parsed_answer:
            print(
                "[DOCUMENT QA] Invalid JSON response:",
                repr(answer_text),
                flush=True,
            )

            parsed_answer = {
                "answer_type": "unavailable",
                "answer": (
                    "Belge yanıtı oluşturulurken bir biçimlendirme "
                    "hatası oluştu. Lütfen sorunuzu tekrar deneyin."
                ),
                "related_information": [],
                "external_answer_available": False,
            }

        if not isinstance(parsed_answer, dict):
            parsed_answer = {
                "answer_type": "unavailable",
                "answer": (
                    "Belge yanıtı oluşturulurken bir biçimlendirme "
                    "hatası oluştu. Lütfen sorunuzu tekrar deneyin."
                ),
                "related_information": [],
                "external_answer_available": False,
            }
            
        answer_type = parsed_answer.get(
            "answer_type",
            "related",
        )

        if answer_type not in {
            "direct",
            "related",
            "unavailable",
        }:
            answer_type = "related"

        if answer_type == "related":
            try:
                external_prompt = (
                    "Sen Akıllı Osmanlıca Asistanı'nın genel bilgi asistanısın.\n\n"
                    "Kullanıcının sorusu yüklenen belgede doğrudan "
                    "cevaplanamamıştır ancak belge, Osmanlıca, Osmanlı tarihi, "
                    "tarihsel kişi, yer, olay, dönem veya kavramlarla "
                    "anlamlı şekilde ilişkilidir.\n\n"
                    f"KULLANICI SORUSU:\n{question.strip()}\n\n"
                    "Soruyu genel bilgine dayanarak Türkçe ve kısa şekilde cevapla.\n"
                    "En fazla 3 cümle kullan.\n"
                    "Bilmediğin veya emin olmadığın bilgiyi uydurma.\n"
                    "Sadece kullanıcıya gösterilecek cevabı üret."
                )

                external_completion = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "user",
                            "content": external_prompt,
                        }
                    ],
                    temperature=0.1,
                    max_tokens=500,
                )

                external_answer = (
                    external_completion.choices[0].message.content or ""
                ).strip()

                external_finish_reason = (
                    external_completion.choices[0].finish_reason
                )

                if external_finish_reason == "length":
                    print(
                        "[DOCUMENT QA] External answer truncated. Retrying...",
                        flush=True,
                    )

                    external_completion = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {
                                "role": "user",
                                "content": (
                                    external_prompt
                                    + "\n\nYanıtını en fazla 2 kısa cümlede tamamla. "
                                    "Cümleyi yarıda bırakma."
                                ),
                            }
                        ],
                        temperature=0.1,
                        max_tokens=400,
                    )

                    external_answer = (
                        external_completion.choices[0].message.content or ""
                    ).strip()

                if external_answer and external_answer[-1] not in ".!?…":
                    print(
                        "[DOCUMENT QA] External answer appears incomplete. Retrying...",
                        flush=True,
                    )

                    retry_completion = self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {
                                "role": "user",
                                "content": (
                                    external_prompt
                                    + "\n\nEn fazla 2 kısa ve TAM cümleyle cevap ver. "
                                    "Son cümleyi mutlaka noktalama işaretiyle tamamla."
                                ),
                            }
                        ],
                        temperature=0.1,
                        max_tokens=400,
                    )

                    retry_answer = (
                        retry_completion.choices[0].message.content or ""
                    ).strip()

                    if retry_answer:
                        external_answer = retry_answer    
                if external_answer:
                    document_answer = str(
                        parsed_answer.get("answer", "")
                    ).strip()

                    if document_answer:
                        parsed_answer["answer"] = (
                            f"{document_answer}\n\n"
                            f"Genel bilgilere göre: {external_answer}"
                        )
                    else:
                        parsed_answer["answer"] = (
                            "Yüklenen belgede bu sorunun doğrudan cevabı "
                            "bulunmuyor.\n\n"
                            f"Genel bilgilere göre: {external_answer}"
                        )

            except Exception as exc:
                print(
                    "[DOCUMENT QA] External answer failed:",
                    repr(exc),
                    flush=True,
                )
                    
        related_information = parsed_answer.get(
            "related_information",
            [],
        )

        if not isinstance(related_information, list):
            related_information = []

        return {
            "answer_type": answer_type,
            "answer": parsed_answer.get(
                "answer"
            ) or (
                "Belgeden uygun bir yanıt oluşturulamadı. "
                "Lütfen sorunuzu farklı şekilde tekrar deneyin."
            ),
            "related_information": related_information,

            "external_answer_available": answer_type == "related",
            "sources": [
                {
                    "chunk_id": result.chunk.chunk_id,
                    "score": result.score,
                    "text": result.chunk.text,
                }
                for result in results
            ],
        }