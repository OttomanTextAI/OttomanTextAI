from pathlib import Path

import cv2
import numpy as np

from src.image_enhancement.preprocess import (
    preprocess_image,
)


INPUT_DIR = Path("data/test_images")
OUTPUT_DIR = Path("data/processed/auto_batch")

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".tif",
    ".tiff",
}


def read_image_unicode(path: Path):
    data = np.fromfile(
        str(path),
        dtype=np.uint8,
    )

    return cv2.imdecode(
        data,
        cv2.IMREAD_COLOR,
    )


def main():
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    image_paths = [
        path
        for path in INPUT_DIR.iterdir()
        if path.suffix.lower()
        in SUPPORTED_EXTENSIONS
    ]

    print(
        f"Found {len(image_paths)} images.\n"
    )

    for index, image_path in enumerate(
        image_paths,
        start=1,
    ):
        print(
            "\n"
            + "=" * 70
        )

        print(
            f"[{index}/{len(image_paths)}] "
            f"{image_path.name}"
        )

        image = read_image_unicode(
            image_path
        )

        if image is None:
            print(
                "[ERROR] Image could not be read."
            )
            continue

        try:
            output = preprocess_image(
                image,
                profile="auto",
            )

            output_path = (
                OUTPUT_DIR
                / f"{image_path.stem}_auto.png"
            )

            success, encoded = cv2.imencode(
                ".png",
                output,
            )

            if not success:
                print(
                    "[ERROR] Output encoding failed."
                )
                continue

            encoded.tofile(
                str(output_path)
            )

            print(
                "[OUTPUT]",
                output_path,
            )

        except Exception as exc:
            print(
                "[ERROR]",
                type(exc).__name__,
                str(exc),
            )

    print(
        "\nBatch test completed."
    )


if __name__ == "__main__":
    main()