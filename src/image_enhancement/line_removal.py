"""Removal of long non-text lines from document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_MIN_LINE_LENGTH_RATIO = 0.35
DEFAULT_MAX_LINE_GAP = 20
DEFAULT_HOUGH_THRESHOLD = 80
DEFAULT_LINE_THICKNESS = 5


def remove_long_lines(
    image: np.ndarray,
    min_line_length_ratio: float = DEFAULT_MIN_LINE_LENGTH_RATIO,
    max_line_gap: int = DEFAULT_MAX_LINE_GAP,
    hough_threshold: int = DEFAULT_HOUGH_THRESHOLD,
    line_thickness: int = DEFAULT_LINE_THICKNESS,
) -> np.ndarray:
    """
    Detect and remove long straight lines while preserving text strokes.

    Args:
        image: Grayscale or binary document image.
        min_line_length_ratio: Minimum detected line length relative
            to the image width.
        max_line_gap: Maximum gap allowed between line segments.
        hough_threshold: Minimum Hough accumulator threshold.
        line_thickness: Thickness of the removal mask.

    Returns:
        Image with long detected lines replaced by white pixels.
    """
    validate_image(image)

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3 and is_grayscale(image)
        else image
    )

    if grayscale_image.ndim == 3:
        grayscale_image = cv2.cvtColor(
            grayscale_image,
            cv2.COLOR_BGR2GRAY,
        )

    height, width = grayscale_image.shape[:2]

    edges = cv2.Canny(
        grayscale_image,
        50,
        150,
        apertureSize=3,
    )

    min_line_length = int(
        width * min_line_length_ratio
    )

    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=hough_threshold,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        return grayscale_image.copy()

    result = grayscale_image.copy()

    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        delta_x = x2 - x1
        delta_y = y2 - y1

        line_length = np.hypot(
            delta_x,
            delta_y,
        )

        if line_length < min_line_length:
            continue

        angle = abs(
            np.degrees(
                np.arctan2(
                    delta_y,
                    delta_x,
                )
            )
        )

        # 0–180 derece aralığına normalize et
        if angle > 180:
            angle %= 180

        if angle > 90:
            angle = 180 - angle

        # Yatay veya yataya yakın çizgileri koru.
        # Bunlar Osmanlıca metin satırlarının parçası olabilir.
        if angle < 15:
            continue

        # Dikey çizgileri de şimdilik koru.
        # Çerçeve ve sayfa sınırları için ayrı işlem yapacağız.
        if angle > 75:
            continue

        cv2.line(
            result,
            (int(x1), int(y1)),
            (int(x2), int(y2)),
            255,
            thickness=line_thickness,
        )
    return result