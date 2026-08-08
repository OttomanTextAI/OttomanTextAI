"""Utilities for building and using text-protection masks."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    validate_image,
)


def create_text_mask_from_regions(
    image: np.ndarray,
    regions: list[tuple[int, int, int, int]],
    padding: int = 6,
) -> np.ndarray:
    """
    Create a binary mask that protects detected text regions.

    Args:
        image: Source document image.
        regions: Text regions as (x, y, width, height).
        padding: Extra margin around each region.

    Returns:
        Binary mask where protected text regions are white (255)
        and non-text areas are black (0).
    """
    validate_image(image)

    height, width = image.shape[:2]

    mask = np.zeros(
        (height, width),
        dtype=np.uint8,
    )

    for x, y, region_width, region_height in regions:
        x_start = max(
            0,
            x - padding,
        )

        y_start = max(
            0,
            y - padding,
        )

        x_end = min(
            width,
            x + region_width + padding,
        )

        y_end = min(
            height,
            y + region_height + padding,
        )

        cv2.rectangle(
            mask,
            (x_start, y_start),
            (x_end, y_end),
            255,
            thickness=-1,
        )

    return mask
def protect_text_regions(
    original_image: np.ndarray,
    cleaned_image: np.ndarray,
    text_mask: np.ndarray,
) -> np.ndarray:
    """
    Restore original pixels inside protected text regions.

    Args:
        original_image: Image before aggressive cleaning.
        cleaned_image: Image after artifact cleaning.
        text_mask: Binary protection mask.

    Returns:
        Image where text regions come from the original image and
        non-text regions come from the cleaned image.
    """
    validate_image(original_image)
    validate_image(cleaned_image)

    if original_image.shape != cleaned_image.shape:
        raise ValueError(
            "original_image and cleaned_image must have the same shape."
        )

    if text_mask.shape[:2] != original_image.shape[:2]:
        raise ValueError(
            "text_mask size must match the image size."
        )

    result = cleaned_image.copy()

    protected_pixels = (
        text_mask > 0
    )

    result[
        protected_pixels
    ] = original_image[
        protected_pixels
    ]

    return result
def overlay_text_mask(
    image: np.ndarray,
    text_mask: np.ndarray,
) -> np.ndarray:
    """
    Create a debug visualization of protected text regions.
    """
    validate_image(image)

    if image.ndim == 2:
        debug_image = cv2.cvtColor(
            image,
            cv2.COLOR_GRAY2BGR,
        )
    else:
        debug_image = image.copy()

    overlay = debug_image.copy()

    overlay[
        text_mask > 0
    ] = (
        0,
        255,
        0,
    )

    return cv2.addWeighted(
        debug_image,
        0.65,
        overlay,
        0.35,
        0,
    )

def create_pixel_text_mask(
    image: np.ndarray,
    regions: list[tuple[int, int, int, int]],
    padding: int = 1,
) -> np.ndarray:
    """
    Create a pixel-level text mask inside detected text regions.

    Unlike rectangular region masks, only dark foreground pixels
    inside candidate text regions are protected.
    """
    validate_image(image)

    if image.ndim == 3:
        grayscale = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = image.copy()

    height, width = grayscale.shape

    final_mask = np.zeros(
        (height, width),
        dtype=np.uint8,
    )

    for x, y, region_width, region_height in regions:

        x1 = max(0, x)
        y1 = max(0, y)

        x2 = min(
            width,
            x + region_width,
        )

        y2 = min(
            height,
            y + region_height,
        )

        roi = grayscale[
            y1:y2,
            x1:x2
        ]

        if roi.size == 0:
            continue

        # Local Otsu: threshold is calculated separately
        # for each candidate text region.
        _, local_mask = cv2.threshold(
            roi,
            0,
            255,
            cv2.THRESH_BINARY_INV
            + cv2.THRESH_OTSU,
        )

        if padding > 0:
            kernel = cv2.getStructuringElement(
                cv2.MORPH_ELLIPSE,
                (
                    2 * padding + 1,
                    2 * padding + 1,
                ),
            )

            local_mask = cv2.dilate(
                local_mask,
                kernel,
                iterations=1,
            )

        final_mask[
            y1:y2,
            x1:x2
        ] = cv2.bitwise_or(
            final_mask[
                y1:y2,
                x1:x2
            ],
            local_mask,
        )

    return final_mask

def remove_long_artifacts_from_text_mask(
    text_mask: np.ndarray,
    horizontal_ratio: float = 0.18,
    vertical_ratio: float = 0.12,
) -> np.ndarray:
    """
    Remove very long horizontal and vertical structures from a
    text-protection mask.

    This only modifies the protection mask; it does not erase
    anything from the document image.
    """

    if text_mask.ndim != 2:
        raise ValueError(
            "text_mask must be a 2D binary image."
        )

    height, width = text_mask.shape

    horizontal_length = max(
        25,
        int(width * horizontal_ratio),
    )

    vertical_length = max(
        25,
        int(height * vertical_ratio),
    )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (horizontal_length, 1),
    )

    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (1, vertical_length),
    )

    horizontal_lines = cv2.morphologyEx(
        text_mask,
        cv2.MORPH_OPEN,
        horizontal_kernel,
    )

    vertical_lines = cv2.morphologyEx(
        text_mask,
        cv2.MORPH_OPEN,
        vertical_kernel,
    )

    line_mask = cv2.bitwise_or(
        horizontal_lines,
        vertical_lines,
    )

    cleaned_mask = cv2.bitwise_and(
        text_mask,
        cv2.bitwise_not(line_mask),
    )

    return cleaned_mask

def restore_text_pixels_to_binary(
    source_image: np.ndarray,
    binary_image: np.ndarray,
    text_mask: np.ndarray,
    darkness_percentile: float = 35.0,
) -> np.ndarray:
    """
    Restore only sufficiently dark protected text pixels.

    The text mask determines where restoration is allowed.
    A percentile threshold determines which protected pixels
    are dark enough to be restored as foreground.
    """

    validate_image(source_image)
    validate_image(binary_image)

    if source_image.ndim == 3:
        grayscale = cv2.cvtColor(
            source_image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = source_image.copy()

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D image."
        )

    if text_mask.shape != binary_image.shape:
        raise ValueError(
            "text_mask and binary_image must have the same shape."
        )

    protected = text_mask > 0

    if not np.any(protected):
        return binary_image.copy()

    protected_values = grayscale[protected]

    darkness_threshold = np.percentile(
        protected_values,
        darkness_percentile,
    )

    result = binary_image.copy()

    restore_pixels = (
        protected
        & (grayscale <= darkness_threshold)
    )

    result[restore_pixels] = 0

    return result

def restore_text_pixels_by_regions(
    source_image: np.ndarray,
    binary_image: np.ndarray,
    text_mask: np.ndarray,
    regions: list[tuple[int, int, int, int]],
    darkness_percentile: float = 40.0,
) -> np.ndarray:
    """
    Restore protected text pixels using a separate darkness
    threshold for each detected text region.
    """

    validate_image(source_image)
    validate_image(binary_image)

    if source_image.ndim == 3:
        grayscale = cv2.cvtColor(
            source_image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = source_image.copy()

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D image."
        )

    if text_mask.shape != binary_image.shape:
        raise ValueError(
            "text_mask and binary_image must have the same shape."
        )

    height, width = binary_image.shape

    result = binary_image.copy()

    for x, y, region_width, region_height in regions:

        x1 = max(0, x)
        y1 = max(0, y)

        x2 = min(
            width,
            x + region_width,
        )

        y2 = min(
            height,
            y + region_height,
        )

        region_mask = (
            text_mask[
                y1:y2,
                x1:x2
            ] > 0
        )

        if not np.any(region_mask):
            continue

        region_gray = grayscale[
            y1:y2,
            x1:x2
        ]

        protected_values = (
            region_gray[
                region_mask
            ]
        )

        if protected_values.size == 0:
            continue

        darkness_threshold = np.percentile(
            protected_values,
            darkness_percentile,
        )

        restore_pixels = (
            region_mask
            & (
                region_gray
                <= darkness_threshold
            )
        )

        region_result = result[
            y1:y2,
            x1:x2
        ]

        region_result[
            restore_pixels
        ] = 0

        result[
            y1:y2,
            x1:x2
        ] = region_result

    return result

def remove_extreme_line_components(
    text_mask: np.ndarray,
    horizontal_width_ratio: float = 0.18,
    horizontal_max_height: int = 6,
    vertical_height_ratio: float = 0.12,
    vertical_max_width: int = 6,
) -> np.ndarray:
    """
    Remove extremely long and thin connected components from
    a text-protection mask.

    Intended for fold lines, borders and scanning artifacts.
    """

    if text_mask.ndim != 2:
        raise ValueError(
            "text_mask must be a 2D binary image."
        )

    height, width = text_mask.shape

    binary_mask = (
        text_mask > 0
    ).astype(np.uint8)

    number_of_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            binary_mask,
            connectivity=8,
        )
    )

    cleaned = text_mask.copy()

    for label in range(
        1,
        number_of_labels,
    ):
        component_width = stats[
            label,
            cv2.CC_STAT_WIDTH,
        ]

        component_height = stats[
            label,
            cv2.CC_STAT_HEIGHT,
        ]

        is_long_horizontal = (
            component_width
            >= width * horizontal_width_ratio
            and component_height
            <= horizontal_max_height
        )

        is_long_vertical = (
            component_height
            >= height * vertical_height_ratio
            and component_width
            <= vertical_max_width
        )

        if (
            is_long_horizontal
            or is_long_vertical
        ):
            cleaned[
                labels == label
            ] = 0

    return cleaned