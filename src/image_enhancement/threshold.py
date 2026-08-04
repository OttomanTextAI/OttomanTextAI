"""Thresholding operations for document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
    validate_odd_kernel_size,
)


DEFAULT_ADAPTIVE_BLOCK_SIZE = 15
DEFAULT_ADAPTIVE_CONSTANT = 10.0


def apply_otsu_threshold(
    image: np.ndarray,
    invert: bool = False,
) -> np.ndarray:
    """
    Apply Otsu's global thresholding method to a grayscale image.

    Args:
        image: Grayscale input image.
        invert: Whether to invert the binary output.

    Returns:
        Binary image containing pixel values 0 and 255.

    Raises:
        ValueError: If the input image is not grayscale.
    """
    grayscale_image = _prepare_grayscale_image(image)

    threshold_type = (
        cv2.THRESH_BINARY_INV
        if invert
        else cv2.THRESH_BINARY
    )

    _, binary_image = cv2.threshold(
        grayscale_image,
        0,
        255,
        threshold_type | cv2.THRESH_OTSU,
    )

    return binary_image


def apply_adaptive_threshold(
    image: np.ndarray,
    block_size: int = DEFAULT_ADAPTIVE_BLOCK_SIZE,
    constant: float = DEFAULT_ADAPTIVE_CONSTANT,
    invert: bool = False,
) -> np.ndarray:
    """
    Apply adaptive Gaussian thresholding to a grayscale image.

    Args:
        image: Grayscale input image.
        block_size: Size of the local pixel neighborhood.
            Must be an odd integer greater than one.
        constant: Value subtracted from the calculated local threshold.
        invert: Whether to invert the binary output.

    Returns:
        Binary image containing pixel values 0 and 255.

    Raises:
        TypeError: If constant is not numeric.
        ValueError: If the input image or parameters are invalid.
    """
    grayscale_image = _prepare_grayscale_image(image)

    validate_odd_kernel_size(
    block_size,
    parameter_name="block_size",
    )

    _validate_constant(constant)

    threshold_type = (
        cv2.THRESH_BINARY_INV
        if invert
        else cv2.THRESH_BINARY
    )

    return cv2.adaptiveThreshold(
        grayscale_image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        threshold_type,
        block_size,
        constant,
    )


def _prepare_grayscale_image(
    image: np.ndarray,
) -> np.ndarray:
    """
    Validate and normalize a grayscale image representation.

    Args:
        image: Input image.

    Returns:
        Two-dimensional grayscale image.

    Raises:
        ValueError: If the image is not grayscale.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError(
            "Thresholding requires a grayscale image."
        )

    if image.ndim == 3:
        return image.squeeze(axis=2)

    return image


def _validate_constant(
    constant: float,
) -> None:
    """
    Validate an adaptive-threshold constant.

    Args:
        constant: Value to validate.

    Raises:
        TypeError: If constant is not numeric.
    """
    if isinstance(constant, bool) or not isinstance(
        constant,
        (int, float),
    ):
        raise TypeError(
            "constant must be a numeric value."
        )