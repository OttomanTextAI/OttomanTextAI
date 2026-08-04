"""Manual test script for thresholding operations."""

from pathlib import Path

from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
)
from src.image_enhancement.threshold import (
    apply_adaptive_threshold,
    apply_otsu_threshold,
)
from src.image_enhancement.utils import (
    read_image,
    save_image,
)


INPUT_PATH = Path(
    "data/raw/ground_truth/sample_01.png"
)

OTSU_OUTPUT_PATH = Path(
    "data/processed/sample_01_otsu.png"
)

ADAPTIVE_OUTPUT_PATH = Path(
    "data/processed/sample_01_adaptive.png"
)


def main() -> None:
    """Run thresholding operations on a sample image."""
    image = read_image(INPUT_PATH)

    grayscale_image = convert_to_grayscale(image)
    enhanced_image = apply_clahe(grayscale_image)

    otsu_image = apply_otsu_threshold(
        enhanced_image,
    )

    adaptive_image = apply_adaptive_threshold(
        enhanced_image,
    )

    save_image(
        otsu_image,
        OTSU_OUTPUT_PATH,
    )

    save_image(
        adaptive_image,
        ADAPTIVE_OUTPUT_PATH,
    )

    print(f"Otsu shape: {otsu_image.shape}")
    print(f"Adaptive shape: {adaptive_image.shape}")
    print(f"Saved Otsu image to: {OTSU_OUTPUT_PATH}")
    print(
        "Saved adaptive image to: "
        f"{ADAPTIVE_OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()