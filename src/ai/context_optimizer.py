def optimize_document_context(
    text: str,
    max_chars: int = 14000,
) -> str:
    """
    Reduce very long document text before sending it to an LLM.

    Short documents are returned unchanged.

    For long documents, paragraphs are sampled from the
    beginning, middle and end so that the overall document
    structure is still represented.
    """

    if not text:
        return ""

    cleaned = text.strip()

    if len(cleaned) <= max_chars:
        return cleaned

    paragraphs = [
        paragraph.strip()
        for paragraph in cleaned.split("\n")
        if paragraph.strip()
    ]

    if not paragraphs:
        return cleaned[:max_chars]

    # Keep approximately:
    # 40% beginning
    # 30% middle
    # 30% end
    beginning_budget = int(max_chars * 0.40)
    middle_budget = int(max_chars * 0.30)
    end_budget = max_chars - beginning_budget - middle_budget

    beginning_parts = []
    current_length = 0

    for paragraph in paragraphs:
        paragraph_length = len(paragraph) + 1

        if current_length + paragraph_length > beginning_budget:
            break

        beginning_parts.append(paragraph)
        current_length += paragraph_length

    end_parts = []
    current_length = 0

    for paragraph in reversed(paragraphs):
        paragraph_length = len(paragraph) + 1

        if current_length + paragraph_length > end_budget:
            break

        end_parts.append(paragraph)
        current_length += paragraph_length

    end_parts.reverse()

    used_beginning = len(beginning_parts)
    used_end = len(end_parts)

    middle_start = used_beginning
    middle_end = len(paragraphs) - used_end

    remaining_middle = paragraphs[
        middle_start:middle_end
    ]

    middle_parts = []

    if remaining_middle:
        # Evenly sample middle paragraphs instead of
        # keeping only one consecutive section.
        sample_count = min(
            len(remaining_middle),
            8,
        )

        if sample_count == 1:
            indexes = [0]
        else:
            indexes = [
                round(
                    index
                    * (len(remaining_middle) - 1)
                    / (sample_count - 1)
                )
                for index in range(sample_count)
            ]

        current_length = 0

        for index in indexes:
            paragraph = remaining_middle[index]
            paragraph_length = len(paragraph) + 1

            if current_length + paragraph_length > middle_budget:
                break

            middle_parts.append(paragraph)
            current_length += paragraph_length

    optimized_parts = []

    optimized_parts.extend(beginning_parts)

    if middle_parts:
        optimized_parts.append(
            "[BELGENİN ORTA BÖLÜMÜNDEN SEÇİLMİŞ PARÇALAR]"
        )
        optimized_parts.extend(middle_parts)

    if end_parts:
        optimized_parts.append(
            "[BELGENİN SON BÖLÜMÜ]"
        )
        optimized_parts.extend(end_parts)

    optimized = "\n".join(optimized_parts)

    # Absolute safety limit.
    return optimized[:max_chars]