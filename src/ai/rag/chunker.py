from dataclasses import dataclass


@dataclass
class TextChunk:
    chunk_id: int
    text: str
    start: int
    end: int


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[TextChunk]:
    """
    Split document text into overlapping chunks for RAG.

    chunk_size and overlap are character based for now.
    This keeps the first version simple and provider independent.
    """

    if not text or not text.strip():
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0.")

    if overlap < 0:
        raise ValueError("overlap cannot be negative.")

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size.")

    text = text.strip()

    chunks: list[TextChunk] = []

    start = 0
    chunk_id = 0
    text_length = len(text)

    while start < text_length:
        target_end = min(
            start + chunk_size,
            text_length,
        )

        end = target_end

        # Avoid cutting a sentence in the middle when possible.
        if target_end < text_length:
            search_start = start + (chunk_size // 2)

            sentence_end_positions = [
                text.rfind(".", search_start, target_end),
                text.rfind("?", search_start, target_end),
                text.rfind("!", search_start, target_end),
                text.rfind("\n", search_start, target_end),
            ]

            best_sentence_end = max(sentence_end_positions)

            if best_sentence_end != -1:
                end = best_sentence_end + 1

        chunk_content = text[start:end].strip()

        if chunk_content:
            chunks.append(
                TextChunk(
                    chunk_id=chunk_id,
                    text=chunk_content,
                    start=start,
                    end=end,
                )
            )

            chunk_id += 1

        if end >= text_length:
            break

        next_start = end - overlap

        # Safety against an accidental infinite loop.
        if next_start <= start:
            next_start = end

        start = next_start

    return chunks