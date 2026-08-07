"""Utility functions for image input, output, and validation."""

from pathlib import Path

import cv2
import numpy as np


def validate_image(image: np.ndarray) -> None:
    """
    Validate that the given value is a supported image array.

    Args:
        image: Image represented as a NumPy array.

    Raises:
        TypeError: If image is not a NumPy array.
        ValueError: If image is empty or has an unsupported shape.
    """
    if image is None:
        raise ValueError("Image cannot be None.")

    if not isinstance(image, np.ndarray):
        raise TypeError("Image must be a NumPy array.")

    if image.size == 0:
        raise ValueError("Image cannot be empty.")

    if image.ndim not in (2, 3):
        raise ValueError(
            "Image must have 2 or 3 dimensions."
        )

    if image.ndim == 3 and image.shape[2] not in (1, 3, 4):
        raise ValueError(
            "Image must have 1, 3, or 4 channels."
        )


def read_image(image_path: str | Path) -> np.ndarray:
    """
    Read an image from disk in BGR format.

    Args:
        image_path: Path of the image to read.

    Returns:
        Image as a NumPy array.

    Raises:
        FileNotFoundError: If the image path does not exist.
        IsADirectoryError: If the given path points to a directory.
        ValueError: If OpenCV cannot decode the image.
    """
    path = Path(image_path)

    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {path}")

    if path.is_dir():
        raise IsADirectoryError(
            f"Expected an image file, but received a directory: {path}"
        )

    image_data = np.fromfile(
        path,
        dtype=np.uint8,
    )

    image = cv2.imdecode(
        image_data,
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise ValueError(f"Failed to read image: {path}")

    validate_image(image)

    return image


def save_image(
    image: np.ndarray,
    image_path: str | Path,
) -> None:
    """
    Save an image to disk using a Unicode-safe method.

    Args:
        image: Image represented as a NumPy array.
        image_path: Destination file path.

    Raises:
        OSError: If the image cannot be encoded or written.
    """
    validate_image(image)

    path = Path(image_path)

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    extension = path.suffix.lower()

    if not extension:
        raise ValueError(
            "Output path must include a file extension."
        )

    success, encoded_image = cv2.imencode(
        extension,
        image,
    )

    if not success:
        raise OSError(
            f"Failed to encode image: {path}"
        )

    try:
        encoded_image.tofile(
            str(path)
        )
    except OSError as error:
        raise OSError(
            f"Failed to save image: {path}"
        ) from error

def is_grayscale(image: np.ndarray) -> bool:
    """
    Check whether an image is grayscale.

    Args:
        image: Image represented as a NumPy array.

    Returns:
        True if the image is grayscale, otherwise False.
    """
    validate_image(image)

    return image.ndim == 2 or (
        image.ndim == 3 and image.shape[2] == 1
    )


def validate_odd_kernel_size(
    kernel_size: int,
    parameter_name: str = "kernel_size",
) -> None:
    """
    Validate that a kernel size is a positive odd integer.

    Args:
        kernel_size: Kernel size to validate.
        parameter_name: Name used in error messages.

    Raises:
        TypeError: If kernel_size is not an integer.
        ValueError: If kernel_size is not positive or odd.
    """
    if isinstance(kernel_size, bool) or not isinstance(kernel_size, int):
        raise TypeError(
            f"{parameter_name} must be an integer."
        )

    if kernel_size <= 0:
        raise ValueError(
            f"{parameter_name} must be greater than zero."
        )

    if kernel_size % 2 == 0:
        raise ValueError(
            f"{parameter_name} must be an odd number."
        )


def _create_parent_directory(file_path: Path) -> None:
    """
    Create the parent directory of a file path if necessary.

    Args:
        file_path: Path whose parent directory will be created.
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)