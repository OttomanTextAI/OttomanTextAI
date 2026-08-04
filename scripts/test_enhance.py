from pathlib import Path

from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
)
from src.image_enhancement.utils import (
    is_grayscale,
    read_image,
    save_image,
)


INPUT_PATH = Path(
    "data/raw/ground_truth/sample_01.png"
)

GRAYSCALE_OUTPUT_PATH = Path(
    "data/processed/sample_01_grayscale.png"
)

CLAHE_OUTPUT_PATH = Path(
    "data/processed/sample_01_clahe.png"
)


def main() -> None:
    image = read_image(INPUT_PATH)

    grayscale_image = convert_to_grayscale(image)
    clahe_image = apply_clahe(grayscale_image)

    save_image(
        grayscale_image,
        GRAYSCALE_OUTPUT_PATH,
    )

    save_image(
        clahe_image,
        CLAHE_OUTPUT_PATH,
    )

    print(f"Original shape: {image.shape}")
    print(f"Grayscale shape: {grayscale_image.shape}")
    print(f"CLAHE shape: {clahe_image.shape}")
    print(f"Grayscale check: {is_grayscale(grayscale_image)}")
    print(f"Saved grayscale image to: {GRAYSCALE_OUTPUT_PATH}")
    print(f"Saved CLAHE image to: {CLAHE_OUTPUT_PATH}")


if __name__ == "__main__":
    main()