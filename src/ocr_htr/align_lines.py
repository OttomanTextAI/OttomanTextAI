"""
src/ocr_htr/align_lines.py

KAPSAMLI VERSİYON — özellikler:
1. Segmentasyon + numaralı görsel önizleme
2. Satır ID'leri, satır numarasıyla eşleşir (line_01, line_02, ...) -- her
   işlemden sonra otomatik yeniden numaralandırılır, karışıklık olmaz
3. "reorder" komutu: satırları ortalama Y konumuna göre otomatik sıralar
   (eğik/yamuk satırlarda okuma sırası karışmasını büyük ölçüde düzeltir)
4. "remove" komutu: fazla/hatalı satırları siler
5. "swap" komutu: iki satırın sırasını manuel değiştirir
6. "merge" komutu: ikiye bölünmüş bir satırı tek satır haline getirir
7. "fill" komutu: sayılar eşleşince .txt'deki metni otomatik yerleştirir

KULLANIM SIRASI (önerilen):
    python align_lines.py segment
    python align_lines.py reorder SAYFA_ADI      <- önce bunu dene, çoğu
                                                     yamukluk sorununu çözebilir
    (önizlemeye bak, hâlâ sıra bozuksa:)
    python align_lines.py swap SAYFA_ADI NUM1 NUM2
    (ikiye bölünmüş bir satır varsa:)
    python align_lines.py merge SAYFA_ADI NUM1 NUM2
    (fazla/hatalı satır varsa:)
    python align_lines.py remove SAYFA_ADI NUM1 NUM2 ...
    (sayılar eşleşince:)
    python align_lines.py fill SAYFA_ADI
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


# ---------- Yardımcı fonksiyonlar ----------

def get_baseline_points(tl_elem) -> list[tuple[float, float]]:
    baseline_str = tl_elem.get("BASELINE", "")
    numbers = baseline_str.split()
    points = []
    for i in range(0, len(numbers) - 1, 2):
        try:
            points.append((float(numbers[i]), float(numbers[i + 1])))
        except ValueError:
            continue
    return points


def avg_y(tl_elem) -> float:
    points = get_baseline_points(tl_elem)
    if not points:
        return float(tl_elem.get("VPOS", 0))
    return sum(p[1] for p in points) / len(points)


def reassign_ids(root, ns) -> None:
    """Tüm TextLine'ları mevcut sırasına göre 'line_01', 'line_02'... diye yeniden ID'ler."""
    all_lines = root.findall(".//alto:TextLine", ns)
    for idx, tl in enumerate(all_lines, start=1):
        tl.set("ID", f"line_{idx:02d}")


def save_xml(tree, xml_path: Path, root, ns) -> None:
    reassign_ids(root, ns)
    tree.write(xml_path, encoding="UTF-8", xml_declaration=True)


# ---------- Segmentasyon ----------

def segment_page(image_path: Path, output_xml_path: Path) -> bool:
    command = ["kraken", "-a", "-i", str(image_path), str(output_xml_path), "segment", "-bl"]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"HATA (segmentasyon): {image_path.name}")
        print(result.stderr)
        return False
    return True


def draw_numbered_preview(image_path: Path, xml_path: Path, output_path: Path) -> int:
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
        points = get_baseline_points(tl)
        if len(points) >= 2:
            draw.line(points, fill=(255, 0, 0), width=4)
            x, y = points[0]
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

        # ID'leri baştan düzenle
        tree = ET.parse(target_xml)
        root = tree.getroot()
        ns = {"alto": ALTO_NS}
        save_xml(tree, target_xml, root, ns)

        count = draw_numbered_preview(target_image, target_xml, preview_path)

        txt_path = image_path.with_suffix(".txt")
        expected = 0
        if txt_path.exists():
            with open(txt_path, "r", encoding="utf-8") as f:
                expected = len([l for l in f if l.strip()])

        status = "OK" if count == expected else f"FARK VAR (tespit={count}, metin={expected})"
        print(f"{image_path.stem}: {status} -> önizleme: {preview_path}")

    print(f"\nTüm önizlemeler '{OUTPUT_DIR}' klasöründe.")


# ---------- Düzeltme komutları ----------

def _load(page_name: str):
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"alto": ALTO_NS}
    return xml_path, tree, root, ns


def _refresh_preview(page_name: str, xml_path: Path) -> None:
    image_path = OUTPUT_DIR / (page_name + ".png")
    if not image_path.exists():
        image_path = OUTPUT_DIR / (page_name + ".jpg")
    preview_path = OUTPUT_DIR / (page_name + "_preview.png")
    count = draw_numbered_preview(image_path, xml_path, preview_path)
    print(f"Önizleme güncellendi: {preview_path} (toplam {count} satır)")


def cmd_reorder(page_name: str) -> None:
    """Satırları ortalama Y konumuna göre otomatik sıralar (yamuk satır düzeltmesi)."""
    xml_path, tree, root, ns = _load(page_name)

    for tb in root.findall(".//alto:TextBlock", ns):
        lines = tb.findall("alto:TextLine", ns)
        if len(lines) < 2:
            continue
        sorted_lines = sorted(lines, key=avg_y)

        # Mevcut sırayı sil, sıralanmış hâliyle tekrar ekle
        for l in lines:
            tb.remove(l)
        for l in sorted_lines:
            tb.append(l)

    save_xml(tree, xml_path, root, ns)
    print("Satırlar Y konumuna göre yeniden sıralandı.")
    _refresh_preview(page_name, xml_path)


def cmd_remove(page_name: str, line_numbers: list[int]) -> None:
    xml_path, tree, root, ns = _load(page_name)
    text_lines = root.findall(".//alto:TextLine", ns)

    to_remove = sorted(set(line_numbers), reverse=True)
    for num in to_remove:
        idx = num - 1
        if 0 <= idx < len(text_lines):
            for tb in root.findall(".//alto:TextBlock", ns):
                if text_lines[idx] in tb.findall("alto:TextLine", ns):
                    tb.remove(text_lines[idx])
                    print(f"Satır {num} silindi.")
                    break

    save_xml(tree, xml_path, root, ns)
    remaining = len(root.findall(".//alto:TextLine", ns))
    print(f"Kalan satır sayısı: {remaining}")
    _refresh_preview(page_name, xml_path)


def cmd_swap(page_name: str, num1: int, num2: int) -> None:
    xml_path, tree, root, ns = _load(page_name)
    all_lines = root.findall(".//alto:TextLine", ns)
    idx1, idx2 = num1 - 1, num2 - 1
    if not (0 <= idx1 < len(all_lines)) or not (0 <= idx2 < len(all_lines)):
        print("HATA: Geçersiz satır numarası.")
        return

    line1, line2 = all_lines[idx1], all_lines[idx2]

    def swap_attribs_and_content(a, b):
        a_attrib, b_attrib = dict(a.attrib), dict(b.attrib)
        a_children, b_children = list(a), list(b)
        a.attrib.clear(); a.attrib.update(b_attrib)
        b.attrib.clear(); b.attrib.update(a_attrib)
        for c in list(a): a.remove(c)
        for c in list(b): b.remove(c)
        for c in b_children: a.append(c)
        for c in a_children: b.append(c)

    swap_attribs_and_content(line1, line2)
    save_xml(tree, xml_path, root, ns)
    print(f"{num1} ve {num2} numaralı satırlar yer değiştirdi.")
    _refresh_preview(page_name, xml_path)


def cmd_merge(page_name: str, num1: int, num2: int) -> None:
    """İkiye bölünmüş bir satırı (num1 ve num2) birleştirir, num2'yi siler."""
    xml_path, tree, root, ns = _load(page_name)
    all_lines = root.findall(".//alto:TextLine", ns)
    idx1, idx2 = num1 - 1, num2 - 1
    if not (0 <= idx1 < len(all_lines)) or not (0 <= idx2 < len(all_lines)):
        print("HATA: Geçersiz satır numarası.")
        return

    line1, line2 = all_lines[idx1], all_lines[idx2]

    # Baseline noktalarını birleştir (soldan sağa sırala)
    pts1 = get_baseline_points(line1)
    pts2 = get_baseline_points(line2)
    merged_pts = sorted(pts1 + pts2, key=lambda p: p[0])
    baseline_str = " ".join(f"{int(x)} {int(y)}" for x, y in merged_pts)
    line1.set("BASELINE", baseline_str)

    # HPOS/WIDTH gibi kutu bilgilerini de genişlet
    h1, v1 = float(line1.get("HPOS", 0)), float(line1.get("VPOS", 0))
    w1, ht1 = float(line1.get("WIDTH", 0)), float(line1.get("HEIGHT", 0))
    h2, v2 = float(line2.get("HPOS", 0)), float(line2.get("VPOS", 0))
    w2, ht2 = float(line2.get("WIDTH", 0)), float(line2.get("HEIGHT", 0))

    new_hpos = min(h1, h2)
    new_vpos = min(v1, v2)
    new_right = max(h1 + w1, h2 + w2)
    new_bottom = max(v1 + ht1, v2 + ht2)
    line1.set("HPOS", str(int(new_hpos)))
    line1.set("VPOS", str(int(new_vpos)))
    line1.set("WIDTH", str(int(new_right - new_hpos)))
    line1.set("HEIGHT", str(int(new_bottom - new_vpos)))

    # line2'yi kaldır
    for tb in root.findall(".//alto:TextBlock", ns):
        if line2 in tb.findall("alto:TextLine", ns):
            tb.remove(line2)
            break

    save_xml(tree, xml_path, root, ns)
    print(f"Satır {num1} ve {num2} birleştirildi (artık tek satır).")
    remaining = len(root.findall(".//alto:TextLine", ns))
    print(f"Kalan satır sayısı: {remaining}")
    _refresh_preview(page_name, xml_path)


