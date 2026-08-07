from pathlib import Path

import cv2

from src.image_enhancement.text_region import (
    detect_text_regions,
)
from src.image_enhancement.utils import (
    read_image,
    save_image,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]

INPUT_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "ground_truth"
    / "sample_02.png"
)

OUTPUT_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "image_enhancement"
    / "text_regions_debug.png"
)


def main() -> None:
    image = read_image(
        INPUT_PATH
    )

    regions = detect_text_regions(
        image
    )

    debug_image = image.copy()

    for index, (
        x,
        y,
        width,
        height,
    ) in enumerate(
        regions,
        start=1,
    ):
        cv2.rectangle(
            debug_image,
            (x, y),
            (
                x + width,
                y + height,
            ),
            (0, 0, 255),
            2,
        )

        cv2.putText(
            debug_image,
            str(index),
            (
                x,
                max(15, y - 5),
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 0, 255),
            1,
        )

    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    save_image(
        debug_image,
        OUTPUT_PATH,
    )

    print(
        f"Detected {len(regions)} text regions."
    )

    print(
        f"Saved: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()