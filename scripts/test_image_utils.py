from pathlib import Path

from src.image_enhancement.utils import (
    is_grayscale,
    read_image,
    save_image,
)


INPUT_PATH = Path(
    "data/raw/ground_truth/sample_01.png"
)

OUTPUT_PATH = Path(
    "data/processed/sample_01_copy.png"
)


def main() -> None:
    image = read_image(INPUT_PATH)

    print(f"Image shape: {image.shape}")
    print(f"Image dtype: {image.dtype}")
    print(f"Is grayscale: {is_grayscale(image)}")

    saved_path = save_image(image, OUTPUT_PATH)

    print(f"Image saved to: {saved_path}")


if __name__ == "__main__":
    main()