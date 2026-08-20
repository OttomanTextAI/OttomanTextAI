from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

import cv2
import numpy as np

from src.image_enhancement.orientation import (
    _rotate_image,
    correct_document_orientation,
)


INPUT_DIR = Path(
    "data/test_images"
)

OUTPUT_DIR = Path(
    "data/processed/orientation_tests"
)

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}

TEST_ANGLES = (
    0,
    90,
    180,
    270,
)

EXPECTED_CORRECTIONS = {
    0: 0,
    90: 270,
    180: 180,
    270: 90,
}


def imread_unicode(
    path: Path,
):
    data = np.fromfile(
        str(path),
        dtype=np.uint8,
    )

    return cv2.imdecode(
        data,
        cv2.IMREAD_COLOR,
    )


def imwrite_unicode(
    path: Path,
    image: np.ndarray,
) -> bool:
    success, encoded = cv2.imencode(
        path.suffix,
        image,
    )

    if not success:
        return False

    encoded.tofile(
        str(path)
    )

    return True


def main() -> None:
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

    total_tests = 0
    passed_tests = 0

    axis_errors = 0
    direction_errors = 0

    axis_failure_files = set()
    direction_failure_files = set()

    print(
        f"Found {len(image_paths)} images."
    )

    for image_path in image_paths:
        image = imread_unicode(
            image_path
        )

        if image is None:
            print(
                f"SKIPPED: {image_path.name}"
            )
            continue

        print()
        print(
            f"ORIENTATION TEST - {image_path.name}"
        )
        print("=" * 72)

        for input_rotation in TEST_ANGLES:
            total_tests += 1

            rotated_input = _rotate_image(
                image,
                input_rotation,
            )

            with redirect_stdout(
                StringIO()
            ):
                (
                    corrected_image,
                    selected_angle,
                    confidence,
                ) = correct_document_orientation(
                    rotated_input
                )

            expected_angle = (
                EXPECTED_CORRECTIONS[
                    input_rotation
                ]
            )

            passed = (
                selected_angle
                == expected_angle
            )

            if passed:
                passed_tests += 1

            else:
                difference = (
                    selected_angle
                    - expected_angle
                ) % 360

                if difference == 180:
                    direction_errors += 1
                    direction_failure_files.add(
                        image_path.name
                    )

                elif difference in (90, 270):
                    axis_errors += 1
                    axis_failure_files.add(
                        image_path.name
                    )

            result = (
                "PASS"
                if passed
                else "FAIL"
            )

            print(
                f"Input: {input_rotation:>3}° | "
                f"Selected: {selected_angle:>3}° | "
                f"Expected: {expected_angle:>3}° | "
                f"Confidence: {confidence:.3f} | "
                f"{result}"
            )

            output_path = (
                OUTPUT_DIR
                / (
                    f"{image_path.stem}"
                    f"_rotation_{input_rotation}.png"
                )
            )

            imwrite_unicode(
                output_path,
                corrected_image,
            )

        print("=" * 72)

    print()
    print(
        f"FINAL RESULT: "
        f"{passed_tests}/{total_tests} passed"
    )

    print(
        f"Axis errors (90/270): "
        f"{axis_errors}"
    )

    print(
        f"Direction errors (180): "
        f"{direction_errors}"
    )

    print()
    print("AXIS FAILURE FILES:")
    for filename in sorted(
        axis_failure_files
    ):
        print(
            f"- {filename}"
        )

    print()
    print("DIRECTION FAILURE FILES:")
    for filename in sorted(
        direction_failure_files
    ):
        print(
            f"- {filename}"
        )


if __name__ == "__main__":
    main()