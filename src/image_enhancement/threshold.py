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

def apply_faint_text_threshold(
    image: np.ndarray,
    base_binary: np.ndarray,
    faint_text_mask: np.ndarray,
    block_size: int = 31,
    constant: float = 4.0,
) -> np.ndarray:
    """
    Recover faint text using a more sensitive adaptive threshold
    only inside faint-text regions.

    Args:
        image:
            Grayscale source image before thresholding.

        base_binary:
            Existing binary result.

        faint_text_mask:
            Binary mask where faint-text pixels/regions are white.

        block_size:
            Adaptive threshold neighbourhood size.

        constant:
            Adaptive threshold constant. Lower values preserve
            more faint foreground.

    Returns:
        Binary image with additional faint-text pixels recovered.
    """

    grayscale_image = _prepare_grayscale_image(
        image
    )

    validate_image(
        base_binary
    )

    validate_odd_kernel_size(
        block_size,
        parameter_name="block_size",
    )

    _validate_constant(
        constant
    )

    if base_binary.ndim != 2:
        raise ValueError(
            "base_binary must be a 2D binary image."
        )

    if faint_text_mask.shape != base_binary.shape:
        raise ValueError(
            "faint_text_mask and base_binary must have "
            "the same shape."
        )

    sensitive_binary = cv2.adaptiveThreshold(
        grayscale_image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        constant,
    )

    result = base_binary.copy()

    recovery_pixels = (
        (faint_text_mask > 0)
        & (sensitive_binary == 0)
    )

    result[
        recovery_pixels
    ] = 0

    return result

def recover_nearby_faint_strokes(
    image: np.ndarray,
    base_binary: np.ndarray,
    block_size: int = 21,
    constant: float = 2.0,
    proximity_radius: int = 2,
) -> np.ndarray:
    """
    Recover weak text strokes only near already detected text.

    This is intentionally conservative:
    it does not apply the sensitive threshold globally.
    """

    grayscale_image = _prepare_grayscale_image(
        image
    )

    validate_image(
        base_binary
    )

    validate_odd_kernel_size(
        block_size,
        parameter_name="block_size",
    )

    _validate_constant(
        constant
    )

    if base_binary.ndim != 2:
        raise ValueError(
            "base_binary must be a 2D binary image."
        )

    sensitive_binary = cv2.adaptiveThreshold(
        grayscale_image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        constant,
    )

    # Existing black text pixels
    existing_text = (
        base_binary == 0
    ).astype(
        np.uint8
    ) * 255

    kernel_size = (
        2 * proximity_radius + 1
    )

    proximity_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (
            kernel_size,
            kernel_size,
        ),
    )

    nearby_text_zone = cv2.dilate(
        existing_text,
        proximity_kernel,
        iterations=1,
    )

    result = base_binary.copy()

    recovery_pixels = (
        (sensitive_binary == 0)
        & (nearby_text_zone > 0)
        & (base_binary == 255)
    )

    result[
        recovery_pixels
    ] = 0

    return result

def recover_masked_faint_strokes(
    image: np.ndarray,
    base_binary: np.ndarray,
    faint_text_mask: np.ndarray,
    block_size: int = 21,
    constant: float = 2.0,
    mask_expansion: int = 1,
) -> np.ndarray:
    """
    Recover weak text strokes only inside or immediately
    around detected faint-text regions.

    Pixels outside the expanded faint-text mask are never
    modified.
    """

    grayscale_image = _prepare_grayscale_image(
        image
    )

    validate_image(
        base_binary
    )

    validate_image(
        faint_text_mask
    )

    validate_odd_kernel_size(
        block_size,
        parameter_name="block_size",
    )

    _validate_constant(
        constant
    )

    if base_binary.ndim != 2:
        raise ValueError(
            "base_binary must be a 2D binary image."
        )

    if faint_text_mask.ndim != 2:
        raise ValueError(
            "faint_text_mask must be a 2D image."
        )

    if faint_text_mask.shape != base_binary.shape:
        raise ValueError(
            "faint_text_mask and base_binary must "
            "have the same shape."
        )

    sensitive_binary = cv2.adaptiveThreshold(
        grayscale_image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        constant,
    )

    # Slightly expand the existing faint-text mask.
    if mask_expansion > 0:
        kernel_size = (
            2 * mask_expansion + 1
        )

        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (
                kernel_size,
                kernel_size,
            ),
        )

        recovery_zone = cv2.dilate(
            faint_text_mask,
            kernel,
            iterations=1,
        )

    else:
        recovery_zone = faint_text_mask

    result = base_binary.copy()

    recovery_pixels = (
        (recovery_zone > 0)
        & (sensitive_binary == 0)
        & (base_binary == 255)
    )

    result[
        recovery_pixels
    ] = 0

    return result