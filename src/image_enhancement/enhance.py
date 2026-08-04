"""Image enhancement operations for Ottoman document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_CLAHE_CLIP_LIMIT = 2.0
DEFAULT_CLAHE_TILE_GRID_SIZE = (8, 8)


def convert_to_grayscale(image: np.ndarray) -> np.ndarray:
    """
    Convert an image to grayscale.

    Grayscale images are returned as a copy without additional conversion.

    Args:
        image: Input image represented as a NumPy array.

    Returns:
        Grayscale image represented as a two-dimensional NumPy array.

    Raises:
        ValueError: If the image has an unsupported channel count.
    """
    validate_image(image)

    if is_grayscale(image):
        return image.squeeze(axis=2).copy() if image.ndim == 3 else image.copy()

    channel_count = image.shape[2]

    if channel_count == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if channel_count == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)

    raise ValueError(
        f"Unsupported channel count for grayscale conversion: {channel_count}"
    )


def apply_clahe(
    image: np.ndarray,
    clip_limit: float = DEFAULT_CLAHE_CLIP_LIMIT,
    tile_grid_size: tuple[int, int] = DEFAULT_CLAHE_TILE_GRID_SIZE,
) -> np.ndarray:
    """
    Improve local contrast using CLAHE.

    Args:
        image: Grayscale input image.
        clip_limit: Contrast limiting threshold.
        tile_grid_size: Number of tiles in the horizontal and vertical directions.

    Returns:
        Contrast-enhanced grayscale image.

    Raises:
        TypeError: If CLAHE parameters have invalid types.
        ValueError: If the image is not grayscale or parameter values are invalid.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError("CLAHE requires a grayscale image.")

    _validate_clip_limit(clip_limit)
    _validate_tile_grid_size(tile_grid_size)

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3
        else image
    )

    clahe = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=tile_grid_size,
    )

    return clahe.apply(grayscale_image)


def _validate_clip_limit(clip_limit: float) -> None:
    """
    Validate a CLAHE clip-limit value.

    Args:
        clip_limit: Value to validate.

    Raises:
        TypeError: If clip_limit is not numeric.
        ValueError: If clip_limit is not greater than zero.
    """
    if isinstance(clip_limit, bool) or not isinstance(
        clip_limit,
        (int, float),
    ):
        raise TypeError("clip_limit must be a numeric value.")

    if clip_limit <= 0:
        raise ValueError("clip_limit must be greater than zero.")


def _validate_tile_grid_size(
    tile_grid_size: tuple[int, int],
) -> None:
    """
    Validate a CLAHE tile-grid size.

    Args:
        tile_grid_size: Horizontal and vertical tile counts.

    Raises:
        TypeError: If tile_grid_size is not a two-item tuple of integers.
        ValueError: If either tile count is not greater than zero.
    """
    if not isinstance(tile_grid_size, tuple) or len(tile_grid_size) != 2:
        raise TypeError(
            "tile_grid_size must be a tuple containing two integers."
        )

    if any(
        isinstance(value, bool) or not isinstance(value, int)
        for value in tile_grid_size
    ):
        raise TypeError(
            "tile_grid_size values must be integers."
        )

    if any(value <= 0 for value in tile_grid_size):
        raise ValueError(
            "tile_grid_size values must be greater than zero."
        )