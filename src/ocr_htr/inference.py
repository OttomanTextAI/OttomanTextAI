"""
src/ocr_htr/inference.py

Zehra'nın OCR/HTR modülü — Kraken ile fine-tune edilmiş modeli kullanarak
görüntülerden Osmanlıca (Arap harfli) metin çıkarır.

Bu dosya iki farklı ihtiyacı bir arada karşılar:
  1. Kendi başına, toplu (batch) test için (run_inference_batch, __main__ bloğu)
  2. Ekip pipeline'ının (run_pipeline.py) çağıracağı standart arayüz (run_ocr)

ÖNEMLİ: --base-dir R parametresi zorunludur. Bu olmadan Kraken çıktıyı ters
sırada üretiyor (satırın karakterleri baştan sona ters diziliyor). Bu proje
boyunca keşfedilen kritik bir düzeltme, asla kaldırılmamalı.

Varsayılan model yolları (en güncel, fine-tune edilmiş modeller):
  - Segmentasyon modeli: models/segmentation/ottoman_seg_v1_best.safetensors
    (MAKHZAN + 55 el yazması sayfayla fine-tune edilmiş, tek/çift sütun destekli)
  - OCR modeli: models/ocr_htr/ottoman_v2_best/bestOne.mlmodel
    (MAKHZAN + 55 el yazması sayfayla fine-tune edilmiş, test setinde %84.17
    karakter doğruluğu)
"""

import subprocess
import tempfile
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Varsayılan model yolları -- proje kökünden itibaren göreli.
# Modeller güncellendiğinde SADECE burayı değiştirmek yeterli olur.
# ---------------------------------------------------------------------------
DEFAULT_OCR_MODEL = "models/ocr_htr/ottoman_v2_best/bestOne.mlmodel"
DEFAULT_SEGMENTATION_MODEL = "models/segmentation/ottoman_seg_v1_best.safetensors"


# ---------------------------------------------------------------------------
# Temel (düşük seviye) fonksiyon: tek bir görüntü dosyasını işler.
# ---------------------------------------------------------------------------
def run_inference_single(
    image_path: str,
    model_path: str = DEFAULT_OCR_MODEL,
    output_path: str = None,
    segmentation_model_path: str = None,
    base_dir: str = "R",
) -> str:
    """
    Tek bir görüntü dosyası üzerinde Kraken ile OCR çalıştırır.

    Args:
        image_path: girdi görüntüsünün dosya yolu
        model_path: OCR (tanıma) modelinin yolu
        output_path: sonucun yazılacağı .txt dosyası (verilmezse geçici dosya kullanılır)
        segmentation_model_path: verilirse, genel segmentasyon yerine bu
            fine-tune edilmiş segmentasyon modeli kullanılır (önerilir)
        base_dir: metin yönü -- Osmanlıca/Arapça için "R" (right-to-left) ZORUNLU

    Returns:
        Tanınan metin (str)
    """
    cleanup_output = False
    if output_path is None:
        # Geçici bir çıktı dosyası oluştur, iş bitince temizlenecek
        fd, output_path = tempfile.mkstemp(suffix=".txt")
        os.close(fd)
        cleanup_output = True

    command = ["kraken", "-i", image_path, output_path, "segment", "-bl"]

    if segmentation_model_path:
        command += ["-i", segmentation_model_path]

    command += ["ocr", "-m", model_path, "--base-dir", base_dir]

    try:
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            print("HATA:", result.stderr)
            raise RuntimeError("Kraken inference başarısız oldu.")

        with open(output_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    finally:
        if cleanup_output and os.path.exists(output_path):
            os.remove(output_path)


# ---------------------------------------------------------------------------
# Toplu (batch) işleme -- bir klasördeki tüm görüntüleri işler.
# ---------------------------------------------------------------------------
def run_inference_batch(
    input_dir: str,
    model_path: str = DEFAULT_OCR_MODEL,
    output_dir: str = "experiments/ocr_htr/predictions",
    segmentation_model_path: str = DEFAULT_SEGMENTATION_MODEL,
) -> None:
    """
    Bir klasördeki tüm .png/.jpg görüntüleri için OCR çalıştırır,
    her biri için aynı isimde bir .txt dosyası üretir.
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_files = sorted(input_path.glob("*.png")) + sorted(input_path.glob("*.jpg"))
    print(f"{len(image_files)} görüntü işlenecek.")

    for image_file in image_files:
        out_file = output_path / f"{image_file.stem}.txt"
        try:
            text = run_inference_single(
                str(image_file),
                model_path=model_path,
                output_path=str(out_file),
                segmentation_model_path=segmentation_model_path,
            )
            print(f"{image_file.name} -> {text[:50]}...")
        except RuntimeError:
            print(f"{image_file.name} işlenemedi, atlanıyor.")


# ---------------------------------------------------------------------------
# Pipeline arayüzü -- ekip pipeline'ının (run_pipeline.py) çağıracağı fonksiyon.
# Arkadaşın bunu MOCK olarak tanımlamıştı, burada GERÇEK Kraken modeline
# bağlıyoruz. İmza (fonksiyon adı, parametre, dönüş tipi) birebir korunmuştur,
# böylece pipeline'ın geri kalanında hiçbir değişiklik gerekmez.
# ---------------------------------------------------------------------------
def run_ocr(
    image_bytes: bytes,
    model_path: str = DEFAULT_OCR_MODEL,
    segmentation_model_path: str = DEFAULT_SEGMENTATION_MODEL,
) -> str:
    """
    Girdi : iyileştirilmiş görüntü (bytes) -- Sinem'in modülünden gelen çıktı
    Çıktı : Osmanlıca (Arap harfli) ham metin (str)

    Bu, artık MOCK değil -- gerçek, fine-tune edilmiş Kraken modelini
    kullanıyor. Görüntü byte verisini geçici bir dosyaya yazıp,
    run_inference_single() ile aynı altyapıyı kullanarak işler.
    """
    # image_bytes'ı geçici bir görüntü dosyasına yaz (Kraken dosya yolu bekliyor)
    fd, temp_image_path = tempfile.mkstemp(suffix=".png")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(image_bytes)

        text = run_inference_single(
            temp_image_path,
            model_path=model_path,
            segmentation_model_path=segmentation_model_path,
        )
        return text
    except RuntimeError as e:
        print(f"[HATA] run_ocr() başarısız oldu: {e}")
        return ""
    finally:
        if os.path.exists(temp_image_path):
            os.remove(temp_image_path)


# ---------------------------------------------------------------------------
# Bağımsız çalıştırma -- kendi başına test için (arkadaşının pipeline'ı
# olmadan, doğrudan terminalden deneme yapmak istediğinde kullanılır)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    run_inference_batch(
        input_dir="data/processed/ocr_htr/test",
        model_path=DEFAULT_OCR_MODEL,
        output_dir="experiments/ocr_htr/predictions",
        segmentation_model_path=DEFAULT_SEGMENTATION_MODEL,
    )