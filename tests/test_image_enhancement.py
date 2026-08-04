"""Tests for image enhancement functions."""

from pathlib import Path

import numpy as np

from src.common.config import load_yaml_config
from src.image_enhancement.deskew import deskew_image
from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
    reduce_noise,
)
from src.image_enhancement.perspective import correct_perspective
from src.image_enhancement.preprocess import preprocess_image_file
from src.image_enhancement.threshold import (
    apply_adaptive_threshold,
    apply_otsu_threshold,
)
from src.image_enhancement.utils import read_image

from src.image_enhancement.deskew import (
    deskew_image,
    estimate_skew_angle,
)
from src.image_enhancement.perspective import (
    correct_perspective,
)

INPUT_PATH = Path("data/raw/ground_truth/sample_01.png")
OUTPUT_PATH = Path("data/processed/test_output.png")
CONFIG_PATH = Path(
    "configs/image_enhancement.yaml"
)
SAMPLE_03_PATH = Path(
    "data/raw/ground_truth/sample_03.png"
)

def test_convert_to_grayscale() -> None:
    """Test that a color image is converted to grayscale."""
    color_image = np.zeros((50, 50, 3), dtype=np.uint8)

    grayscale_image = convert_to_grayscale(color_image)

    assert grayscale_image.shape == (50, 50)
    assert grayscale_image.ndim == 2
    assert grayscale_image.dtype == np.uint8


def test_preprocess_image_file() -> None:
    """Test that preprocessing produces a non-empty output image."""
    processed_image = preprocess_image_file(
        INPUT_PATH,
        OUTPUT_PATH,
    )

    assert processed_image.size > 0
    assert OUTPUT_PATH.exists()


def test_apply_otsu_threshold() -> None:
        """Test that Otsu threshold returns a binary image."""
        grayscale_image = np.random.randint(
            0,
            256,
            (50, 50),
            dtype=np.uint8,
        )

        binary_image = apply_otsu_threshold(grayscale_image)

        unique_values = np.unique(binary_image)

        assert set(unique_values).issubset({0, 255})

def test_apply_adaptive_threshold() -> None:
    """Test that adaptive threshold returns a binary image."""
    grayscale_image = np.random.randint(
        0,
        256,
        (50, 50),
        dtype=np.uint8,
    )

    binary_image = apply_adaptive_threshold(grayscale_image)

    unique_values = np.unique(binary_image)

    assert set(unique_values).issubset({0, 255})

def test_reduce_noise() -> None:
    """Test that noise reduction preserves image shape and type."""
    noisy_image = np.random.randint(
        0,
        256,
        (50, 50),
        dtype=np.uint8,
    )

    denoised_image = reduce_noise(noisy_image)

    assert denoised_image.shape == noisy_image.shape
    assert denoised_image.dtype == np.uint8
    assert denoised_image.size > 0

def test_deskew_image() -> None:
    """Test that deskewing reduces the detected text-line angle."""
    image = read_image(SAMPLE_03_PATH)

    original_angle = estimate_skew_angle(image)
    deskewed_image = deskew_image(
        image,
        angle=original_angle,
    )
    deskewed_angle = estimate_skew_angle(
        deskewed_image
    )

    assert deskewed_image.shape == image.shape
    assert deskewed_image.dtype == image.dtype
    assert abs(deskewed_angle) < abs(original_angle)

def test_correct_perspective() -> None:
    """Test that perspective correction returns a valid image."""
    image = read_image(SAMPLE_03_PATH)

    corrected_image = correct_perspective(image)

    assert corrected_image.size > 0
    assert corrected_image.dtype == image.dtype
    assert corrected_image.ndim == image.ndim

        
def test_apply_clahe() -> None:
    """Test that CLAHE preserves grayscale image properties."""
    grayscale_image = np.random.randint(
        0,
        256,
        (50, 50),
        dtype=np.uint8,
    )

    enhanced_image = apply_clahe(grayscale_image)

    assert enhanced_image.shape == grayscale_image.shape
    assert enhanced_image.dtype == np.uint8
    assert enhanced_image.ndim == 2

def test_load_image_enhancement_config() -> None:
    """Test that the image enhancement configuration loads correctly."""
    config = load_yaml_config(CONFIG_PATH)

    assert "enhancement" in config
    assert "denoise" in config["enhancement"]
    assert "clahe" in config["enhancement"]

    denoise_config = config["enhancement"]["denoise"]
    clahe_config = config["enhancement"]["clahe"]

    assert denoise_config["diameter"] > 0
    assert denoise_config["sigma_color"] > 0
    assert denoise_config["sigma_space"] > 0
    assert clahe_config["clip_limit"] > 0
    assert len(clahe_config["tile_grid_size"]) == 2