"""
src/ocr_htr/align_lines_v2.py

Geliştirilmiş versiyon:
1. Her sayfa için segmentasyon yapar (Kraken ile)
2. Tespit edilen her satırı NUMARALANDIRIP görüntü üzerine çizer,
   böylece hangi satırın nerede olduğunu gözünle görebilirsin
3. Satır sayısı uyuşmuyorsa, seni "hangi numaraları silmen gerektiği"
   konusunda yönlendirir
4. Basit bir komutla ("bu sayfadan şu numaralı satırları sil") XML'den
   ilgili satırları kaldırmanı sağlar
5. Metinleri XML'e kolayca yerleştirmen için düz bir şablon üretir

KULLANIM:
    1. python src/ocr_htr/align_lines_v2.py segment
       -> Tüm sayfaları segmentler, numaralı görselleri üretir
          (data/processed/ocr_htr/manual_review/ altında *_preview.png)

    2. Görselleri aç, orijinal görüntüyle karşılaştır, hangi numaraların
       fazla/yanlış olduğunu not al

    3. python src/ocr_htr/align_lines_v2.py remove SAYFA_ADI 3 7 12
       -> "SAYFA_ADI" sayfasından 3, 7, 12 numaralı satırları XML'den siler

    4. python src/ocr_htr/align_lines_v2.py fill SAYFA_ADI
       -> Kalan satır sayısı kadar boş şablon satırı ekrana yazdırır,
          senin .txt dosyandan sırayla kopyalayıp XML'e elle yapıştırman
          için rehber olur (satır satır hangi metni nereye koyacağını gösterir)
"""

import sys
import subprocess
import shutil
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw, ImageFont

ALTO_NS = "http://www.loc.gov/standards/alto/ns-v4#"
ET.register_namespace("", ALTO_NS)

RAW_DIR = Path("data/raw/manual_hw")
OUTPUT_DIR = Path("data/processed/ocr_htr/manual_review")


def segment_page(image_path: Path, output_xml_path: Path) -> bool:
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


def get_baseline_points(tl_elem, ns) -> list[tuple[float, float]]:
    """
    TextLine elementinden baseline koordinatlarını çıkarır.
    Gerçek format: "x1 y1 x2 y2 x3 y3 ..." (virgülsüz, boşlukla ayrılmış sayılar)
    """
    baseline_str = tl_elem.get("BASELINE", "")
    numbers = baseline_str.split()
    points = []
    for i in range(0, len(numbers) - 1, 2):
        try:
            x = float(numbers[i])
            y = float(numbers[i + 1])
            points.append((x, y))
        except ValueError:
            continue
    return points


