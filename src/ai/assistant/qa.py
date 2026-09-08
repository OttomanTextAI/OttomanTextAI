import os

from openai import OpenAI

from src.ai.rag.retriever import DocumentRetriever


DOCUMENT_QA_SYSTEM_PROMPT = """
Sen Akıllı Osmanlıca Asistanı'nın belge analiz asistanısın.

Görevin, kullanıcının sorusunu yalnızca sana verilen belge
bağlamına dayanarak cevaplamaktır.

Kurallar:
- Belge bağlamında bulunmayan bilgileri uydurma.
- Cevap belgede yoksa bunu açıkça belirt.
- Cevabı Türkçe ver.
- Kısa, açık ve doğrudan cevap ver.
- Tarih, kişi, yer ve olay adlarını belgede geçtiği biçimiyle koru.
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
                "answer": (
                    "Bu soruya cevap verebilmek için "
                    "belgede yeterli bilgi bulunamadı."
                ),
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
            max_tokens=500,
        )

        answer_text = (
            completion.choices[0].message.content or ""
        ).strip()

        return {
            "answer": answer_text,
            "sources": [
                {
                    "chunk_id": result.chunk.chunk_id,
                    "score": result.score,
                    "text": result.chunk.text,
                }
                for result in results
            ],
        }