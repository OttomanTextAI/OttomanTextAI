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