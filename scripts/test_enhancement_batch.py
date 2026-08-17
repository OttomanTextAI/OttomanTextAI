from pathlib import Path

import cv2
import numpy as np

from src.image_enhancement.preprocess import (
    preprocess_image,
)


INPUT_DIR = Path(
    "data/test_images"
)

OUTPUT_DIR = Path(
    "data/processed/batch_tests"
)

PROFILE = "printed-degraded"

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}


def imread_unicode(
    path: Path,
    flags: int = cv2.IMREAD_COLOR,
):
    data = np.fromfile(
        str(path),
        dtype=np.uint8,
    )

    return cv2.imdecode(
        data,
        flags,
    )


def imwrite_unicode(
    path: Path,
    image: np.ndarray,
) -> bool:

    extension = path.suffix

    success, encoded = cv2.imencode(
        extension,
        image,
    )

    if not success:
        return False

    encoded.tofile(
        str(path)
    )

    return True


def main():
    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    image_paths = [
        path
        for path in INPUT_DIR.iterdir()
        if (
            path.is_file()
            and path.suffix.lower()
            in SUPPORTED_EXTENSIONS
        )
    ]

    image_paths.sort(
        key=lambda path: path.name.lower()
    )

    print(
        f"Found {len(image_paths)} images."
    )

    for index, image_path in enumerate(
        image_paths,
        start=1,
    ):
        print()
        print(
            "=" * 60
        )

        print(
            f"[{index}/{len(image_paths)}] "
            f"{image_path.name}"
        )

        image = imread_unicode(
            image_path
        )

        if image is None:
            print(
                "SKIPPED: image could not be read."
            )
            continue

        try:
            processed = preprocess_image(
                image,
                profile=PROFILE,
            )

            output_path = (
                OUTPUT_DIR
                / (
                    image_path.stem
                    + "_processed.png"
                )
            )

            success = imwrite_unicode(
                output_path,
                processed,
            )

            if success:
                print(
                    f"SAVED: {output_path}"
                )
            else:
                print(
                    "ERROR: output could not be saved."
                )

        except Exception as error:
            print(
                f"ERROR: {error}"
            )

    print()
    print(
        "=" * 60
    )

    print(
        "Batch test finished."
    )

    print(
        f"Results: {OUTPUT_DIR}"
    )


if __name__ == "__main__":
    main()