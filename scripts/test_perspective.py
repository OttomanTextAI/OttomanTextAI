"""Manual test script for perspective correction."""

from pathlib import Path

from src.image_enhancement.deskew import (
    deskew_image,
    estimate_skew_angle,
)
from src.image_enhancement.perspective import (
    correct_perspective,
)
from src.image_enhancement.utils import (
    read_image,
    save_image,
)

INPUT_PATH = Path(
    "data/raw/ground_truth/sample_03.png"
)

PERSPECTIVE_OUTPUT_PATH = Path(
    "data/processed/sample_03_perspective_test.png"
)

FINAL_OUTPUT_PATH = Path(
    "data/processed/sample_03_perspective_deskew_test.png"
)


def main() -> None:
    """Run perspective correction followed by deskewing."""
    image = read_image(
        INPUT_PATH
    )

    perspective_corrected_image = correct_perspective(
        image
    )

    perspective_angle = estimate_skew_angle(
        perspective_corrected_image
    )

    final_image = deskew_image(
        perspective_corrected_image,
        angle=perspective_angle,
    )

    final_angle = estimate_skew_angle(
        final_image
    )

    save_image(
        perspective_corrected_image,
        PERSPECTIVE_OUTPUT_PATH,
    )

    save_image(
        final_image,
        FINAL_OUTPUT_PATH,
    )

    print(
        "Estimated angle after perspective correction: "
        f"{perspective_angle:.2f} degrees"
    )

    print(
        "Estimated final angle after deskew: "
        f"{final_angle:.2f} degrees"
    )

    print(
        "Saved final image to: "
        f"{FINAL_OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()