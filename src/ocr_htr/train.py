"""
src/ocr_htr/train.py
Kraken fine-tuning'ini başlatan wrapper script.

Kraken 7.0 değişiklikleri:
- --device artık `ketos` komutunun GLOBAL seçeneği (train'den önce gelir)
- Verimiz ALTO XML formatında olduğu için -f alto kullanıyoruz,
  ve glob olarak .xml dosyalarını veriyoruz (Kraken içindeki koordinatlardan
  satırları kendisi kırpıyor)
"""

import subprocess
import yaml
from pathlib import Path


def load_config(config_path: str = "configs/ocr_htr.yaml") -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_ketos_train_command(config: dict) -> list[str]:
    train_glob = str(Path(config["train_data_dir"]) / "*.xml")

    command = [
        "ketos",
        "--device", config.get("device", "cpu"),
        "train",
        "-i", config["base_model"],
        "--resize", "union",
        "-o", config["output_model_prefix"],
        "--epochs", str(config.get("epochs", 50)),
        "-f", "alto",
        train_glob,
    ]
    return command


def run_training(config_path: str = "configs/ocr_htr.yaml") -> None:
    config = load_config(config_path)
    command = build_ketos_train_command(config)

    print("Çalıştırılacak komut:")
    print(" ".join(command))

    result = subprocess.run(command, capture_output=True, text=True)

    print(result.stdout)
    if result.returncode != 0:
        print("HATA:")
        print(result.stderr)
        raise RuntimeError("ketos train başarısız oldu, yukarıdaki hata mesajına bak.")

    print(f"Eğitim tamamlandı. Model çıktısı: {config['output_model_prefix']}")


if __name__ == "__main__":
    run_training()