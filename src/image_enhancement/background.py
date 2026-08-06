"""Background normalization operations for document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_BACKGROUND_KERNEL_SIZE = 31

DEFAULT_STAIN_KERNEL_SIZE = 51

def suppress_stains(
    image: np.ndarray,
    kernel_size: int = DEFAULT_STAIN_KERNEL_SIZE,
) -> np.ndarray:
    """
    Suppress broad paper stains while preserving narrow text strokes.

    A morphological closing operation estimates the document background.
    Dividing the grayscale image by this background reduces broad dark
    stains and uneven paper discoloration.

    Args:
        image: Grayscale document image.
        kernel_size: Odd morphology kernel size. It should be larger
            than typical character strokes.

    Returns:
        Stain-suppressed grayscale image.

    Raises:
        TypeError: If kernel_size is not an integer.
        ValueError: If the image is not grayscale or kernel_size is invalid.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError(
            "Stain suppression requires a grayscale image."
        )

    if isinstance(kernel_size, bool) or not isinstance(kernel_size, int):
        raise TypeError(
            "kernel_size must be an integer."
        )

    if kernel_size <= 1 or kernel_size % 2 == 0:
        raise ValueError(
            "kernel_size must be an odd integer greater than one."
        )

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3
        else image
    )

    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size),
    )

    estimated_background = cv2.morphologyEx(
        grayscale_image,
        cv2.MORPH_CLOSE,
        kernel,
    )

    estimated_background = np.maximum(
        estimated_background,
        1,
    )

    normalized_image = cv2.divide(
        grayscale_image,
        estimated_background,
        scale=255,
    )

    return normalized_image


def normalize_background(
    image: np.ndarray,
    kernel_size: int = DEFAULT_BACKGROUND_KERNEL_SIZE,
) -> np.ndarray:
    """
    Reduce uneven illumination, paper discoloration, and broad stains.

    A blurred version of the document is used as an estimate of the
    background. The original grayscale image is divided by this estimate,
    making the paper background more uniform while preserving dark text.

    Args:
        image: Grayscale document image.
        kernel_size: Odd Gaussian kernel size used to estimate the
            document background.

    Returns:
        Background-normalized grayscale image.

    Raises:
        TypeError: If kernel_size is not an integer.
        ValueError: If the image is not grayscale or kernel_size is invalid.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError(
            "Background normalization requires a grayscale image."
        )

    if isinstance(kernel_size, bool) or not isinstance(kernel_size, int):
        raise TypeError(
            "kernel_size must be an integer."
        )

    if kernel_size <= 1 or kernel_size % 2 == 0:
        raise ValueError(
            "kernel_size must be an odd integer greater than one."
        )

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3
        else image
    )

    estimated_background = cv2.GaussianBlur(
        grayscale_image,
        (kernel_size, kernel_size),
        0,
    )

    normalized_image = cv2.divide(
        grayscale_image,
        estimated_background,
        scale=255,
    )

    return normalized_image