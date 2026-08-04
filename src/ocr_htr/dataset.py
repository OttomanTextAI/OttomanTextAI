"""
src/ocr_htr/dataset.py

MAKHZAN veri seti ALTO XML formatında geliyor (eScriptorium çıktısı).
Her belge için: <belge_id>.png/.tiff/.jpg (görüntü) + <belge_id>.xml (ALTO transkripsiyon)

Dil bilgisi, XML içindeki <Page LANG="..."> özniteliğinde tutuluyor.
Osmanlı Türkçesi için ISO 639-2 kodu: "ota"

Bu script:
1. data/raw/makhzan/ altındaki tüm .xml dosyalarını tarar
2. Her birinin LANG="ota" olup olmadığını kontrol eder
3. Osmanlıca olanların görüntü + xml çiftini train/val/test klasörlerine kopyalar
4. Kraken'in `ketos compile -f alto` komutuyla okuyabileceği şekilde hazırlar
   (bu script kendisi .arrow dosyası ÜRETMEZ, sadece doğru dosyaları filtreleyip
   ayırır -- .arrow oluşturma işini train.py / ketos compile yapacak)
"""

import shutil
import random
from pathlib import Path
from xml.etree import ElementTree as ET

# ALTO XML namespace (dosyanın başındaki xmlns'e göre)
ALTO_NS = {"alto": "http://www.loc.gov/standards/alto/ns-v4#"}

# Osmanlı Türkçesi için ISO 639-2 kodu
TARGET_LANG_CODES = {"ota"}  # gerekirse buraya varyasyon ekleyebiliriz (örn. "ota-Arab")

# Görüntü dosyası uzantıları (MAKHZAN'da karışık: png, jpg, tif/tiff)
IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".tif", ".tiff"]


def get_page_language(xml_path: Path) -> str | None:
    """
    ALTO XML dosyasının <Page> etiketindeki LANG özniteliğini okur.
    """
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        page = root.find(".//alto:Page", ALTO_NS)
        if page is not None:
            return page.get("LANG")
    except ET.ParseError:
        print(f"Uyarı: {xml_path} parse edilemedi, atlanıyor.")
    return None


def find_matching_image(xml_path: Path) -> Path | None:
    """
    Bir .xml dosyasına karşılık gelen görüntü dosyasını bulur.
    Örn: 101_14112.xml -> 101_14112.png / .tiff / .jpg (hangisi varsa)
    """
    base_name = xml_path.stem  # "101_14112"
    for ext in IMAGE_EXTENSIONS:
        candidate = xml_path.parent / f"{base_name}{ext}"
        if candidate.exists():
            return candidate
    return None


def scan_and_filter_ottoman(raw_dir: Path) -> list[tuple[Path, Path]]:
    """
    raw_dir altındaki tüm xml dosyalarını tarar, Osmanlı Türkçesi
    (LANG="ota") olanları bulur.

    Returns:
        (görüntü_yolu, xml_yolu) çiftlerinden oluşan liste
    """
    all_xml_files = [
        p for p in raw_dir.glob("*.xml") if p.name.upper() != "METS.XML"
    ]
    print(f"Toplam {len(all_xml_files)} xml dosyası bulundu.")

    matched_pairs = []
    lang_counts: dict[str, int] = {}

    for xml_path in all_xml_files:
        lang = get_page_language(xml_path)
        lang_counts[lang or "UNKNOWN"] = lang_counts.get(lang or "UNKNOWN", 0) + 1

        if lang in TARGET_LANG_CODES:
            image_path = find_matching_image(xml_path)
            if image_path is not None:
                matched_pairs.append((image_path, xml_path))
            else:
                print(f"Uyarı: {xml_path.name} için eşleşen görüntü bulunamadı.")

    print("\nDil dağılımı (tüm belgeler):")
    for lang, count in sorted(lang_counts.items(), key=lambda x: -x[1]):
        print(f"  {lang}: {count}")

    print(f"\nOsmanlı Türkçesi (LANG='ota') olarak bulunan belge sayısı: {len(matched_pairs)}")
    return matched_pairs


def split_train_val_test(
    pairs: list[tuple[Path, Path]],
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
) -> tuple[list, list, list]:
    random.seed(42)
    shuffled = pairs.copy()
    random.shuffle(shuffled)

    n = len(shuffled)
    train_end = int(n * train_ratio)
    val_end = train_end + int(n * val_ratio)

    train = shuffled[:train_end]
    val = shuffled[train_end:val_end]
    test = shuffled[val_end:]

    print(f"Bölünme: {len(train)} train, {len(val)} val, {len(test)} test")
    return train, val, test


def copy_pairs_to_split(pairs: list[tuple[Path, Path]], output_dir: Path, split_name: str) -> None:
    target_dir = output_dir / split_name
    target_dir.mkdir(parents=True, exist_ok=True)

    for image_path, xml_path in pairs:
        shutil.copy(image_path, target_dir / image_path.name)
        shutil.copy(xml_path, target_dir / xml_path.name)

    print(f"{len(pairs)} çift '{target_dir}' klasörüne kopyalandı.")


if __name__ == "__main__":
    RAW_DIR = Path("data/raw/makhzan")
    OUTPUT_DIR = Path("data/processed/ocr_htr")

    ottoman_pairs = scan_and_filter_ottoman(RAW_DIR)

    if not ottoman_pairs:
        print("\nUYARI: Hiç 'ota' etiketli belge bulunamadı!")
        print("Yukarıdaki 'Dil dağılımı' listesine bakıp gerçek dil kodunu kontrol et,")
        print("TARGET_LANG_CODES setini ona göre güncellemen gerekebilir.")
    else:
        train, val, test = split_train_val_test(ottoman_pairs)
        copy_pairs_to_split(train, OUTPUT_DIR, "train")
        copy_pairs_to_split(val, OUTPUT_DIR, "val")
        copy_pairs_to_split(test, OUTPUT_DIR, "test")