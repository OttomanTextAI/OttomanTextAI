"""Image enhancement operations for Ottoman document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_CLAHE_CLIP_LIMIT = 2.0
DEFAULT_CLAHE_TILE_GRID_SIZE = (8, 8)

DEFAULT_DENOISE_DIAMETER = 5
DEFAULT_DENOISE_SIGMA_COLOR = 30.0
DEFAULT_DENOISE_SIGMA_SPACE = 30.0

# Every pipeline stage after decode (denoise, CLAHE, threshold, speckle
# removal, ...) scales with pixel count, and on Render's 512MB free tier a
# full-resolution phone photo can OOM-kill the gunicorn worker mid-request.
# Capping the long edge here bounds worst-case memory for the whole
# pipeline regardless of the original photo's resolution.
MAX_LONG_EDGE = 2400

# Rejected before processing rather than risked: an unusually large image
# (e.g. a raw scan) can already be too heavy to safely hold in memory at
# decode time, before it even reaches the resize step above.
MAX_DECODE_MEGAPIXELS = 60


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

def reduce_noise(
    image: np.ndarray,
    diameter: int = DEFAULT_DENOISE_DIAMETER,
    sigma_color: float = DEFAULT_DENOISE_SIGMA_COLOR,
    sigma_space: float = DEFAULT_DENOISE_SIGMA_SPACE,
) -> np.ndarray:
    """
    Reduce document noise while preserving character edges.

    Bilateral filtering smooths paper texture and small intensity
    variations while preserving the edges of Ottoman characters.

    Args:
        image: Grayscale input image.
        diameter: Diameter of the pixel neighbourhood.
        sigma_color: Filter strength for intensity differences.
        sigma_space: Filter strength for spatial distance.

    Returns:
        Noise-reduced grayscale image.

    Raises:
        ValueError: If the image is not grayscale or parameters are invalid.
        TypeError: If parameter types are invalid.
    """
    validate_image(image)

    if not is_grayscale(image):
        raise ValueError(
            "Noise reduction requires a grayscale image."
        )

    if isinstance(diameter, bool) or not isinstance(diameter, int):
        raise TypeError(
            "diameter must be an integer."
        )

    if diameter <= 0:
        raise ValueError(
            "diameter must be greater than zero."
        )

    for parameter_name, parameter_value in (
        ("sigma_color", sigma_color),
        ("sigma_space", sigma_space),
    ):
        if (
            isinstance(parameter_value, bool)
            or not isinstance(parameter_value, (int, float))
        ):
            raise TypeError(
                f"{parameter_name} must be numeric."
            )

        if parameter_value <= 0:
            raise ValueError(
                f"{parameter_name} must be greater than zero."
            )

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3
        else image
    )

    return cv2.bilateralFilter(
        grayscale_image,
        diameter,
        sigma_color,
        sigma_space,
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
def enhance_image(
    image_bytes: bytes,
    profile: str = "printed",
) -> bytes:
    """
    Enhance an Ottoman document image provided as raw bytes.

    This function acts as the integration entry point for the complete
    image-enhancement pipeline. It decodes the input bytes into an OpenCV
    image, applies preprocessing, and encodes the result as PNG bytes.

    Args:
        image_bytes: Encoded input image data.

    Returns:
        Preprocessed image encoded as PNG bytes.

    Raises:
        TypeError: If image_bytes is not a bytes-like object.
        ValueError: If the input cannot be decoded or the output cannot
            be encoded.
    """
    if not isinstance(
        image_bytes,
        (bytes, bytearray),
    ):
        raise TypeError(
            "image_bytes must be bytes or bytearray."
        )

    if not image_bytes:
        raise ValueError(
            "image_bytes cannot be empty."
        )

    encoded_input = np.frombuffer(
        image_bytes,
        dtype=np.uint8,
    )

    decoded_image = cv2.imdecode(
        encoded_input,
        cv2.IMREAD_COLOR,
    )

    if decoded_image is None:
        raise ValueError(
            "Input image bytes could not be decoded."
        )

    decoded_height, decoded_width = decoded_image.shape[:2]
    decoded_megapixels = (decoded_height * decoded_width) / 1_000_000

    if decoded_megapixels > MAX_DECODE_MEGAPIXELS:
        raise ValueError(
            "Bu görsel çok büyük, lütfen daha küçük bir görsel deneyin."
        )

    long_edge = max(decoded_height, decoded_width)

    if long_edge > MAX_LONG_EDGE:
        resize_scale = MAX_LONG_EDGE / long_edge

        decoded_image = cv2.resize(
            decoded_image,
            None,
            fx=resize_scale,
            fy=resize_scale,
            interpolation=cv2.INTER_AREA,
        )

    # Local import prevents a circular import because preprocess.py
    # already imports enhancement functions from this module.
    from src.image_enhancement.preprocess import (
        preprocess_image,
    )

    processed_image = preprocess_image(
        decoded_image,
        profile=profile,
    )

    encoding_succeeded, encoded_output = cv2.imencode(
        ".png",
        processed_image,
    )

    if not encoding_succeeded:
        raise ValueError(
            "Processed image could not be encoded."
        )

    return encoded_output.tobytes()