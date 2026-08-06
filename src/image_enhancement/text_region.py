"""Automatic text-region detection for document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_HORIZONTAL_KERNEL_WIDTH = 35
DEFAULT_VERTICAL_KERNEL_HEIGHT = 5
DEFAULT_MIN_REGION_AREA_RATIO = 0.05
DEFAULT_PADDING = 15


def detect_text_region(
    image: np.ndarray,
    horizontal_kernel_width: int = DEFAULT_HORIZONTAL_KERNEL_WIDTH,
    vertical_kernel_height: int = DEFAULT_VERTICAL_KERNEL_HEIGHT,
    min_region_area_ratio: float = DEFAULT_MIN_REGION_AREA_RATIO,
    padding: int = DEFAULT_PADDING,
) -> tuple[int, int, int, int]:
    """
    Detect the dominant text block in a document image.

    Text components are connected horizontally and vertically so that
    lines form larger regions. The largest suitable region is returned
    as a bounding box.

    Args:
        image: Grayscale or binary document image.
        horizontal_kernel_width: Width used to connect characters in lines.
        vertical_kernel_height: Height used to connect neighbouring lines.
        min_region_area_ratio: Minimum bounding-box area relative to the image.
        padding: Extra pixels added around the detected region.

    Returns:
        Bounding box as (x, y, width, height).

    Raises:
        TypeError: If parameters have invalid types.
        ValueError: If values are invalid or no text region is detected.
    """
    validate_image(image)

    if isinstance(horizontal_kernel_width, bool) or not isinstance(
        horizontal_kernel_width,
        int,
    ):
        raise TypeError(
            "horizontal_kernel_width must be an integer."
        )

    if isinstance(vertical_kernel_height, bool) or not isinstance(
        vertical_kernel_height,
        int,
    ):
        raise TypeError(
            "vertical_kernel_height must be an integer."
        )

    if isinstance(padding, bool) or not isinstance(
        padding,
        int,
    ):
        raise TypeError(
            "padding must be an integer."
        )

    if (
        horizontal_kernel_width <= 0
        or vertical_kernel_height <= 0
        or padding < 0
    ):
        raise ValueError(
            "Kernel sizes must be positive and padding cannot be negative."
        )

    if not isinstance(min_region_area_ratio, (int, float)):
        raise TypeError(
            "min_region_area_ratio must be numeric."
        )

    if not 0 < min_region_area_ratio <= 1:
        raise ValueError(
            "min_region_area_ratio must be between 0 and 1."
        )

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

    if len(np.unique(grayscale_image)) > 2:
        _, binary_image = cv2.threshold(
            grayscale_image,
            0,
            255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
        )
    else:
        binary_image = cv2.bitwise_not(
            grayscale_image
        )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (horizontal_kernel_width, 1),
    )

    connected_lines = cv2.morphologyEx(
        binary_image,
        cv2.MORPH_CLOSE,
        horizontal_kernel,
    )

    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (1, vertical_kernel_height),
    )

    connected_blocks = cv2.dilate(
        connected_lines,
        vertical_kernel,
        iterations=2,
    )

    contours, _ = cv2.findContours(
        connected_blocks,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    image_height, image_width = grayscale_image.shape[:2]
    image_area = image_height * image_width

    valid_regions: list[tuple[int, int, int, int]] = []

    for contour in contours:
        x, y, width, height = cv2.boundingRect(
            contour
        )

        region_area = width * height

        if (
            region_area
            >= image_area * min_region_area_ratio
        ):
            valid_regions.append(
                (x, y, width, height)
            )

    if not valid_regions:
        raise ValueError(
            "No suitable text region could be detected."
        )

    x, y, width, height = max(
        valid_regions,
        key=lambda region: region[2] * region[3],
    )

    x_start = max(0, x - padding)
    y_start = max(0, y - padding)
    x_end = min(
        image_width,
        x + width + padding,
    )
    y_end = min(
        image_height,
        y + height + padding,
    )

    return (
        x_start,
        y_start,
        x_end - x_start,
        y_end - y_start,
    )


def crop_to_text_region(
    image: np.ndarray,
    **detection_kwargs,
) -> np.ndarray:
    """
    Crop an image to its dominant text region.

    Args:
        image: Input document image.
        **detection_kwargs: Arguments forwarded to detect_text_region().

    Returns:
        Cropped document image.
    """
    x, y, width, height = detect_text_region(
        image,
        **detection_kwargs,
    )

    return image[
        y:y + height,
        x:x + width,
    ].copy()