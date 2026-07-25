"""Manual test script for the preprocessing pipeline."""

from pathlib import Path

from src.image_enhancement.preprocess import (
    preprocess_image_file,
)


INPUT_PATH = Path(
    "data/raw/ground_truth/sample_03.png"
)

OTSU_OUTPUT_PATH = Path(
    "data/processed/sample_03_preprocessed_otsu.png"
)

ADAPTIVE_OUTPUT_PATH = Path(
    "data/processed/sample_03_preprocessed_adaptive.png"
)


def main() -> None:
    """Run preprocessing pipelines on a sample document."""
    otsu_image = preprocess_image_file(
        input_path=INPUT_PATH,
        output_path=OTSU_OUTPUT_PATH,
        threshold_method="otsu",
    )

    adaptive_image = preprocess_image_file(
        input_path=INPUT_PATH,
        output_path=ADAPTIVE_OUTPUT_PATH,
        threshold_method="adaptive",
    )

    print(f"Otsu pipeline shape: {otsu_image.shape}")
    print(f"Adaptive pipeline shape: {adaptive_image.shape}")

    print(
        "Saved Otsu pipeline output to: "
        f"{OTSU_OUTPUT_PATH}"
    )

    print(
        "Saved adaptive pipeline output to: "
        f"{ADAPTIVE_OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()