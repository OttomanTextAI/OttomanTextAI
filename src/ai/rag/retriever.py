from src.ai.rag.chunker import TextChunk, chunk_text
from src.ai.rag.embeddings import RelayEmbeddingClient
from src.ai.rag.vector_store import (
    InMemoryVectorStore,
    VectorSearchResult,
)


class DocumentRetriever:
    """
    Handles document indexing and semantic retrieval for RAG.

    Pipeline:
        document text
            -> chunks
            -> embeddings
            -> vector store

        user query
            -> query embedding
            -> similarity search
            -> relevant chunks
    """

    def __init__(
        self,
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> None:
        self.chunk_size = chunk_size
        self.overlap = overlap

        self.embedding_client = RelayEmbeddingClient()
        self.vector_store = InMemoryVectorStore()

        self.document_indexed = False

        self.document_text = ""

    def index_document(
        self,
        text: str,
    ) -> list[TextChunk]:
        if not text or not text.strip():
            raise ValueError("Document text cannot be empty.")

        chunks = chunk_text(
            text=text,
            chunk_size=self.chunk_size,
            overlap=self.overlap,
        )

        if not chunks:
            raise ValueError(
                "Document did not produce any chunks."
            )

        embeddings = self.embedding_client.embed_texts(
            [chunk.text for chunk in chunks]
        )

        if len(embeddings) != len(chunks):
            raise RuntimeError(
                "Embedding count does not match chunk count."
            )

        # This retriever currently represents one document.
        self.vector_store.clear()

        self.vector_store.add(
            chunks=chunks,
            embeddings=embeddings,
        )

        self.document_text = text.strip()
        self.document_indexed = True

        return chunks

    def retrieve(
        self,
        query: str,
        top_k: int = 3,
    ) -> list[VectorSearchResult]:
        if not self.document_indexed:
            raise RuntimeError(
                "A document must be indexed before retrieval."
            )

        if not query or not query.strip():
            raise ValueError("Query cannot be empty.")

        query_embedding = self.embedding_client.embed_text(
            query
        )

        return self.vector_store.search(
            query_embedding=query_embedding,
            top_k=top_k,
        )