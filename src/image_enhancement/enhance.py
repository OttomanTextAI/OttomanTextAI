"""
Gürültü azaltma (denoise) ve kontrast iyileştirme (contrast enhancement) işlemleri.
"""
import cv2
import numpy as np


def denoise(
    img: np.ndarray,
    method: str = "fastNlMeans",
    h: int = 10,
    template_window_size: int = 7,
    search_window_size: int = 21,
) -> np.ndarray:
    """Görüntüdeki gürültüyü azaltır.

    method:
        - "fastNlMeans": en iyi kalite, en yavaş. Taranmış eski belgeler için önerilir.
        - "median": tuz-biber gürültüsüne karşı hızlı ve etkili.
        - "gaussian": hafif yumuşatma, çok hızlı.
    """
    if method == "fastNlMeans":
        return cv2.fastNlMeansDenoising(
            img, None, h, template_window_size, search_window_size
        )
    elif method == "median":
        return cv2.medianBlur(img, 3)
    elif method == "gaussian":
        return cv2.GaussianBlur(img, (3, 3), 0)
    else:
        raise ValueError(f"Bilinmeyen denoise metodu: {method}")


def enhance_contrast(
    img: np.ndarray,
    method: str = "clahe",
    clip_limit: float = 2.0,
    tile_grid_size: tuple = (8, 8),
) -> np.ndarray:
    """Kontrastı artırır.

    method:
        - "clahe": lokal kontrast iyileştirme, aydınlatması eşit olmayan
          el yazması sayfalar için en uygun yöntem (genel histogram eşitlemeye göre
          daha az gürültü büyütür).
        - "hist_eq": global histogram eşitleme, daha basit ama lekeli/gölgeli
          sayfalarda aşırı kontrast yaratabilir.
    """
    if method == "clahe":
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tuple(tile_grid_size))
        return clahe.apply(img)
    elif method == "hist_eq":
        return cv2.equalizeHist(img)
    else:
        raise ValueError(f"Bilinmeyen contrast metodu: {method}")


def sharpen(img: np.ndarray, amount: float = 1.0) -> np.ndarray:
    """Unsharp mask ile hafif keskinleştirme. Silik/soluk mürekkep için opsiyonel;
    varsayılan pipeline'da kapalı, deneysel olarak eklenebilir."""
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    return cv2.addWeighted(img, 1 + amount, blurred, -amount, 0)