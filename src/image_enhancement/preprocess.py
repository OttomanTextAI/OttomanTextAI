"""Preprocessing pipelines for Ottoman document images."""

from pathlib import Path
from typing import Any

import numpy as np
from src.image_enhancement.deskew import deskew_image
from src.image_enhancement.perspective import correct_perspective


from src.common.config import load_yaml_config
from src.image_enhancement.background import (
    normalize_background,
)

from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
    reduce_noise,
)
from src.image_enhancement.threshold import (
    apply_adaptive_threshold,
    apply_otsu_threshold,
)
from src.image_enhancement.utils import (
    read_image,
    save_image,
)


SUPPORTED_THRESHOLD_METHODS = {
    "otsu",
    "adaptive",
}

DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "configs"
    / "image_enhancement.yaml"
)


def preprocess_image(
    image: np.ndarray,
    threshold_method: str = "otsu",
    config_path: str | Path | None = None,
) -> np.ndarray:
    """
    Apply the default preprocessing pipeline to an image.

    The pipeline consists of perspective correction, deskewing,
    grayscale conversion, noise reduction, background normalization,
    CLAHE enhancement, and thresholding.

    config_path: Optional path to an image enhancement
            configuration file.

    Args:
        image: Input document image.
        threshold_method: Thresholding method to apply. Supported values
            are "otsu" and "adaptive".

    Returns:
        Preprocessed binary image.

    Raises:
        TypeError: If threshold_method is not a string.
        ValueError: If threshold_method is unsupported.
    """
    normalized_threshold_method = _validate_threshold_method(
        threshold_method
    )

    config = _load_preprocessing_config(
        config_path
    )

    enhancement_config = config[
        "enhancement"
    ]

    denoise_config = enhancement_config[
        "denoise"
    ]

    clahe_config = enhancement_config[
        "clahe"
    ]

    background_config = enhancement_config[
        "background_normalization"
    ]
    
    perspective_corrected_image = correct_perspective(
        image
    )

    deskewed_image = deskew_image(
        perspective_corrected_image
    )

    grayscale_image = convert_to_grayscale(
        deskewed_image
    )

    denoised_image = reduce_noise(
        grayscale_image,
        diameter=denoise_config["diameter"],
        sigma_color=denoise_config["sigma_color"],
        sigma_space=denoise_config["sigma_space"],
    )

    normalized_image = normalize_background(
        denoised_image,
        kernel_size=background_config[
            "kernel_size"
        ],
    )

    enhanced_image = apply_clahe(
        normalized_image,
        clip_limit=clahe_config["clip_limit"],
        tile_grid_size=tuple(
            clahe_config["tile_grid_size"]
        ),
    )

    if normalized_threshold_method == "otsu":
        return apply_otsu_threshold(enhanced_image)

    return apply_adaptive_threshold(enhanced_image)


def preprocess_image_file(
    input_path: str | Path,
    output_path: str | Path,
    threshold_method: str = "otsu",
) -> np.ndarray:
    """
    Read, preprocess, and save a document image.

    Args:
        input_path: Path of the input image.
        output_path: Path where the processed image will be saved.
        threshold_method: Thresholding method to apply. Supported values
            are "otsu" and "adaptive".

    Returns:
        Preprocessed binary image.
    """
    image = read_image(input_path)

    processed_image = preprocess_image(
        image,
        threshold_method=threshold_method,
    )

    save_image(
        processed_image,
        output_path,
    )

    return processed_image


def _validate_threshold_method(
    threshold_method: str,
) -> str:
    """
    Validate and normalize a thresholding method name.

    Args:
        threshold_method: Thresholding method name.

    Returns:
        Normalized lowercase thresholding method name.

    Raises:
        TypeError: If threshold_method is not a string.
        ValueError: If threshold_method is unsupported.
    """
    if not isinstance(threshold_method, str):
        raise TypeError(
            "threshold_method must be a string."
        )

    normalized_threshold_method = (
        threshold_method.strip().lower()
    )



    if normalized_threshold_method not in SUPPORTED_THRESHOLD_METHODS:
        supported_methods = ", ".join(
            sorted(SUPPORTED_THRESHOLD_METHODS)
        )

        raise ValueError(
            "Unsupported threshold_method: "
            f"{threshold_method!r}. "
            f"Supported methods: {supported_methods}."
        )

    return normalized_threshold_method

def _load_preprocessing_config(
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    """
    Load image enhancement configuration values.

    Args:
        config_path: Optional custom configuration file path.

    Returns:
        Parsed image enhancement configuration.
    """
    resolved_config_path = (
        DEFAULT_CONFIG_PATH
        if config_path is None
        else Path(config_path)
    )

    return load_yaml_config(
        resolved_config_path
    )