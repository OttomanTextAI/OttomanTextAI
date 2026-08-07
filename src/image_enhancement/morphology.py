"""Morphological cleaning operations for binary document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import validate_image


DEFAULT_MORPH_KERNEL_SIZE = 2
DEFAULT_MORPH_ITERATIONS = 1


def clean_binary_noise(
    image: np.ndarray,
    kernel_size: int = DEFAULT_MORPH_KERNEL_SIZE,
    iterations: int = DEFAULT_MORPH_ITERATIONS,
) -> np.ndarray:
    """
    Remove isolated binary noise while preserving document text.

    The input is expected to contain dark text on a light background.
    It is inverted temporarily so morphological opening can remove
    small foreground speckles, then converted back.

    Args:
        image: Binary grayscale image.
        kernel_size: Width and height of the morphology kernel.
        iterations: Number of opening iterations.

    Returns:
        Cleaned binary image.

    Raises:
        ValueError: If the image is not two-dimensional or parameters
            are invalid.
        TypeError: If parameters are not integers.
    """
    validate_image(image)

    if image.ndim != 2:
        raise ValueError(
            "Morphological cleaning requires a 2D binary image."
        )

    if isinstance(kernel_size, bool) or not isinstance(
        kernel_size,
        int,
    ):
        raise TypeError(
            "kernel_size must be an integer."
        )

    if kernel_size <= 0:
        raise ValueError(
            "kernel_size must be greater than zero."
        )

    if isinstance(iterations, bool) or not isinstance(
        iterations,
        int,
    ):
        raise TypeError(
            "iterations must be an integer."
        )

    if iterations <= 0:
        raise ValueError(
            "iterations must be greater than zero."
        )

    _, binary_image = cv2.threshold(
        image,
        127,
        255,
        cv2.THRESH_BINARY,
    )

    inverted_image = cv2.bitwise_not(
        binary_image
    )

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size),
    )

    cleaned_inverted = cv2.morphologyEx(
        inverted_image,
        cv2.MORPH_OPEN,
        kernel,
        iterations=iterations,
    )

    return cv2.bitwise_not(
        cleaned_inverted
    )

def remove_isolated_speckles(
    image: np.ndarray,
    min_area: int = 12,
    anchor_area: int = 35,
    horizontal_distance: int = 18,
    vertical_distance: int = 8,
) -> np.ndarray:
    """
    Remove isolated black components while preserving text-related dots.

    Large connected components are treated as text anchors. Small components
    are preserved only when they are sufficiently close to an anchor region.
    This helps retain Ottoman character dots while removing isolated stains
    and scanning noise.

    Args:
        image: Binary image containing black text on a white background.
        min_area: Components with at least this area are always preserved.
        anchor_area: Minimum area required for a component to be treated
            as a text anchor.
        horizontal_distance: Horizontal distance used to connect small
            components with nearby text.
        vertical_distance: Vertical distance used to connect small
            components with nearby text.

    Returns:
        Cleaned binary image.

    Raises:
        TypeError: If parameters are not integers.
        ValueError: If the input or parameter values are invalid.
    """
    validate_image(image)

    if image.ndim != 2:
        raise ValueError(
            "Speckle removal requires a 2D binary image."
        )

    parameters = {
        "min_area": min_area,
        "anchor_area": anchor_area,
        "horizontal_distance": horizontal_distance,
        "vertical_distance": vertical_distance,
    }

    for parameter_name, parameter_value in parameters.items():
        if isinstance(parameter_value, bool) or not isinstance(
            parameter_value,
            int,
        ):
            raise TypeError(
                f"{parameter_name} must be an integer."
            )

        if parameter_value <= 0:
            raise ValueError(
                f"{parameter_name} must be greater than zero."
            )

    foreground = cv2.bitwise_not(image)

    component_count, labels, statistics, _ = (
        cv2.connectedComponentsWithStats(
            foreground,
            connectivity=8,
        )
    )

    anchor_mask = np.zeros_like(
        foreground
    )

    for label_index in range(1, component_count):
        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        if area >= anchor_area:
            anchor_mask[
                labels == label_index
            ] = 255

    proximity_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (
            (horizontal_distance * 2) + 1,
            (vertical_distance * 2) + 1,
        ),
    )

    anchor_neighbourhood = cv2.dilate(
        anchor_mask,
        proximity_kernel,
        iterations=1,
    )

    cleaned_foreground = np.zeros_like(
        foreground
    )

    for label_index in range(1, component_count):
        component_mask = (
            labels == label_index
        )

        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        near_text = np.any(
            anchor_neighbourhood[
                component_mask
            ] > 0
        )

        if area >= min_area or near_text:
            cleaned_foreground[
                component_mask
            ] = 255

    return cv2.bitwise_not(
        cleaned_foreground
    )

def remove_isolated_speckles_v2(
    image: np.ndarray,
    min_area: int = 10,
    text_anchor_area: int = 30,
    horizontal_distance: int = 20,
    vertical_distance: int = 10,
    max_isolated_distance: int = 25,
) -> np.ndarray:
    """
    Remove isolated black speckles while preserving text-related dots.

    Small connected components are preserved when they are close to
    larger text components. Components that are both small and isolated
    are removed.

    Args:
        image: Binary image with black text on a white background.
        min_area: Components at or above this area are preserved.
        text_anchor_area: Minimum area for a component to be considered
            a reliable text anchor.
        horizontal_distance: Horizontal dilation around text anchors.
        vertical_distance: Vertical dilation around text anchors.
        max_isolated_distance: Maximum distance used for an additional
            safety region around text.

    Returns:
        Binary image with isolated speckles removed.
    """
    validate_image(image)

    if image.ndim != 2:
        raise ValueError(
            "Speckle removal requires a 2D binary image."
        )

    foreground = cv2.bitwise_not(image)

    component_count, labels, statistics, _ = (
        cv2.connectedComponentsWithStats(
            foreground,
            connectivity=8,
        )
    )

    text_anchor_mask = np.zeros_like(
        foreground
    )

    for label_index in range(1, component_count):
        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        if area >= text_anchor_area:
            text_anchor_mask[
                labels == label_index
            ] = 255

    text_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (
            (horizontal_distance * 2) + 1,
            (vertical_distance * 2) + 1,
        ),
    )

    text_neighbourhood = cv2.dilate(
        text_anchor_mask,
        text_kernel,
        iterations=1,
    )

    safety_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (
            (max_isolated_distance * 2) + 1,
            (max_isolated_distance * 2) + 1,
        ),
    )

    safety_neighbourhood = cv2.dilate(
        text_anchor_mask,
        safety_kernel,
        iterations=1,
    )

    cleaned_foreground = np.zeros_like(
        foreground
    )

    for label_index in range(1, component_count):
        component_mask = (
            labels == label_index
        )

        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        near_text = np.any(
            text_neighbourhood[
                component_mask
            ] > 0
        )

        inside_safety_region = np.any(
            safety_neighbourhood[
                component_mask
            ] > 0
        )

        if (
            area >= min_area
            or near_text
            or inside_safety_region
        ):
            cleaned_foreground[
                component_mask
            ] = 255

    return cv2.bitwise_not(
        cleaned_foreground
    )

def remove_isolated_speckles_v3(
    image: np.ndarray,
    min_area: int = 14,
    line_kernel_width: int = 35,
    line_kernel_height: int = 3,
    line_dilation_iterations: int = 1,
    safe_vertical_margin: int = 8,
) -> np.ndarray:
    """
    Remove isolated speckles while preserving dots near detected text lines.

    Text lines are estimated by horizontally connecting foreground
    components. Small components close to these text-line regions are
    preserved, while isolated components outside the text regions are removed.

    Args:
        image: Binary image with black text on white background.
        min_area: Components at or above this area are always preserved.
        line_kernel_width: Horizontal kernel width used to connect
            characters into approximate text lines.
        line_kernel_height: Kernel height used during line detection.
        line_dilation_iterations: Number of dilation iterations used
            to form text-line regions.
        safe_vertical_margin: Extra vertical margin around text lines
            to preserve Ottoman/Arabic dots and diacritics.

    Returns:
        Cleaned binary image.
    """
    validate_image(image)

    if image.ndim != 2:
        raise ValueError(
            "Speckle removal requires a 2D binary image."
        )

    foreground = cv2.bitwise_not(image)

    line_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (
            line_kernel_width,
            line_kernel_height,
        ),
    )

    text_line_mask = cv2.dilate(
        foreground,
        line_kernel,
        iterations=line_dilation_iterations,
    )

    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (
            1,
            (safe_vertical_margin * 2) + 1,
        ),
    )

    protected_text_region = cv2.dilate(
        text_line_mask,
        vertical_kernel,
        iterations=1,
    )

    component_count, labels, statistics, _ = (
        cv2.connectedComponentsWithStats(
            foreground,
            connectivity=8,
        )
    )

    cleaned_foreground = np.zeros_like(
        foreground
    )

    for label_index in range(
        1,
        component_count,
    ):
        component_mask = (
            labels == label_index
        )

        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        near_text_line = np.any(
            protected_text_region[
                component_mask
            ] > 0
        )

        if area >= min_area or near_text_line:
            cleaned_foreground[
                component_mask
            ] = 255

    return cv2.bitwise_not(
        cleaned_foreground
    )