"""
Görüntü iyileştirme pipeline'ının orkestrasyonu.
configs/image_enhancement.yaml içindeki parametrelere göre denoise -> contrast
-> deskew -> threshold adımlarını sırayla uygular.

Kullanım (CLI):
    python -m src.image_enhancement.preprocess \
        --input data/raw/makhzan \
        --output data/processed/image_enhancement/makhzan \
        --config configs/image_enhancement.yaml
"""
from pathlib import Path
from typing import Union

import numpy as np
import yaml

from . import deskew as deskew_mod
from . import enhance, threshold, utils


def load_config(config_path: Union[str, Path]) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def process_image(img: np.ndarray, config: dict) -> np.ndarray:
    """Tek bir görüntü üzerinde tüm pipeline'ı sırayla uygular."""
    out = utils.to_grayscale(img)

    dn_cfg = config.get("denoise", {})
    if dn_cfg.get("enabled", True):
        out = enhance.denoise(
            out,
            method=dn_cfg.get("method", "fastNlMeans"),
            h=dn_cfg.get("h", 10),
            template_window_size=dn_cfg.get("template_window_size", 7),
            search_window_size=dn_cfg.get("search_window_size", 21),
        )

    ct_cfg = config.get("contrast", {})
    if ct_cfg.get("enabled", True):
        out = enhance.enhance_contrast(
            out,
            method=ct_cfg.get("method", "clahe"),
            clip_limit=ct_cfg.get("clip_limit", 2.0),
            tile_grid_size=tuple(ct_cfg.get("tile_grid_size", [8, 8])),
        )

    dk_cfg = config.get("deskew", {})
    if dk_cfg.get("enabled", True):
        out = deskew_mod.deskew_image(
            out,
            method=dk_cfg.get("method", "hough"),
            max_angle=dk_cfg.get("max_angle", 15.0),
            angle_step=dk_cfg.get("angle_step", 0.5),
        )

    th_cfg = config.get("threshold", {})
    if th_cfg.get("enabled", True):
        out = threshold.binarize(
            out,
            method=th_cfg.get("method", "otsu"),
            adaptive_block_size=th_cfg.get("adaptive_block_size", 31),
            adaptive_C=th_cfg.get("adaptive_C", 15),
        )

    return out


def process_folder(
    input_dir: Union[str, Path], output_dir: Union[str, Path], config: dict
) -> None:
    """Bir klasördeki (alt klasörler dahil) tüm görüntüleri işleyip,
    aynı göreli dizin yapısıyla çıktı klasörüne kaydeder. XML dosyaları
    (Kraken ground truth) dokunulmadan kopyalanmaz; sadece görüntüler işlenir,
    XML'ler eşleşme için ayrı bir dosya adıyla aynı klasörde kalmalı."""
    input_dir, output_dir = Path(input_dir), Path(output_dir)
    images = utils.list_images(input_dir)
    print(f"{len(images)} görüntü bulundu, işleniyor...")

    out_format = config.get("output", {}).get("format", "png")

    for i, img_path in enumerate(images, 1):
        img = utils.load_image(img_path, grayscale=True)
        processed = process_image(img, config)

        rel_path = img_path.relative_to(input_dir).with_suffix(f".{out_format}")
        utils.save_image(processed, output_dir / rel_path)

        if i % 10 == 0 or i == len(images):
            print(f"  {i}/{len(images)} tamamlandı")

    print(f"Bitti. Çıktılar: {output_dir}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Osmanlıca belge görüntü iyileştirme pipeline'ı")
    parser.add_argument("--input", required=True, help="Girdi klasörü")
    parser.add_argument("--output", required=True, help="Çıktı klasörü")
    parser.add_argument(
        "--config", default="configs/image_enhancement.yaml", help="Config dosyası yolu"
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    process_folder(args.input, args.output, cfg)