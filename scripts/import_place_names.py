#!/usr/bin/env python3
"""Yer adları veri setini projenin transliterasyon JSONL şemasına dönüştürür."""

from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path
from typing import Any


def normalize_text(value: str) -> str:
    """Metni NFC biçimine getirir ve dış boşlukları temizler."""
    return unicodedata.normalize("NFC", value).strip()


def get_message_content(
    messages: list[dict[str, Any]],
    role: str,
) -> str | None:
    """Belirtilen role ait ilk geçerli content değerini döndürür."""
    for message in messages:
        if message.get("role") != role:
            continue

        content = message.get("content")

        if isinstance(content, str) and content.strip():
            return normalize_text(content)

    return None


def convert_file(
    input_path: Path,
    output_path: Path,
    limit: int | None,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    total = 0
    written = 0
    skipped = 0
    duplicates = 0

    seen_pairs: set[tuple[str, str]] = set()

    with input_path.open("r", encoding="utf-8") as source_file:
        with output_path.open("w", encoding="utf-8") as output_file:
            for line_number, line in enumerate(source_file, start=1):
                if limit is not None and written >= limit:
                    break

                if not line.strip():
                    continue

                total += 1

                try:
                    record = json.loads(line)
                except json.JSONDecodeError as error:
                    skipped += 1
                    print(
                        f"[UYARI] Satır {line_number}: "
                        f"geçersiz JSON ({error})"
                    )
                    continue

                messages = record.get("messages")

                if not isinstance(messages, list):
                    skipped += 1
                    print(
                        f"[UYARI] Satır {line_number}: "
                        "messages listesi bulunamadı"
                    )
                    continue

                source_ottoman = get_message_content(messages, "user")
                target_latin = get_message_content(messages, "assistant")

                if not source_ottoman or not target_latin:
                    skipped += 1
                    print(
                        f"[UYARI] Satır {line_number}: "
                        "kaynak veya hedef metin boş"
                    )
                    continue

                pair = (source_ottoman, target_latin)

                if pair in seen_pairs:
                    duplicates += 1
                    continue

                seen_pairs.add(pair)
                written += 1

                converted_record = {
                    "id": f"place_names_{written:06d}",
                    "document_id": "place_names_gazetteer",
                    "source_ottoman": source_ottoman,
                    "target_latin": target_latin,
                    "scheme": "source_original",
                    "domain": "place_name",
                    "quality": "draft",
                    "source_name": "place_names_hf",
                    "source_license": "CC-BY-NC-4.0",
                    "reviewer": "",
                    "notes": (
                        "Haricî kaynaktan içe aktarıldı; "
                        "project_v1 standardına göre henüz doğrulanmadı."
                    ),
                }

                output_file.write(
                    json.dumps(converted_record, ensure_ascii=False) + "\n"
                )

    print("=" * 60)
    print("İçe aktarma tamamlandı")
    print(f"Okunan kayıt : {total}")
    print(f"Yazılan kayıt: {written}")
    print(f"Atlanan kayıt: {skipped}")
    print(f"Tekrar kayıt : {duplicates}")
    print(f"Çıktı        : {output_path}")
    print("=" * 60)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Yer adları JSONL veri setini proje şemasına dönüştürür."
        )
    )

    parser.add_argument(
        "--input",
        required=True,
        type=Path,
        help="Kaynak JSONL dosyası",
    )

    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Dönüştürülen JSONL dosyası",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Yalnızca ilk N geçerli kaydı dönüştürür.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.input.is_file():
        raise FileNotFoundError(
            f"Girdi dosyası bulunamadı: {args.input}"
        )

    if args.limit is not None and args.limit <= 0:
        raise ValueError(
            "--limit pozitif bir tam sayı olmalıdır."
        )

    convert_file(
        input_path=args.input,
        output_path=args.output,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()

