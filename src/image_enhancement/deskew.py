"""
Eğim tespiti ve düzeltme (deskew).
Taranmış/fotoğraflanmış belgelerde sayfa hafif eğik olabilir; bu eğim
Kraken'in satır segmentasyonunu doğrudan bozar, bu yüzden OCR öncesi düzeltilmeli.
"""
import cv2
import numpy as np


def _rotate(img: np.ndarray, angle: float) -> np.ndarray:
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        img, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )


def detect_skew_angle_hough(img: np.ndarray, max_angle: float = 15.0) -> float:
    """Hough Line Transform ile metin satırlarının açısını tahmin eder.
    Düz, uzun kenar/çizgi içeren sayfalarda hızlı ve güvenilir."""
    edges = cv2.Canny(img, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, np.pi / 180, 150)
    if lines is None:
        return 0.0

    angles = []
    for rho, theta in lines[:, 0]:
        angle = (theta * 180 / np.pi) - 90
        if abs(angle) <= max_angle:
            angles.append(angle)

    if not angles:
        return 0.0
    return float(np.median(angles))


def detect_skew_angle_projection(
    img: np.ndarray, max_angle: float = 15.0, angle_step: float = 0.5
) -> float:
    """Projection profile yöntemi: farklı açılarda döndürüp satır izdüşümünün
    en 'keskin' (varyansı en yüksek) olduğu açıyı bulur. Hough çizgi bulamadığında
    (örn. el yazısı, çizgisiz sayfa) daha güvenilir alternatif."""
    _, binary = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    best_angle, best_score = 0.0, -1.0
    for angle in np.arange(-max_angle, max_angle + angle_step, angle_step):
        rotated = _rotate(binary, angle)
        row_sums = np.sum(rotated, axis=1)
        score = float(np.sum(np.diff(row_sums) ** 2))
        if score > best_score:
            best_score, best_angle = score, float(angle)

    return best_angle


def deskew_image(
    img: np.ndarray,
    method: str = "hough",
    max_angle: float = 15.0,
    angle_step: float = 0.5,
) -> np.ndarray:
    """Görüntüyü tespit edilen açıya göre döndürüp düzeltir."""
    if method == "hough":
        angle = detect_skew_angle_hough(img, max_angle)
    elif method == "projection":
        angle = detect_skew_angle_projection(img, max_angle, angle_step)
    else:
        raise ValueError(f"Bilinmeyen deskew metodu: {method}")

    return _rotate(img, angle)