import json
import os

from openai import OpenAI

from src.ai.rag.retriever import DocumentRetriever


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

2. RELATED
Sorunun doğrudan cevabı belgede bulunmuyorsa ancak soruyla
ilişkili veya cevaba yaklaşmaya yardımcı olabilecek bilgiler varsa:
- answer_type = "related"
- Doğrudan cevabın belgede bulunmadığını açıkça belirt.
- Belgede bulunan en yakın bilgileri açıkla.
- Bu bilgilerden kesin olarak çıkarılamayan sonuçları gerçekmiş
  gibi sunma.
- related_information alanına ilgili bilgileri kısa maddeler
  halinde ekle.

3. UNAVAILABLE
Belgelerde soruyla anlamlı şekilde ilişkili bilgi de yoksa:
- answer_type = "unavailable"
- Belgede bu soruyu cevaplamak için yeterli bilgi olmadığını belirt.
- related_information boş liste olsun.

Genel kurallar:
- Yalnızca verilen belge bağlamını kullan.
- Genel bilgini kullanarak boşlukları doldurma.
- Bilgi uydurma.
- Cevabı Türkçe ver.
- Tarih, kişi, yer ve olay adlarını belgede geçtiği biçimiyle koru.

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
- unavailable için true
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
    ) -> dict:
        if not question or not question.strip():
            raise ValueError("Question cannot be empty.")

        results = self.retriever.retrieve(
            query=question,
            top_k=top_k,
        )

        if not results:
            return {
                "answer_type": "unavailable",
                "answer": (
                    "Bu soruya cevap verebilmek için "
                    "belgede yeterli bilgi bulunamadı."
                ),
                "related_information": [],
                "external_answer_available": True,
                "sources": [],
            }

        context_parts = []

        for result in results:
            context_parts.append(
                f"[Parça {result.chunk.chunk_id}]\n"
                f"{result.chunk.text}"
            )

        context = "\n\n".join(context_parts)

        user_prompt = (
            f"BELGE BAĞLAMI:\n"
            f"{context}\n\n"
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
            max_tokens=900,
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

        try:
            cleaned_answer = answer_text

            if cleaned_answer.startswith("```json"):
                cleaned_answer = cleaned_answer[7:]

            if cleaned_answer.startswith("```"):
                cleaned_answer = cleaned_answer[3:]

            if cleaned_answer.endswith("```"):
                cleaned_answer = cleaned_answer[:-3]

            parsed_answer = json.loads(
                cleaned_answer.strip()
            )

        except json.JSONDecodeError:
            parsed_answer = {
                "answer_type": "related",
                "answer": answer_text,
                "related_information": [],
                "external_answer_available": True,
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

        related_information = parsed_answer.get(
            "related_information",
            [],
        )

        if not isinstance(related_information, list):
            related_information = []

        return {
            "answer_type": answer_type,
            "answer": parsed_answer.get(
                "answer",
                answer_text,
            ),
            "related_information": related_information,

            "external_answer_available": bool(
                parsed_answer.get(
                    "external_answer_available",
                    answer_type != "direct",
                )
            ),
            "sources": [
                {
                    "chunk_id": result.chunk.chunk_id,
                    "score": result.score,
                    "text": result.chunk.text,
                }
                for result in results
            ],
        }