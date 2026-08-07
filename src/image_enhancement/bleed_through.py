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
    edge_threshold: int = 20,
    connectivity_kernel_size: int = 3,
) -> np.ndarray:
    """
    Suppress faint show-through while preserving real text strokes.

    The method combines local contrast, edge strength, and local
    connectivity. Faint low-contrast regions are suppressed, while
    darker and structurally connected character strokes are retained.

    Args:
        image: Grayscale document image.
        background_kernel_size: Odd Gaussian kernel used to estimate
            the local paper background.
        min_contrast: Minimum local darkness difference.
        foreground_gain: Strength applied to retained foreground strokes.
        edge_threshold: Minimum gradient magnitude used to protect edges.
        connectivity_kernel_size: Kernel size used to protect locally
            connected character strokes.

    Returns:
        Grayscale image with reduced bleed-through.
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

    local_darkness = cv2.subtract(
        estimated_background,
        grayscale_image,
    )

    grad_x = cv2.Sobel(
        grayscale_image,
        cv2.CV_32F,
        1,
        0,
        ksize=3,
    )

    grad_y = cv2.Sobel(
        grayscale_image,
        cv2.CV_32F,
        0,
        1,
        ksize=3,
    )

    gradient_magnitude = cv2.magnitude(
        grad_x,
        grad_y,
    )

    edge_mask = (
        gradient_magnitude >= edge_threshold
    ).astype(np.uint8) * 255

    dark_mask = (
        local_darkness >= min_contrast
    ).astype(np.uint8) * 255

    connectivity_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (
            connectivity_kernel_size,
            connectivity_kernel_size,
        ),
    )

    connected_mask = cv2.dilate(
        dark_mask,
        connectivity_kernel,
        iterations=1,
    )

    protected_mask = cv2.bitwise_or(
        edge_mask,
        connected_mask,
    )

    foreground_strength = np.clip(
        (
            local_darkness.astype(np.float32)
            - min_contrast
        )
        * foreground_gain,
        0,
        255,
    )

    result = (
        255 - foreground_strength
    ).astype(np.uint8)

    protected_pixels = (
        protected_mask > 0
    )

    result[
        protected_pixels
    ] = grayscale_image[
        protected_pixels
    ]

    return result