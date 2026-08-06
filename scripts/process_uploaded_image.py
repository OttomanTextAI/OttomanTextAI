"""Process a user-provided document image."""

from pathlib import Path

from src.image_enhancement.enhance import enhance_image


SUPPORTED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".bmp",
    ".tif",
    ".tiff",
}


def process_uploaded_image(
    input_path: str | Path,
    output_path: str | Path | None = None,
    profile: str = "printed",
) -> Path:
    """
    Enhance a user-provided document image.

    Args:
        input_path: Path of the uploaded input image.
        output_path: Optional output file path.

    Returns:
        Path of the enhanced output image.

    Raises:
        FileNotFoundError: If the input image does not exist.
        IsADirectoryError: If the input path points to a directory.
        ValueError: If the file extension is unsupported.
    """
    source_path = Path(input_path)

    if not source_path.exists():
        raise FileNotFoundError(
            f"Input image not found: {source_path}"
        )

    if source_path.is_dir():
        raise IsADirectoryError(
            f"Expected an image file, but received a directory: {source_path}"
        )

    if source_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            "Unsupported image format: "
            f"{source_path.suffix}. "
            f"Supported formats: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    if output_path is None:
        destination_path = (
            Path("data")
            / "processed"
            / "image_enhancement"
            / f"{source_path.stem}_enhanced.png"
        )
    else:
        destination_path = Path(output_path)

    destination_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    input_bytes = source_path.read_bytes()

    output_bytes = enhance_image(
        input_bytes,
        profile=profile,
    )

    destination_path.write_bytes(
        output_bytes
    )

    return destination_path


def main() -> None:
    """Run image enhancement using a path entered by the user."""
    input_value = input(
        "İyileştirilecek görüntünün yolunu girin: "
    ).strip().strip('"')

    output_value = input(
        "Çıktı yolu girin "
        "(boş bırakırsanız otomatik oluşturulur): "
    ).strip().strip('"')

    output_path = (
        output_value
        if output_value
        else None
    )

    profile_value = input(
        "Belge profili "
        "(printed/manuscript, varsayılan printed): "
    ).strip().lower()

    selected_profile = (
        profile_value
        if profile_value
        else "printed"
    )

    saved_path = process_uploaded_image(
        input_value,
        output_path,
        profile=selected_profile,
    )

    print(
        f"İyileştirilmiş görüntü kaydedildi: {saved_path}"
    )


if __name__ == "__main__":
    main()