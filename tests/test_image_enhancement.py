"""
image_enhancement modülü için birim testleri.
Gerçek görüntü dosyalarına ihtiyaç duymaz; sentetik bir test görüntüsü üretir.

Çalıştırmak için (proje kök dizininden):
    pytest tests/test_image_enhancement.py -v
"""
import cv2
import numpy as np
import pytest

from src.image_enhancement import deskew, enhance, preprocess, threshold


@pytest.fixture
def sample_image() -> np.ndarray:
    img = np.full((100, 200), 200, dtype=np.uint8)
    cv2.putText(img, "Test Metin", (10, 55), cv2.FONT_HERSHEY_SIMPLEX, 1, (0,), 2)
    noise = np.random.normal(0, 8, img.shape).astype(np.int16)
    noisy = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return noisy


def test_denoise_fastnlmeans_preserves_shape(sample_image):
    out = enhance.denoise(sample_image, method="fastNlMeans")
    assert out.shape == sample_image.shape
    assert out.dtype == sample_image.dtype


def test_denoise_median(sample_image):
    out = enhance.denoise(sample_image, method="median")
    assert out.shape == sample_image.shape


def test_denoise_invalid_method_raises(sample_image):
    with pytest.raises(ValueError):
        enhance.denoise(sample_image, method="does_not_exist")


def test_enhance_contrast_clahe(sample_image):
    out = enhance.enhance_contrast(sample_image, method="clahe")
    assert out.shape == sample_image.shape


def test_enhance_contrast_hist_eq(sample_image):
    out = enhance.enhance_contrast(sample_image, method="hist_eq")
    assert out.shape == sample_image.shape


def test_binarize_otsu_is_binary(sample_image):
    out = threshold.binarize(sample_image, method="otsu")
    assert set(np.unique(out).tolist()).issubset({0, 255})


def test_binarize_adaptive(sample_image):
    out = threshold.binarize(sample_image, method="adaptive")
    assert out.shape == sample_image.shape


def test_binarize_invalid_method_raises(sample_image):
    with pytest.raises(ValueError):
        threshold.binarize(sample_image, method="does_not_exist")


def test_deskew_hough_no_crash(sample_image):
    out = deskew.deskew_image(sample_image, method="hough")
    assert out.shape == sample_image.shape


def test_deskew_projection_no_crash(sample_image):
    out = deskew.deskew_image(sample_image, method="projection", max_angle=5, angle_step=1)
    assert out.shape == sample_image.shape


def test_deskew_detects_rotation():
    # Metin satırlarını taklit eden birden çok paralel çizgi içeren, bilerek
    # eğik bir görüntü üret; tespit edilen açının doğru yönde/civarda olduğunu kontrol et
    img = np.zeros((300, 300), dtype=np.uint8)
    for y in range(40, 260, 25):
        cv2.line(img, (20, y), (280, y), 255, 2)
    center = (150, 150)
    matrix = cv2.getRotationMatrix2D(center, 8, 1.0)
    rotated = cv2.warpAffine(img, matrix, (300, 300))
    angle = deskew.detect_skew_angle_hough(rotated, max_angle=15)
    assert 3 < abs(angle) < 15  # ~8 derece civarında bir açı bekleniyor


def test_process_image_full_pipeline(sample_image):
    config = {
        "denoise": {"enabled": True, "method": "median"},
        "contrast": {"enabled": True, "method": "clahe"},
        "deskew": {"enabled": True, "method": "hough"},
        "threshold": {"enabled": True, "method": "otsu"},
    }
    out = preprocess.process_image(sample_image, config)
    assert out.shape == sample_image.shape
    assert set(np.unique(out).tolist()).issubset({0, 255})


def test_process_image_all_steps_disabled(sample_image):
    config = {
        "denoise": {"enabled": False},
        "contrast": {"enabled": False},
        "deskew": {"enabled": False},
        "threshold": {"enabled": False},
    }
    out = preprocess.process_image(sample_image, config)
    np.testing.assert_array_equal(out, sample_image)