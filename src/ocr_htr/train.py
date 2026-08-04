"""
src/ocr_htr/train.py
Kraken fine-tuning'ini başlatan wrapper script.

RESUME DESTEĞİ:
configs/ocr_htr.yaml içinde `resume_from` alanı varsa (ve dolu ise),
eğitim o checkpoint'ten devam eder (sıfırdan başlamaz).
Boş/yoksa, `base_model`den sıfırdan (fine-tuning olarak) başlar.
"""

import subprocess
import yaml
from pathlib import Path


def load_config(config_path: str = "configs/ocr_htr.yaml") -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_ketos_train_command(config: dict) -> list[str]:
    train_glob = str(Path(config["train_data_dir"]) / "*.xml")

    resume_from = config.get("resume_from")

    command = [
        "ketos",
        "--device", config.get("device", "cpu"),
        "train",
    ]

    if resume_from:
        # Devam modu: checkpoint'ten kaldığı yerden devam eder
        command += ["--resume", resume_from]
        print(f"RESUME MODU: '{resume_from}' checkpoint'inden devam edilecek.")
    else:
        # İlk çalıştırma: temel modelden fine-tuning başlatır
        command += ["-i", config["base_model"], "--resize", "union"]
        print("İLK ÇALIŞTIRMA: base_model'den fine-tuning başlatılıyor.")

    command += [
        "-o", config["output_model_prefix"],
        "--epochs", str(config.get("epochs", 5)),
        "-f", "alto",
        train_glob,
    ]
    return command


def run_training(config_path: str = "configs/ocr_htr.yaml") -> None:
    config = load_config(config_path)
    command = build_ketos_train_command(config)

    print("Çalıştırılacak komut:")
    print(" ".join(command))
    print("---- ketos train çıktısı aşağıda canlı akacak ----\n")

    result = subprocess.run(command)

    if result.returncode != 0:
        raise RuntimeError(f"ketos train başarısız oldu (exit code {result.returncode}).")

    print(f"\nEğitim tamamlandı. Model çıktısı: {config['output_model_prefix']}")


if __name__ == "__main__":
    run_training()