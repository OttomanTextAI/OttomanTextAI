import os

from openai import OpenAI


DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"


class RelayEmbeddingClient:
    """
    Creates embeddings through the existing RelayGPU
    OpenAI-compatible API infrastructure.
    """

    def __init__(
        self,
        model: str = DEFAULT_EMBEDDING_MODEL,
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

    def embed_text(self, text: str) -> list[float]:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty.")

        response = self.client.embeddings.create(
            model=self.model,
            input=text.strip(),
        )

        return response.data[0].embedding

    def embed_texts(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        cleaned_texts = [
            text.strip()
            for text in texts
            if text and text.strip()
        ]

        if not cleaned_texts:
            return []

        response = self.client.embeddings.create(
            model=self.model,
            input=cleaned_texts,
        )

        return [
            item.embedding
            for item in response.data
        ]