"""Manual test script for skew-angle estimation."""

from pathlib import Path

import cv2

from src.image_enhancement.deskew import (
    deskew_image,
    estimate_skew_angle,
)
from src.image_enhancement.utils import read_image, save_image

DESKEWED_OUTPUT_PATH = Path(
    "data/processed/sample_01_deskewed_test.png"
)

INPUT_PATH = Path(
    "data/raw/ground_truth/sample_01.png"
)

ROTATED_OUTPUT_PATH = Path(
    "data/processed/sample_01_rotated_test.png"
)

TEST_ROTATION_ANGLE = 5.0


def rotate_for_test(
    image,
    angle: float,
):
    """Rotate an image by a known angle for deskew testing."""
    height, width = image.shape[:2]
    center = (width / 2.0, height / 2.0)

    rotation_matrix = cv2.getRotationMatrix2D(
        center,
        angle,
        1.0,
    )

    return cv2.warpAffine(
        image,
        rotation_matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REPLICATE,
    )


def main() -> None:
    """Estimate and correct the skew of a real document image."""
    image = read_image(INPUT_PATH)

    estimated_angle = estimate_skew_angle(image)

    deskewed_image = deskew_image(
        image,
        angle=estimated_angle,
    )

    deskewed_angle = estimate_skew_angle(
        deskewed_image
    )

    save_image(
        deskewed_image,
        DESKEWED_OUTPUT_PATH,
    )

    print(
        "Estimated original angle: "
        f"{estimated_angle:.2f} degrees"
    )

    print(
        "Estimated deskewed angle: "
        f"{deskewed_angle:.2f} degrees"
    )

    print(
        "Saved deskewed image to: "
        f"{DESKEWED_OUTPUT_PATH}"
    )

if __name__ == "__main__":
    main()