"""
Image enhancement modülü için yardımcı fonksiyonlar.
Görüntü okuma/yazma, klasör tarama ve görsel karşılaştırma işlemleri.
"""
from pathlib import Path
from typing import List, Union

import cv2
import numpy as np


def load_image(path: Union[str, Path], grayscale: bool = True) -> np.ndarray:
    """Diskten bir görüntüyü okur. Kraken satır bazlı OCR için genelde
    grayscale yeterli ve daha hızlıdır."""
    path = str(path)
    flag = cv2.IMREAD_GRAYSCALE if grayscale else cv2.IMREAD_COLOR
    img = cv2.imread(path, flag)
    if img is None:
        raise FileNotFoundError(f"Görüntü okunamadı: {path}")
    return img


def save_image(img: np.ndarray, path: Union[str, Path]) -> None:
    """Görüntüyü diske kaydeder, gerekirse klasörleri oluşturur."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), img)


def list_images(
    folder: Union[str, Path],
    extensions: tuple = (".png", ".jpg", ".jpeg", ".tif", ".tiff"),
) -> List[Path]:
    """Bir klasördeki (alt klasörler dahil) tüm görüntü dosyalarını listeler."""
    folder = Path(folder)
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in extensions)


def to_grayscale(img: np.ndarray) -> np.ndarray:
    """Renkli görüntüyü gri tonlamaya çevirir; zaten griyse dokunmaz."""
    if img.ndim == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def side_by_side(img1: np.ndarray, img2: np.ndarray) -> np.ndarray:
    """İki görüntüyü yan yana birleştirir. Öncesi/sonrası karşılaştırmasını
    notebook'ta görsel olarak kontrol etmek için kullanılır."""
    def _to_bgr(im: np.ndarray) -> np.ndarray:
        return cv2.cvtColor(im, cv2.COLOR_GRAY2BGR) if im.ndim == 2 else im

    a, b = _to_bgr(img1), _to_bgr(img2)
    h = max(a.shape[0], b.shape[0])

    def _pad(im: np.ndarray) -> np.ndarray:
        if im.shape[0] != h:
            im = cv2.copyMakeBorder(
                im, 0, h - im.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(255, 255, 255)
            )
        return im

    return np.hstack([_pad(a), _pad(b)])