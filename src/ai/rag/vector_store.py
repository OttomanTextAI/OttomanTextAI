from dataclasses import dataclass
import math

from src.ai.rag.chunker import TextChunk


@dataclass
class VectorSearchResult:
    chunk: TextChunk
    score: float


class InMemoryVectorStore:
    """
    Lightweight in-memory vector store for document RAG.

    Stores document chunks together with their embeddings and
    retrieves the most semantically similar chunks using
    cosine similarity.
    """

    def __init__(self) -> None:
        self.chunks: list[TextChunk] = []
        self.embeddings: list[list[float]] = []

    def add(
        self,
        chunks: list[TextChunk],
        embeddings: list[list[float]],
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError(
                "Chunk and embedding counts must match."
            )

        if not chunks:
            return

        self.chunks.extend(chunks)
        self.embeddings.extend(embeddings)

    def clear(self) -> None:
        self.chunks.clear()
        self.embeddings.clear()

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 3,
    ) -> list[VectorSearchResult]:
        if not query_embedding:
            raise ValueError("Query embedding cannot be empty.")

        if not self.embeddings:
            return []

        if top_k <= 0:
            raise ValueError("top_k must be greater than 0.")

        scored_results = []

        for chunk, embedding in zip(
            self.chunks,
            self.embeddings,
        ):
            score = self._cosine_similarity(
                query_embedding,
                embedding,
            )

            scored_results.append(
                VectorSearchResult(
                    chunk=chunk,
                    score=score,
                )
            )

        scored_results.sort(
            key=lambda result: result.score,
            reverse=True,
        )

        return scored_results[:top_k]

    @staticmethod
    def _cosine_similarity(
        vector_a: list[float],
        vector_b: list[float],
    ) -> float:
        if len(vector_a) != len(vector_b):
            raise ValueError(
                "Embedding dimensions must match."
            )

        dot_product = sum(
            a * b
            for a, b in zip(vector_a, vector_b)
        )

        magnitude_a = math.sqrt(
            sum(a * a for a in vector_a)
        )

        magnitude_b = math.sqrt(
            sum(b * b for b in vector_b)
        )

        if magnitude_a == 0 or magnitude_b == 0:
            return 0.0

        return dot_product / (
            magnitude_a * magnitude_b
        )