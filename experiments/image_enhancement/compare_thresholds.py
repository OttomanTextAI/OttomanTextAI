"""Compare different image enhancement stages on a single image."""

from pathlib import Path

import cv2
import numpy as np

from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
)
from src.image_enhancement.threshold import (
    apply_adaptive_threshold,
    apply_otsu_threshold,
)

INPUT_IMAGE = Path("data/raw/ground_truth/sample_01.png")
OUTPUT_DIRECTORY = Path("data/processed/comparisons")


def save_image(name: str, image) -> None:
    """Save an image to the comparison output directory."""
    OUTPUT_DIRECTORY.mkdir(parents=True, exist_ok=True)

    output_path = OUTPUT_DIRECTORY / name

    cv2.imwrite(str(output_path), image)


def main() -> None:
    """Generate comparison images for enhancement stages."""
    image = cv2.imread(str(INPUT_IMAGE))

    if image is None:
        raise FileNotFoundError(
            f"Unable to read image: {INPUT_IMAGE}"
        )

    grayscale = convert_to_grayscale(image)
    clahe = apply_clahe(grayscale)
    otsu = apply_otsu_threshold(clahe)
    adaptive = apply_adaptive_threshold(clahe)

    save_image("01_original.png", image)
    save_image("02_grayscale.png", grayscale)
    save_image("03_clahe.png", clahe)
    save_image("04_otsu.png", otsu)
    save_image("05_adaptive.png", adaptive)

    print("Comparison images saved successfully.")

    comparison = create_comparison_image(
        [
            image,
            grayscale,
            clahe,
            otsu,
            adaptive,
        ],
        [
            "Original",
            "Grayscale",
            "CLAHE",
            "Otsu",
            "Adaptive",
        ],
    )

    save_image("comparison.png", comparison)

def create_comparison_image(images: list, labels: list[str]):
    """Create a side-by-side comparison image."""

    annotated = []

    for image, label in zip(images, labels):
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

        image = cv2.resize(image, (300, 300))

        cv2.putText(
            image,
            label,
            (10, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.0,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )

        cv2.rectangle(
            image,
            (0, 0),
            (170, 45),
            (0, 0, 0),
            -1,
        )

        cv2.putText(
            image,
            label,
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        
        annotated.append(image)

    return np.hstack(annotated)


if __name__ == "__main__":
    main()
    