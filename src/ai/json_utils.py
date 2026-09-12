import json


def clean_model_json_text(
    raw_text: str,
) -> str:
    cleaned = (raw_text or "").strip()

    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]

    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


def parse_model_json(
    raw_text: str,
) -> dict:
    cleaned = clean_model_json_text(
        raw_text
    )

    if not cleaned:
        return {}

    try:
        result = json.loads(cleaned)

    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")

        if (
            start == -1
            or end == -1
            or end <= start
        ):
            return {}

        try:
            result = json.loads(
                cleaned[start:end + 1]
            )

        except json.JSONDecodeError:
            return {}

    if not isinstance(result, dict):
        return {}

    return result