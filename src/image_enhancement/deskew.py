"""Deskewing operations for document images."""

import cv2
import numpy as np

from src.image_enhancement.enhance import convert_to_grayscale
from src.image_enhancement.utils import validate_image

_MINIMUM_TEXT_LINE_COUNT = 2
_MINIMUM_ASPECT_RATIO = 1.5
_MAXIMUM_ACCEPTED_ANGLE = 25.0


def estimate_skew_angle(image: np.ndarray) -> float:
    """
    Estimate the skew angle of a document image.

    Args:
        image: Input document image.

    Returns:
        Estimated skew angle in degrees.

    Raises:
        ValueError: If enough reliable text lines cannot be detected.
    """
    validate_image(image)

    binary_foreground = _create_binary_foreground(
        image
    )

    connected_text = _connect_text_characters(
        binary_foreground
    )

    contours = _find_text_line_contours(
        connected_text
    )

    line_measurements = _collect_text_line_measurements(
        contours,
        binary_foreground.shape,
    )

    if len(line_measurements) < _MINIMUM_TEXT_LINE_COUNT:
        raise ValueError(
            "Skew angle cannot be estimated because fewer than "
            f"{_MINIMUM_TEXT_LINE_COUNT} reliable text lines "
            "were detected."
        )

    filtered_measurements = _remove_measurement_outliers(
        line_measurements
    )

    return _calculate_weighted_median(
        filtered_measurements
    )


def deskew_image(
    image: np.ndarray,
    angle: float | None = None,
) -> np.ndarray:
    """
    Correct the skew of a document image.

    If an angle is not provided, the skew angle is estimated automatically
    from detected text-line regions.

    Args:
        image: Input document image.
        angle: Optional deskew rotation angle in degrees.

    Returns:
        Deskewed document image.
    """
    validate_image(image)

    rotation_angle = (
        estimate_skew_angle(image)
        if angle is None
        else angle
    )

    rotation_matrix = _compute_rotation_matrix(
        image_shape=image.shape,
        angle=rotation_angle,
    )

    height, width = image.shape[:2]

    return cv2.warpAffine(
        image,
        rotation_matrix,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )

def _compute_rotation_matrix(
    image_shape: tuple[int, ...],
    angle: float,
) -> np.ndarray:
    """
    Create a rotation matrix around the image center.

    Args:
        image_shape: Shape of the input image.
        angle: Rotation angle in degrees.

    Returns:
        Two-dimensional affine rotation matrix.
    """
    height, width = image_shape[:2]
    center = (
        width / 2.0,
        height / 2.0,
    )

    return cv2.getRotationMatrix2D(
        center,
        angle,
        1.0,
    )
def _create_binary_foreground(
    image: np.ndarray,
) -> np.ndarray:
    """
    Create a binary image in which foreground text is white.

    Args:
        image: Input document image.

    Returns:
        Binary image with white foreground text.
    """
    validate_image(image)

    grayscale_image = convert_to_grayscale(image)

    _, binary_image = cv2.threshold(
        grayscale_image,
        0,
        255,
        cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU,
    )

    return binary_image

def _collect_text_line_measurements(
    contours: list[np.ndarray],
    image_shape: tuple[int, ...],
) -> list[tuple[float, int]]:
    """
    Collect angle and width measurements from reliable text lines.

    Args:
        contours: Contours detected from the text-line mask.
        image_shape: Shape of the grayscale document image.

    Returns:
        Angle and width pairs for reliable text-line candidates.
    """
    image_height, image_width = image_shape[:2]

    minimum_width = max(
        30,
        int(image_width * 0.08),
    )
    maximum_width = int(
        image_width * 0.98
    )

    minimum_height = max(
        5,
        int(image_height * 0.005),
    )
    maximum_height = int(
        image_height * 0.15
    )

    measurements: list[tuple[float, int]] = []

    for contour in contours:
        x, y, width, height = cv2.boundingRect(
            contour
        )

        if _touches_image_border(
            x,
            y,
            width,
            height,
            image_width,
            image_height,
        ):
            continue

        if not minimum_width <= width <= maximum_width:
            continue

        if not minimum_height <= height <= maximum_height:
            continue

        aspect_ratio = width / float(height)

        if aspect_ratio < _MINIMUM_ASPECT_RATIO:
            continue

        rectangle = cv2.minAreaRect(
            contour
        )

        raw_angle = rectangle[-1]

        normalized_angle = _normalize_angle(
            raw_angle
        )

        if (
            abs(normalized_angle)
            > _MAXIMUM_ACCEPTED_ANGLE
        ):
            continue

        measurements.append(
            (
                normalized_angle,
                width,
            )
        )

    return measurements