def cmd_fill(page_name: str) -> None:
    xml_path, tree, root, ns = _load(page_name)
    txt_path = RAW_DIR / (page_name + ".txt")

    remaining = len(root.findall(".//alto:TextLine", ns))
    with open(txt_path, "r", encoding="utf-8") as f:
        text_lines = [l.strip() for l in f if l.strip()]

    print(f"XML'deki satır sayısı: {remaining}")
    print(f"TXT'deki satır sayısı: {len(text_lines)}")

    if remaining == len(text_lines):
        print("\n✅ Sayılar eşleşiyor! Metni yerleştiriyorum...")
        tl_elements = root.findall(".//alto:TextLine", ns)
        for tl_elem, text in zip(tl_elements, text_lines):
            string_elem = tl_elem.find("alto:String", ns)
            if string_elem is None:
                string_elem = ET.SubElement(tl_elem, f"{{{ALTO_NS}}}String")
            string_elem.set("CONTENT", text)
        save_xml(tree, xml_path, root, ns)
        print(f"Tamamlandı: {xml_path} artık eğitime hazır.")
    else:
        print("\n⚠️ Sayılar hâlâ uyuşmuyor. 'reorder', 'swap', 'merge' veya 'remove' ile devam et.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python align_lines.py [segment|reorder|remove|swap|merge|fill] ...")
        sys.exit(1)

    action = sys.argv[1]

    if action == "segment":
        cmd_segment()
    elif action == "reorder":
        cmd_reorder(sys.argv[2])
    elif action == "remove":
        page = sys.argv[2]
        nums = [int(n) for n in sys.argv[3:]]
        cmd_remove(page, nums)
    elif action == "swap":
        cmd_swap(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    elif action == "merge":
        cmd_merge(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    elif action == "fill":
        cmd_fill(sys.argv[2])
    else:
        print(f"Bilinmeyen komut: {action}")