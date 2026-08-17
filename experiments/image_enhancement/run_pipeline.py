"""Run the image enhancement pipeline on all images in a directory."""

from pathlib import Path

import cv2

from src.image_enhancement.preprocess import preprocess_image


SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}

INPUT_DIRECTORY = Path("data/raw/ground_truth")
OUTPUT_DIRECTORY = Path("data/processed/image_enhancement")


def process_directory(
    input_directory: Path,
    output_directory: Path,
) -> None:
    """Process all supported images inside a directory.

    Args:
        input_directory: Directory containing input images.
        output_directory: Directory where processed images will be saved.
    """
    if not input_directory.exists():
        raise FileNotFoundError(
            f"Input directory does not exist: {input_directory}"
        )

    output_directory.mkdir(parents=True, exist_ok=True)

    image_paths = sorted(
        path
        for path in input_directory.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    if not image_paths:
        print(f"No supported image files found in: {input_directory}")
        return

    for image_path in image_paths:
        image = cv2.imread(str(image_path))

        if image is None:
            print(f"Skipped unreadable image: {image_path}")
            continue

        processed_image = preprocess_image(
            image,
            profile="printed-degraded",
        )

        output_path = output_directory / image_path.name

        is_saved = cv2.imwrite(
            str(output_path),
            processed_image,
        )

        if not is_saved:
            print(f"Failed to save image: {output_path}")
            continue

        print(f"Processed: {image_path} -> {output_path}")


def main() -> None:
    """Run the image enhancement experiment."""
    process_directory(
        input_directory=INPUT_DIRECTORY,
        output_directory=OUTPUT_DIRECTORY,
    )


if __name__ == "__main__":
    main()