def _connect_text_characters(
    binary_image: np.ndarray,
) -> np.ndarray:
    """
    Connect nearby text characters into horizontal line candidates.

    The image borders are cleared before morphology to prevent page frames
    and scanning artifacts from merging with the text regions.

    Args:
        binary_image: Binary image with white foreground text.

    Returns:
        Binary image containing horizontally connected text regions.
    """
    image_height, image_width = binary_image.shape[:2]

    cleaned_image = binary_image.copy()

    border_size = max(
        5,
        int(min(image_height, image_width) * 0.02),
    )

    cleaned_image[:border_size, :] = 0
    cleaned_image[-border_size:, :] = 0
    cleaned_image[:, :border_size] = 0
    cleaned_image[:, -border_size:] = 0

    kernel_width = max(
        9,
        int(image_width * 0.025),
    )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (kernel_width, 1),
    )

    return cv2.morphologyEx(
        cleaned_image,
        cv2.MORPH_CLOSE,
        horizontal_kernel,
        iterations=1,
    )


def _calculate_weighted_median(
    measurements: list[tuple[float, int]],
) -> float:
    """
    Calculate the weighted median angle.

    Args:
        measurements: Angle and weight pairs.

    Returns:
        Weighted median angle.

    Raises:
        ValueError: If the measurement list is empty.
    """
    if not measurements:
        raise ValueError(
            "Weighted median cannot be calculated from "
            "an empty measurement list."
        )

    sorted_measurements = sorted(
        measurements,
        key=lambda measurement: measurement[0],
    )

    total_weight = sum(
        weight
        for _, weight in sorted_measurements
    )

    half_weight = total_weight / 2.0
    cumulative_weight = 0

    for angle, weight in sorted_measurements:
        cumulative_weight += weight

        if cumulative_weight >= half_weight:
            return float(angle)

    return float(
        sorted_measurements[-1][0]
    )

def _find_text_line_contours(
    text_line_mask: np.ndarray,
) -> list[np.ndarray]:
    """
    Find external contours from the connected text-line mask.

    Args:
        text_line_mask: Binary mask containing connected regions.

    Returns:
        Detected external contours.
    """
    contours, _ = cv2.findContours(
        text_line_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    return list(contours)




def _touches_image_border(
    x: int,
    y: int,
    width: int,
    height: int,
    image_width: int,
    image_height: int,
) -> bool:
    """
    Check whether a contour touches an image border.

    Border-touching contours frequently belong to page frames or scanning
    artifacts instead of text lines.

    Args:
        x: Left coordinate of the contour bounding box.
        y: Top coordinate of the contour bounding box.
        width: Bounding-box width.
        height: Bounding-box height.
        image_width: Full image width.
        image_height: Full image height.

    Returns:
        True if the bounding box touches an image border.
    """
    border_margin = 2

    return (
        x <= border_margin
        or y <= border_margin
        or x + width >= image_width - border_margin
        or y + height >= image_height - border_margin
    )


def _remove_measurement_outliers(
    measurements: list[tuple[float, int]],
) -> list[tuple[float, int]]:
    """
    Remove measurements that differ from the dominant text orientation.

    Median absolute deviation is used because it is robust against
    decorative elements, page frames, seals, and scanning artifacts.

    Args:
        measurements: Angle and width pairs.

    Returns:
        Measurements belonging to the dominant text orientation.

    Raises:
        ValueError: If the measurement list is empty.
    """
    if not measurements:
        raise ValueError(
            "Outlier removal cannot be performed on "
            "an empty measurement list."
        )

    angles = np.asarray(
        [
            angle
            for angle, _ in measurements
        ],
        dtype=np.float32,
    )

    median_angle = float(
        np.median(angles)
    )

    absolute_deviations = np.abs(
        angles - median_angle
    )

    median_absolute_deviation = float(
        np.median(absolute_deviations)
    )

    allowed_deviation = max(
        1.0,
        3.0 * median_absolute_deviation,
    )

    return [
        (angle, width)
        for angle, width in measurements
        if abs(angle - median_angle)
        <= allowed_deviation
    ]

def _normalize_angle(raw_angle: float) -> float:
    """
    Convert an OpenCV rectangle angle into a deskew rotation angle.

    Args:
        raw_angle: Angle returned by cv2.minAreaRect.

    Returns:
        Normalized angle between -45 and 45 degrees.
    """
    if raw_angle < -45.0:
        return raw_angle + 90.0

    if raw_angle > 45.0:
        return raw_angle - 90.0

    return raw_angle