"""Tests for image enhancement functions."""

from pathlib import Path

import numpy as np

from src.image_enhancement.enhance import convert_to_grayscale
from src.image_enhancement.preprocess import preprocess_image_file
from src.image_enhancement.threshold import apply_otsu_threshold
from src.image_enhancement.threshold import apply_adaptive_threshold

INPUT_PATH = Path("data/raw/ground_truth/sample_01.png")
OUTPUT_PATH = Path("data/processed/test_output.png")


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