def draw_numbered_preview(image_path: Path, xml_path: Path, output_path: Path) -> int:
    """
    Segmentlenen satırları görüntü üzerine numaralandırarak çizer.
    Returns: tespit edilen satır sayısı
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"alto": ALTO_NS}
    text_lines = root.findall(".//alto:TextLine", ns)

    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("arial.ttf", 40)
    except Exception:
        font = ImageFont.load_default()

    for idx, tl in enumerate(text_lines, start=1):
        points = get_baseline_points(tl, ns)
        if len(points) >= 2:
            draw.line(points, fill=(255, 0, 0), width=4)
            x, y = points[0]
            # Numarayı biraz yukarı, sarı arka planla yaz (görünürlük için)
            text_pos = (x, y - 45)
            bbox = draw.textbbox(text_pos, str(idx), font=font)
            draw.rectangle(bbox, fill=(255, 255, 0))
            draw.text(text_pos, str(idx), fill=(0, 0, 0), font=font)

    img.save(output_path)
    return len(text_lines)


def cmd_segment() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image_files = sorted(RAW_DIR.glob("*.png")) + sorted(RAW_DIR.glob("*.jpg"))

    for image_path in image_files:
        target_image = OUTPUT_DIR / image_path.name
        target_xml = OUTPUT_DIR / (image_path.stem + ".xml")
        preview_path = OUTPUT_DIR / (image_path.stem + "_preview.png")

        shutil.copy(image_path, target_image)

        if not segment_page(target_image, target_xml):
            continue

        count = draw_numbered_preview(target_image, target_xml, preview_path)

        txt_path = image_path.with_suffix(".txt")
        expected = 0
        if txt_path.exists():
            with open(txt_path, "r", encoding="utf-8") as f:
                expected = len([l for l in f if l.strip()])

        status = "OK" if count == expected else f"FARK VAR (tespit={count}, metin={expected})"
        print(f"{image_path.stem}: {status} -> önizleme: {preview_path}")

    print(f"\nTüm önizlemeler '{OUTPUT_DIR}' klasöründe. *_preview.png dosyalarını açıp kontrol et.")


def cmd_remove(page_name: str, line_numbers: list[int]) -> None:
    """Belirtilen sayfadan, numaralı satırları XML'den siler."""
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    if not xml_path.exists():
        print(f"HATA: {xml_path} bulunamadı.")
        return

    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"alto": ALTO_NS}
    text_lines = root.findall(".//alto:TextLine", ns)

    # 1-indexli numaraları, büyükten küçüğe silelim (indexler kaymasın diye)
    to_remove = sorted(set(line_numbers), reverse=True)
    for num in to_remove:
        idx = num - 1
        if 0 <= idx < len(text_lines):
            for tb in root.findall(".//alto:TextBlock", ns):
                if text_lines[idx] in tb.findall("alto:TextLine", ns):
                    tb.remove(text_lines[idx])
                    print(f"Satır {num} silindi.")
                    break

    tree.write(xml_path, encoding="UTF-8", xml_declaration=True)

    # Yeni satır sayısını göster
    tree2 = ET.parse(xml_path)
    remaining = len(tree2.getroot().findall(".//alto:TextLine", ns))
    print(f"Kalan satır sayısı: {remaining}")

    # Preview'ı güncelle
    image_path = OUTPUT_DIR / (page_name + ".png")
    if not image_path.exists():
        image_path = OUTPUT_DIR / (page_name + ".jpg")
    preview_path = OUTPUT_DIR / (page_name + "_preview.png")
    draw_numbered_preview(image_path, xml_path, preview_path)
    print(f"Önizleme güncellendi: {preview_path}")


def cmd_fill(page_name: str) -> None:
    """Kalan satır sayısını gösterip, txt dosyasındaki metinle karşılaştırır."""
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    txt_path = RAW_DIR / (page_name + ".txt")

    tree = ET.parse(xml_path)
    ns = {"alto": ALTO_NS}
    remaining = len(tree.getroot().findall(".//alto:TextLine", ns))

    with open(txt_path, "r", encoding="utf-8") as f:
        text_lines = [l.strip() for l in f if l.strip()]

    print(f"XML'deki satır sayısı: {remaining}")
    print(f"TXT'deki satır sayısı: {len(text_lines)}")

    if remaining == len(text_lines):
        print("\n✅ Sayılar eşleşiyor! Şimdi otomatik olarak metni yerleştiriyorum...")
        root = tree.getroot()
        tl_elements = root.findall(".//alto:TextLine", ns)
        for tl_elem, text in zip(tl_elements, text_lines):
            string_elem = tl_elem.find("alto:String", ns)
            if string_elem is None:
                string_elem = ET.SubElement(tl_elem, f"{{{ALTO_NS}}}String")
            string_elem.set("CONTENT", text)
        tree.write(xml_path, encoding="UTF-8", xml_declaration=True)
        print(f"Tamamlandı: {xml_path} artık eğitime hazır.")
    else:
        print("\n⚠️ Sayılar hâlâ uyuşmuyor. Önce 'remove' komutuyla fazla satırları temizle,")
        print("   ya da eksik satır varsa bana haber ver, elle ekleme yöntemini konuşalım.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python align_lines_v2.py [segment|remove|fill] ...")
        sys.exit(1)

    action = sys.argv[1]

    if action == "segment":
        cmd_segment()
    elif action == "remove":
        page = sys.argv[2]
        nums = [int(n) for n in sys.argv[3:]]
        cmd_remove(page, nums)
    elif action == "fill":
        page = sys.argv[2]
        cmd_fill(page)
    else:
        print(f"Bilinmeyen komut: {action}")