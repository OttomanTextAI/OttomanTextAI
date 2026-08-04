"""
src/ocr_htr/inference.py
Fine-tune edilmiş Kraken modeliyle yeni görüntüler üzerinde OCR/HTR tahmini yapar.
"""

import subprocess
from pathlib import Path


def run_inference_single(image_path: str, model_path: str, output_path: str) -> str:
    command = [
        "kraken",
        "-i", image_path, output_path,
        "segment", "-bl", "ocr",
        "-m", model_path,
    ]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print("HATA:", result.stderr)
        raise RuntimeError("Kraken inference başarısız oldu.")

    with open(output_path, "r", encoding="utf-8") as f:
        return f.read().strip()


def run_inference_batch(input_dir: str, model_path: str, output_dir: str) -> None:
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_files = sorted(input_path.glob("*.png"))
    print(f"{len(image_files)} görüntü işlenecek.")

    for image_file in image_files:
        out_file = output_path / f"{image_file.stem}.txt"
        try:
            text = run_inference_single(str(image_file), model_path, str(out_file))
            print(f"{image_file.name} -> {text[:50]}...")
        except RuntimeError:
            print(f"{image_file.name} işlenemedi, atlanıyor.")


if __name__ == "__main__":
    run_inference_batch(
        input_dir="data/processed/ocr_htr/test",
        model_path="models/ocr_htr/ottoman_v1_best.mlmodel",
        output_dir="experiments/ocr_htr/predictions",
    )