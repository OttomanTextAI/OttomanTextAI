"""Bleed-through suppression for degraded document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_BACKGROUND_KERNEL_SIZE = 31
DEFAULT_MIN_CONTRAST = 12
DEFAULT_FOREGROUND_GAIN = 3.0


def suppress_bleed_through(
    image: np.ndarray,
    background_kernel_size: int = DEFAULT_BACKGROUND_KERNEL_SIZE,
    min_contrast: int = DEFAULT_MIN_CONTRAST,
    foreground_gain: float = DEFAULT_FOREGROUND_GAIN,
) -> np.ndarray:
    """
    Suppress faint show-through while preserving darker front-side text.

    A blurred image estimates the local paper background. Pixels that are
    only slightly darker than this background are treated as faint
    bleed-through, while stronger dark strokes are retained.

    Args:
        image: Grayscale document image.
        background_kernel_size: Odd Gaussian kernel used to estimate
            the local background.
        min_contrast: Minimum darkness difference required for a pixel
            to be retained as foreground.
        foreground_gain: Strength applied to retained foreground strokes.

    Returns:
        Grayscale image with faint bleed-through reduced.

    Raises:
        TypeError: If parameter types are invalid.
        ValueError: If the image or parameter values are invalid.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError(
            "Bleed-through suppression requires a grayscale image."
        )

    if (
        isinstance(background_kernel_size, bool)
        or not isinstance(background_kernel_size, int)
    ):
        raise TypeError(
            "background_kernel_size must be an integer."
        )

    if (
        background_kernel_size <= 1
        or background_kernel_size % 2 == 0
    ):
        raise ValueError(
            "background_kernel_size must be an odd integer greater than one."
        )

    if isinstance(min_contrast, bool) or not isinstance(
        min_contrast,
        int,
    ):
        raise TypeError(
            "min_contrast must be an integer."
        )

    if min_contrast < 0:
        raise ValueError(
            "min_contrast cannot be negative."
        )

    if isinstance(foreground_gain, bool) or not isinstance(
        foreground_gain,
        (int, float),
    ):
        raise TypeError(
            "foreground_gain must be numeric."
        )

    if foreground_gain <= 0:
        raise ValueError(
            "foreground_gain must be greater than zero."
        )

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3
        else image
    )

    estimated_background = cv2.GaussianBlur(
        grayscale_image,
        (
            background_kernel_size,
            background_kernel_size,
        ),
        0,
    )

    darkness = cv2.subtract(
        estimated_background,
        grayscale_image,
    ).astype(np.float32)

    foreground_strength = np.clip(
        (darkness - min_contrast)
        * foreground_gain,
        0,
        255,
    )

    return (
        255 - foreground_strength
    ).astype(np.uint8)
