"""
src/ocr_htr/align_lines.py

Tam sayfa görüntü + tam sayfa blok metin (.txt) çiftlerini,
Kraken'in kendi segmentasyon özelliğini kullanarak satır-koordinat
eşleşmeli ALTO XML formatına çevirir.

Kullanım:
    1. Görüntü + .txt çiftlerini bir klasöre koy (örn. data/raw/manual_hw/)
       - sayfa1.png, sayfa1.txt
       - sayfa2.png, sayfa2.txt
       gibi. .txt dosyasında her satır, görüntüdeki bir satıra karşılık
       gelmeli (üstten alta doğru sırayla).

    2. Bu script'i çalıştır:
       python src/ocr_htr/align_lines.py

    3. Çıktı: data/processed/ocr_htr/manual_train/ altında,
       eğitime hazır ALTO XML + görüntü çiftleri oluşur.

    4. Satır sayısı uyuşmayan sayfalar ayrıca raporlanır -- bunları
       elle kontrol etmen / düzeltmen gerekir.
"""

import subprocess
import shutil
from pathlib import Path
from xml.etree import ElementTree as ET

ALTO_NS = "http://www.loc.gov/standards/alto/ns-v4#"
ET.register_namespace("", ALTO_NS)


def segment_page(image_path: Path, output_xml_path: Path, model_path: str) -> bool:
    """
    Kraken ile sadece segmentasyon (satır tespiti) yapar, OCR yapmaz.
    """
    command = [
        "kraken", "-a", "-i", str(image_path), str(output_xml_path),
        "segment", "-bl",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"HATA (segmentasyon): {image_path.name}")
        print(result.stderr)
        return False
    return True


def inject_text_into_alto(xml_path: Path, text_lines: list[str]) -> bool:
    """
    Segmentasyon sonucu üretilen (boş) ALTO XML'e, sırayla metin satırlarını
    yerleştirir. Satır sayısı uyuşmuyorsa False döner.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()

    ns = {"alto": ALTO_NS}
    text_line_elements = root.findall(".//alto:TextLine", ns)

    if len(text_line_elements) != len(text_lines):
        print(
            f"UYARI: {xml_path.name} -- tespit edilen satır sayısı "
            f"({len(text_line_elements)}) ile metin satır sayısı "
            f"({len(text_lines)}) uyuşmuyor. Bu sayfa ATLANDI, elle kontrol et."
        )
        return False

    for tl_elem, text in zip(text_line_elements, text_lines):
        # Her TextLine içindeki String elementine CONTENT olarak metni yaz.
        # Yoksa yeni bir String elementi oluştur.
        string_elem = tl_elem.find("alto:String", ns)
        if string_elem is None:
            string_elem = ET.SubElement(tl_elem, f"{{{ALTO_NS}}}String")
        string_elem.set("CONTENT", text)

    tree.write(xml_path, encoding="UTF-8", xml_declaration=True)
    return True


def process_folder(
    input_dir: Path,
    output_dir: Path,
    model_path: str,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    image_files = sorted(input_dir.glob("*.png")) + sorted(input_dir.glob("*.jpg"))
    success_count = 0
    fail_count = 0

    for image_path in image_files:
        txt_path = image_path.with_suffix(".txt")
        if not txt_path.exists():
            print(f"Atlanıyor (txt yok): {image_path.name}")
            continue

        with open(txt_path, "r", encoding="utf-8") as f:
            # Boş satırları at, sadece gerçek metin satırlarını al
            text_lines = [line.strip() for line in f if line.strip()]

        target_image = output_dir / image_path.name
        target_xml = output_dir / (image_path.stem + ".xml")

        shutil.copy(image_path, target_image)

        if not segment_page(target_image, target_xml, model_path):
            fail_count += 1
            continue

        if inject_text_into_alto(target_xml, text_lines):
            success_count += 1
            print(f"OK: {image_path.name} ({len(text_lines)} satır eşleşti)")
        else:
            fail_count += 1
            # Başarısız olan XML/görüntüyü klasörden kaldıralım, karışmasın
            target_xml.unlink(missing_ok=True)
            target_image.unlink(missing_ok=True)

    print(f"\nToplam: {success_count} sayfa başarıyla hazırlandı, {fail_count} sayfa atlandı/hatalı.")


if __name__ == "__main__":
    INPUT_DIR = Path("data/raw/manual_hw")  # senin 31 sayfanın olduğu klasör
    OUTPUT_DIR = Path("data/processed/ocr_htr/manual_train")
    MODEL_PATH = "models/ocr_htr/ottoman_v1_kaggle/ottoman_v1_best.safetensors"

    process_folder(INPUT_DIR, OUTPUT_DIR, MODEL_PATH)