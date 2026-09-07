from pathlib import Path
import cv2
import numpy as np

from src.image_enhancement.preprocess import preprocess_image

image_path = Path(
    "data/test_images/Ankara- Anavatan Mecmuası Sayı 2 sf 18 gazete.png"
)

data = np.fromfile(str(image_path), dtype=np.uint8)
image = cv2.imdecode(data, cv2.IMREAD_COLOR)

result = preprocess_image(
    image,
    profile="printed-degraded",
)

cv2.imwrite(
    "data/processed/ankara_printed_degraded_test.png",
    result,
)