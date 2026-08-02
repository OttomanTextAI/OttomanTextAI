"""
Binarization (ikilileştirme) işlemleri.
Kraken hem gri tonlama hem binarize görüntü kabul eder, ama düzgün binarize
edilmiş girdi genelde satır tespitini ve tanımayı kolaylaştırır.
"""
import cv2
import numpy as np


def binarize(
    img: np.ndarray,
    method: str = "otsu",
    adaptive_block_size: int = 31,
    adaptive_C: int = 15,
) -> np.ndarray:
    """Görüntüyü siyah-beyaza indirger.

    method:
        - "otsu": global eşik, aydınlatması homojen sayfalar için hızlı ve iyi.
        - "adaptive": lokal eşik, lekeli/gölgeli/eşit olmayan aydınlatmalı
          el yazması sayfalarda genelde daha iyi sonuç verir.
        - "sauvola": el yazması/tarihi belgeler için literatürde sık önerilen
          lokal yöntem (scikit-image gerektirir).
    """
    if method == "otsu":
        _, out = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return out

    elif method == "adaptive":
        block = adaptive_block_size if adaptive_block_size % 2 == 1 else adaptive_block_size + 1
        return cv2.adaptiveThreshold(
            img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, adaptive_C
        )

    elif method == "sauvola":
        try:
            from skimage.filters import threshold_sauvola
        except ImportError as exc:
            raise ImportError(
                "Sauvola için scikit-image gerekli: pip install scikit-image"
            ) from exc
        thresh = threshold_sauvola(img, window_size=25)
        return (img > thresh).astype(np.uint8) * 255

    else:
        raise ValueError(f"Bilinmeyen threshold metodu: {method}")