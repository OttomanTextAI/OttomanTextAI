"""
src/ocr_htr/align_lines.py

KAPSAMLI VERSİYON — özellikler:
1. Segmentasyon + numaralı, bölge-renkli görsel önizleme
2. Satır ID'leri, satır numarasıyla eşleşir (line_01, line_02, ...) -- her
   işlemden sonra otomatik yeniden numaralandırılır, karışıklık olmaz
3. "reorder" komutu: satırları ortalama Y konumuna göre otomatik sıralar
   (eğik/yamuk satırlarda okuma sırası karışmasını büyük ölçüde düzeltir)
4. "remove" komutu: fazla/hatalı satırları siler
5. "swap" komutu: iki satırın sırasını manuel değiştirir
6. "merge" komutu: ikiye bölünmüş bir satırı tek satır haline getirir
7. "fill" komutu: sayılar eşleşince .txt'deki metni otomatik yerleştirir
8. "region" komutu: seçili satırları isimlendirilmiş bir bölgeye (sütuna) taşır
9. "region-order" komutu: bölgelerin okuma sırasını (hangi sütun önce
   okunacak) ayarlar -- çok sütunlu sayfalar için kritik
10. "regions" komutu: sayfadaki mevcut bölgeleri ve satır sayılarını listeler
11. "suggest" komutu: sayfadaki muhtemel sorunları (kısa satır, bölünmüş
    satır, çoklu sütun) TEK RAPORDA özetler -- hiçbir şeyi değiştirmez
12. "merge-suggest" komutu: muhtemel bölünmüş satır çiftlerini önerir
    (sen onaylayıp merge ile uygularsın)
13. "region-suggest" komutu: X koordinatlarına bakarak olası sütunları önerir
14. "region-auto" komutu: region-suggest'in bulduğu öneriyi otomatik uygular
15. "disable"/"restore" komutları: satırı KALICI SİLMEDEN pasif yapar/geri
    getirir -- remove'un daha güvenli alternatifi

ÖNERİLEN YENİ İŞ AKIŞI (hızlı, güvenli):
    python align_lines.py segment
    python align_lines.py suggest SAYFA_ADI
        -> raporu oku, ne yapman gerektiğini gör
    python align_lines.py region-auto SAYFA_ADI
        -> eğer çoklu sütun tespit edildiyse, otomatik ayırır
    python align_lines.py merge-suggest SAYFA_ADI
        -> önerilen çiftleri merge ile uygula
    python align_lines.py disable SAYFA_ADI NUM ...
        -> gerçekten gürültü olan satırları (silmeden) pasif yap
    python align_lines.py fill SAYFA_ADI

KULLANIM SIRASI (tek sütunlu, basit sayfalar için):
    python align_lines.py segment
    python align_lines.py reorder SAYFA_ADI
    python align_lines.py swap SAYFA_ADI NUM1 NUM2
    python align_lines.py merge SAYFA_ADI NUM1 NUM2
    python align_lines.py remove SAYFA_ADI NUM1 NUM2 ...
    python align_lines.py fill SAYFA_ADI

KULLANIM SIRASI (çok sütunlu sayfalar için, ek adım):
    python align_lines.py segment
    python align_lines.py regions SAYFA_ADI
        -> önizlemeye bak, hangi numaraların hangi sütuna ait olduğunu tespit et
    python align_lines.py region SAYFA_ADI sag_sutun 1 2 3 4 5 6 7 8 9 10 11 12 13
    python align_lines.py region SAYFA_ADI sol_sutun 14 15 16 17 18 19 20 21 22 23 24 25 26
        -> her komuttan sonra o bölgenin içindeki satırlar otomatik olarak
           yukarıdan aşağıya sıralanır
    python align_lines.py region-order SAYFA_ADI sag_sutun sol_sutun
        -> Osmanlıca sağdan sola okunduğu için sağ sütun önce okunmalı,
           bunu burada belirtiyoruz
    python align_lines.py regions SAYFA_ADI
        -> sonucu kontrol et
    (gerekirse remove/swap/merge ile ince ayar yap, sonra:)
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

# Bölgeleri (sütunları) önizlemede ayırt etmek için renk paleti
REGION_COLORS = [
    (255, 0, 0),      # kırmızı
    (0, 110, 255),    # mavi
    (0, 170, 0),       # yeşil
    (200, 0, 200),    # mor
    (255, 140, 0),    # turuncu
    (0, 170, 170),    # camgöbeği
]


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


def build_parent_map(root):
    """ElementTree'de getparent() olmadığı için, çocuk->ebeveyn haritası kuruyoruz."""
    return {c: p for p in root.iter() for c in p}


def region_name_of(tb) -> str:
    """Bir TextBlock elementinin bölge adını döndürür (TAGS ya da ID üzerinden)."""
    return tb.get("TAGS") or tb.get("ID") or "adsız_bolge"


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

    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 40)
        label_font = ImageFont.truetype("arial.ttf", 50)
    except Exception:
        font = ImageFont.load_default()
        label_font = font

    blocks = root.findall(".//alto:TextBlock", ns)
    global_idx = 0
    total_lines = 0

    for block_idx, tb in enumerate(blocks):
        color = REGION_COLORS[block_idx % len(REGION_COLORS)]
        lines = tb.findall("alto:TextLine", ns)
        region_label = region_name_of(tb)

        label_drawn = False
        for tl in lines:
            global_idx += 1
            total_lines += 1
            points = get_baseline_points(tl)
            line_color = (150, 150, 150) if is_disabled(tl) else color
            if len(points) >= 2:
                draw.line(points, fill=line_color, width=4)
                x, y = points[0]

                if not label_drawn and not is_disabled(tl):
                    label_pos = (x, y - 95)
                    lbbox = draw.textbbox(label_pos, region_label, font=label_font)
                    draw.rectangle(lbbox, fill=color)
                    draw.text(label_pos, region_label, fill=(255, 255, 255), font=label_font)
                    label_drawn = True

                text_label = f"{global_idx}(pasif)" if is_disabled(tl) else str(global_idx)
                text_pos = (x, y - 45)
                bbox = draw.textbbox(text_pos, text_label, font=font)
                badge_color = (200, 200, 200) if is_disabled(tl) else (255, 255, 0)
                draw.rectangle(bbox, fill=badge_color)
                draw.text(text_pos, text_label, fill=(0, 0, 0), font=font)

    img.save(output_path)
    return total_lines


def _process_one_page(image_path: Path, raw_dir: Path) -> None:
    """Tek bir sayfayı segmentler, XML/önizleme üretir. cmd_segment ve
    cmd_segment_one tarafından ortak kullanılır."""
    target_image = OUTPUT_DIR / image_path.name
    target_xml = OUTPUT_DIR / (image_path.stem + ".xml")
    preview_path = OUTPUT_DIR / (image_path.stem + "_preview.png")

    shutil.copy(image_path, target_image)
    if not segment_page(target_image, target_xml):
        return

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


def cmd_segment(raw_dir: Path = RAW_DIR) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image_files = sorted(raw_dir.glob("*.png")) + sorted(raw_dir.glob("*.jpg"))

    for image_path in image_files:
        _process_one_page(image_path, raw_dir)

    print(f"\nTüm önizlemeler '{OUTPUT_DIR}' klasöründe.")


def cmd_segment_one(page_name: str, raw_dir: Path = RAW_DIR) -> None:
    """
    SADECE tek bir sayfayı yeniden segmentler -- klasördeki diğer sayfaların
    XML'lerine hiç dokunmaz. Bir sayfayı sıfırdan (region/merge/remove
    işlemlerinden önceki hâline) baştan başlatmak istediğinde kullanılır.
    """
    image_path = raw_dir / (page_name + ".png")
    if not image_path.exists():
        image_path = raw_dir / (page_name + ".jpg")
    if not image_path.exists():
        print(f"HATA: '{page_name}' için görüntü dosyası bulunamadı ({raw_dir} içinde).")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    _process_one_page(image_path, raw_dir)
    print(f"\nSadece '{page_name}' yeniden segmentlendi, diğer sayfalara dokunulmadı.")


# ---------- Düzeltme komutları ----------

def _load(page_name: str):
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    backup_path = OUTPUT_DIR / (page_name + ".xml.bak")
    if xml_path.exists():
        shutil.copy(xml_path, backup_path)
    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"alto": ALTO_NS}
    return xml_path, tree, root, ns


def _load_readonly(page_name: str):
    """Yedek almadan sadece okumak için (listeleme gibi işlemler için)."""
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    tree = ET.parse(xml_path)
    root = tree.getroot()
    ns = {"alto": ALTO_NS}
    return xml_path, tree, root, ns


def cmd_undo(page_name: str) -> None:
    """Son değişikliği geri alır (bir önceki .xml haline döner)."""
    xml_path = OUTPUT_DIR / (page_name + ".xml")
    backup_path = OUTPUT_DIR / (page_name + ".xml.bak")
    if not backup_path.exists():
        print("HATA: Geri alınacak bir yedek bulunamadı.")
        return
    shutil.copy(backup_path, xml_path)
    print(f"{page_name}: Son değişiklik geri alındı.")
    _refresh_preview(page_name, xml_path)


def _refresh_preview(page_name: str, xml_path: Path) -> None:
    image_path = OUTPUT_DIR / (page_name + ".png")
    if not image_path.exists():
        image_path = OUTPUT_DIR / (page_name + ".jpg")
    preview_path = OUTPUT_DIR / (page_name + "_preview.png")
    count = draw_numbered_preview(image_path, xml_path, preview_path)
    print(f"Önizleme güncellendi: {preview_path} (toplam {count} satır)")


def cmd_reorder(page_name: str) -> None:
    """Her bölgenin içindeki satırları ortalama Y konumuna göre otomatik sıralar."""
    xml_path, tree, root, ns = _load(page_name)

    for tb in root.findall(".//alto:TextBlock", ns):
        lines = tb.findall("alto:TextLine", ns)
        if len(lines) < 2:
            continue
        sorted_lines = sorted(lines, key=avg_y)

        for l in lines:
            tb.remove(l)
        for l in sorted_lines:
            tb.append(l)

    save_xml(tree, xml_path, root, ns)
    print("Her bölgedeki satırlar Y konumuna göre yeniden sıralandı.")
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

    pts1 = get_baseline_points(line1)
    pts2 = get_baseline_points(line2)
    merged_pts = sorted(pts1 + pts2, key=lambda p: p[0])
    baseline_str = " ".join(f"{int(x)} {int(y)}" for x, y in merged_pts)
    line1.set("BASELINE", baseline_str)

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

    for tb in root.findall(".//alto:TextBlock", ns):
        if line2 in tb.findall("alto:TextLine", ns):
            tb.remove(line2)
            break

    save_xml(tree, xml_path, root, ns)
    print(f"Satır {num1} ve {num2} birleştirildi (artık tek satır).")
    remaining = len(root.findall(".//alto:TextLine", ns))
    print(f"Kalan satır sayısı: {remaining}")
    _refresh_preview(page_name, xml_path)


def cmd_fill(page_name: str, raw_dir: Path = RAW_DIR) -> None:
    xml_path, tree, root, ns = _load(page_name)
    txt_path = raw_dir / (page_name + ".txt")

    active = active_lines(root, ns)
    remaining = len(active)
    with open(txt_path, "r", encoding="utf-8") as f:
        text_lines = [l.strip() for l in f if l.strip()]

    print(f"XML'deki AKTİF satır sayısı: {remaining}")
    print(f"TXT'deki satır sayısı: {len(text_lines)}")

    if remaining == len(text_lines):
        print("\n✅ Sayılar eşleşiyor! Metni yerleştiriyorum...")
        for tl_elem, text in zip(active, text_lines):
            string_elem = tl_elem.find("alto:String", ns)
            if string_elem is None:
                string_elem = ET.SubElement(tl_elem, f"{{{ALTO_NS}}}String")
            string_elem.set("CONTENT", text)
        save_xml(tree, xml_path, root, ns)
        print(f"Tamamlandı: {xml_path} artık eğitime hazır.")
    else:
        print("\n⚠️ Sayılar hâlâ uyuşmuyor. 'suggest' komutuyla teşhis alabilir, 'reorder', 'swap', 'merge', 'region', 'disable' veya 'remove' ile devam edebilirsin.")


def cmd_check_all() -> None:
    """Tüm sayfaların gerçekten 'metin dolu' (eğitime hazır) olup olmadığını kontrol eder."""
    ns = {"alto": ALTO_NS}
    xml_files = sorted(OUTPUT_DIR.glob("*.xml"))

    ready = []
    not_ready = []

    for xml_path in xml_files:
        if xml_path.name.endswith(".bak"):
            continue
        tree = ET.parse(xml_path)
        root = tree.getroot()
        text_lines = active_lines(root, ns)
        filled = [tl for tl in text_lines if tl.find("alto:String", ns) is not None
                  and tl.find("alto:String", ns).get("CONTENT", "").strip()]

        page_name = xml_path.stem
        if text_lines and len(filled) == len(text_lines):
            ready.append((page_name, len(text_lines)))
        else:
            not_ready.append((page_name, len(filled), len(text_lines)))

    print("=== EĞİTİME HAZIR (tüm satırlar dolu) ===")
    for name, count in ready:
        print(f"  ✅ {name} ({count} satır)")

    print("\n=== HAZIR DEĞİL (hâlâ eksik/boş satır var) ===")
    for name, filled_count, total in not_ready:
        print(f"  ⚠️ {name} ({filled_count}/{total} satır dolu)")

    print(f"\nToplam: {len(ready)} sayfa hazır, {len(not_ready)} sayfa hazır değil.")


def cmd_fix_rotation(raw_dir: Path) -> None:
    """Klasördeki tüm görüntülere EXIF rotasyon düzeltmesi uygular."""
    from PIL import ImageOps

    image_files = sorted(raw_dir.glob("*.png")) + sorted(raw_dir.glob("*.jpg"))
    fixed_count = 0

    for image_path in image_files:
        try:
            img = Image.open(image_path)
            original_size = img.size
            fixed_img = ImageOps.exif_transpose(img)
            if fixed_img is not None and fixed_img.size != original_size:
                fixed_img.save(image_path)
                print(f"Döndürüldü: {image_path.name} ({original_size} -> {fixed_img.size})")
                fixed_count += 1
            else:
                if fixed_img is not None:
                    fixed_img.save(image_path)
        except Exception as e:
            print(f"HATA: {image_path.name} işlenemedi -- {e}")

    print(f"\nToplam {len(image_files)} görüntü kontrol edildi, {fixed_count} tanesi döndürüldü.")


def cmd_fill_all(raw_dir: Path) -> None:
    """Sayısı zaten eşleşen TÜM sayfaları otomatik doldurur, uyuşmayanları atlar."""
    ns = {"alto": ALTO_NS}
    xml_files = sorted(OUTPUT_DIR.glob("*.xml"))

    filled_count = 0
    skipped_count = 0

    for xml_path in xml_files:
        if xml_path.name.endswith(".bak"):
            continue
        page_name = xml_path.stem
        txt_path = raw_dir / (page_name + ".txt")
        if not txt_path.exists():
            continue

        tree = ET.parse(xml_path)
        root = tree.getroot()
        text_lines = active_lines(root, ns)

        with open(txt_path, "r", encoding="utf-8") as f:
            text_content = [l.strip() for l in f if l.strip()]

        if len(text_lines) == len(text_content):
            for tl_elem, text in zip(text_lines, text_content):
                string_elem = tl_elem.find("alto:String", ns)
                if string_elem is None:
                    string_elem = ET.SubElement(tl_elem, f"{{{ALTO_NS}}}String")
                string_elem.set("CONTENT", text)
            save_xml(tree, xml_path, root, ns)
            print(f"✅ {page_name}: dolduruldu ({len(text_lines)} aktif satır)")
            filled_count += 1
        else:
            print(f"⏭️  {page_name}: atlandı (aktif tespit={len(text_lines)}, metin={len(text_content)})")
            skipped_count += 1

    print(f"\nToplam: {filled_count} sayfa dolduruldu, {skipped_count} sayfa hâlâ düzeltme bekliyor.")


# ---------- Analiz / Öneri fonksiyonları (read-only, hiçbir şeyi değiştirmez) ----------

def is_disabled(tl) -> bool:
    return tl.get("DISABLED") == "true"


def active_lines(root, ns):
    """DISABLED olmayan (aktif) satırları döndürür."""
    return [tl for tl in root.findall(".//alto:TextLine", ns) if not is_disabled(tl)]


def _line_x_span(tl) -> tuple[float, float]:
    points = get_baseline_points(tl)
    if not points:
        hpos = float(tl.get("HPOS", 0))
        width = float(tl.get("WIDTH", 0))
        return hpos, hpos + width
    xs = [p[0] for p in points]
    return min(xs), max(xs)


def _line_length(tl) -> float:
    x0, x1 = _line_x_span(tl)
    return x1 - x0


def _line_x_center(tl) -> float:
    x0, x1 = _line_x_span(tl)
    return (x0 + x1) / 2


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 0:
        return (s[mid - 1] + s[mid]) / 2
    return s[mid]


def _cluster_lines_by_x(lines: list) -> list[list]:
    """
    Satırları X merkezine göre 1 ya da 2 gruba ayırır (basit boşluk tabanlı kümeleme).
    Amaç: merge/spacing analizini farklı sütunlar birbirine karışmadan yapabilmek.
    """
    if len(lines) < 4:
        return [lines]

    sorted_by_x = sorted(lines, key=_line_x_center)
    xs = [_line_x_center(l) for l in sorted_by_x]

    best_gap = 0.0
    split_idx = None
    for i in range(1, len(xs)):
        gap = xs[i] - xs[i - 1]
        if gap > best_gap:
            best_gap = gap
            split_idx = i

    total_range = xs[-1] - xs[0]
    if split_idx is None or total_range <= 0 or best_gap < 0.15 * total_range:
        return [lines]

    group1 = sorted_by_x[:split_idx]
    group2 = sorted_by_x[split_idx:]
    if len(group1) < 2 or len(group2) < 2:
        return [lines]

    return [group1, group2]


def find_merge_candidates(root, ns) -> list[tuple[int, int]]:
    """
    Aynı sütunda, birbirine dikey olarak çok yakın (muhtemelen ikiye bölünmüş)
    satır çiftlerini bulur. Farklı sütunların birbirine karışmaması için önce
    satırlar X konumuna göre kümelenir, analiz her küme içinde ayrı yapılır.
    Global (tüm sayfa) numaralandırma kullanır.
    """
    all_lines = root.findall(".//alto:TextLine", ns)
    line_to_number = {line: i + 1 for i, line in enumerate(all_lines)}

    candidates = []
    for tb in root.findall(".//alto:TextBlock", ns):
        lines = tb.findall("alto:TextLine", ns)
        if len(lines) < 2:
            continue

        for cluster in _cluster_lines_by_x(lines):
            if len(cluster) < 2:
                continue
            sorted_lines = sorted(cluster, key=avg_y)
            y_diffs = [avg_y(sorted_lines[i + 1]) - avg_y(sorted_lines[i]) for i in range(len(sorted_lines) - 1)]
            typical_spacing = _median(y_diffs) if len(y_diffs) >= 2 else None

            for i in range(len(sorted_lines) - 1):
                a, b = sorted_lines[i], sorted_lines[i + 1]
                diff = avg_y(b) - avg_y(a)
                if typical_spacing and typical_spacing > 0 and diff < 0.5 * typical_spacing:
                    num_a = line_to_number.get(a)
                    num_b = line_to_number.get(b)
                    if num_a and num_b:
                        candidates.append((num_a, num_b))

    return candidates


def find_short_lines(root, ns) -> list[tuple[int, float, float]]:
    """Sayfa ortalamasına göre çok kısa kalan satırları bulur (muhtemel hatalı tespit)."""
    all_lines = root.findall(".//alto:TextLine", ns)
    lengths = [_line_length(tl) for tl in all_lines]
    median_len = _median(lengths)

    short = []
    for i, tl in enumerate(all_lines, start=1):
        length = _line_length(tl)
        if median_len > 0 and length < 0.35 * median_len:
            short.append((i, length, median_len))
    return short


def find_region_candidates(root, ns):
    """
    Satırların X merkezine bakarak, sayfada 2 sütun olup olmadığını tahmin eder.
    Döndürür: (sag_grubu_numaralari, sol_grubu_numaralari, guven_orani) ya da None
    """
    all_lines = root.findall(".//alto:TextLine", ns)
    if len(all_lines) < 4:
        return None

    page_elem = root.find(".//alto:Page", ns)
    page_width = float(page_elem.get("WIDTH", 0)) if page_elem is not None else 0
    if page_width <= 0:
        page_width = max(_line_x_span(tl)[1] for tl in all_lines)

    centers = [(_line_x_center(tl), i + 1) for i, tl in enumerate(all_lines)]
    centers_sorted = sorted(centers, key=lambda c: c[0])
    xs = [c[0] for c in centers_sorted]

    best_gap = 0.0
    best_split_idx = None
    for i in range(1, len(xs)):
        gap = xs[i] - xs[i - 1]
        if gap > best_gap:
            best_gap = gap
            best_split_idx = i

    if best_split_idx is None or page_width <= 0:
        return None

    gap_ratio = best_gap / page_width
    if gap_ratio < 0.12:
        return None  # yeterince büyük bir boşluk yok, muhtemelen tek sütun

    low_group = [c[1] for c in centers_sorted[:best_split_idx]]
    high_group = [c[1] for c in centers_sorted[best_split_idx:]]

    if len(low_group) < 2 or len(high_group) < 2:
        return None

    # Sayfada X arttıkça sağa gidiliyor (görüntü koordinatı) -> yüksek X = sağ taraf
    return sorted(high_group), sorted(low_group), gap_ratio


def cmd_merge_suggest(page_name: str) -> None:
    """Muhtemel bölünmüş satır çiftlerini ÖNERİR, hiçbir şeyi değiştirmez."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    candidates = find_merge_candidates(root, ns)

    if not candidates:
        print("Muhtemel bölünmüş satır çifti bulunamadı.")
        return

    print(f"=== {page_name} — Muhtemel bölünmüş satırlar ===")
    for num_a, num_b in candidates:
        print(f"  {num_a}-{num_b}  ->  şunu deneyebilirsin: merge {page_name} {num_a} {num_b}")
    print(f"\n{len(candidates)} aday çift bulundu. Önizlemeye bakıp gözünle doğrula, sonra 'merge' komutuyla uygula.")


def cmd_region_suggest(page_name: str) -> None:
    """Sayfada 2 sütun olup olmadığını ÖNERİR, hiçbir şeyi değiştirmez."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    result = find_region_candidates(root, ns)

    if result is None:
        print("Belirgin bir çoklu sütun düzeni tespit edilmedi (muhtemelen tek sütunlu bir sayfa).")
        return

    right_group, left_group, gap_ratio = result
    print(f"=== {page_name} — Olası sütun önerisi (güven: %{gap_ratio*100:.0f} boşluk oranı) ===")
    print(f"  Sağ sütun adayı ({len(right_group)} satır): {right_group}")
    print(f"  Sol sütun adayı ({len(left_group)} satır): {left_group}")
    print(f"\nUygulamak için: region-auto {page_name}")
    print(f"Ya da elle: region {page_name} sag_sutun {' '.join(map(str, right_group))}")
    print(f"           region {page_name} sol_sutun {' '.join(map(str, left_group))}")


def cmd_region_auto(page_name: str) -> None:
    """region_suggest'in bulduğu sütun önerisini otomatik olarak uygular."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    result = find_region_candidates(root, ns)

    if result is None:
        print("Uygulanacak bir sütun önerisi bulunamadı (tek sütunlu görünüyor).")
        return

    right_group, left_group, gap_ratio = result
    print(f"Öneri uygulanıyor (güven: %{gap_ratio*100:.0f})...")
    cmd_region(page_name, "sag_sutun", right_group)
    cmd_region(page_name, "sol_sutun", left_group)
    cmd_region_order(page_name, ["sag_sutun", "sol_sutun"])
    print("\nOtomatik bölge ataması tamamlandı. Önizlemeyi kontrol et, gerekirse elle düzelt.")


def cmd_suggest(page_name: str) -> None:
    """Sayfadaki muhtemel sorunları (kısa satır, bölünmüş satır, çoklu sütun) tek raporda özetler."""
    xml_path, tree, root, ns = _load_readonly(page_name)

    print(f"========== {page_name} — Teşhis Raporu ==========\n")

    total = len(root.findall(".//alto:TextLine", ns))
    print(f"Toplam tespit edilen satır: {total}\n")

    short = find_short_lines(root, ns)
    if short:
        print(f"⚠️  Şüpheli KISA satırlar ({len(short)} tane) — muhtemel gürültü/hatalı tespit:")
        for num, length, median_len in short:
            print(f"    Satır {num}: uzunluk {length:.0f}px (sayfa medyanı: {median_len:.0f}px)")
    else:
        print("✅ Şüpheli derecede kısa satır yok.")
    print()

    merge_candidates = find_merge_candidates(root, ns)
    if merge_candidates:
        print(f"⚠️  Muhtemel BÖLÜNMÜŞ satır çiftleri ({len(merge_candidates)} tane):")
        for num_a, num_b in merge_candidates:
            print(f"    {num_a} ile {num_b} aynı satırın parçaları olabilir")
    else:
        print("✅ Bölünmüş satır belirtisi yok.")
    print()

    region_result = find_region_candidates(root, ns)
    if region_result:
        right_group, left_group, gap_ratio = region_result
        print(f"⚠️  ÇOKLU SÜTUN belirtisi (güven: %{gap_ratio*100:.0f}):")
        print(f"    Sağ sütun adayı: {right_group}")
        print(f"    Sol sütun adayı: {left_group}")
        print(f"    Uygulamak için: region-auto {page_name}")
    else:
        print("✅ Tek sütunlu düzen gibi görünüyor.")
    print()

    # Basit bir iş yükü tahmini
    issue_count = len(short) + len(merge_candidates) + (1 if region_result else 0)
    if issue_count == 0:
        difficulty = "☆☆☆☆☆ (sorun görünmüyor, direkt fill deneyebilirsin)"
    elif issue_count <= 2:
        difficulty = "★☆☆☆☆ (küçük düzeltmeler yeterli)"
    elif issue_count <= 5:
        difficulty = "★★★☆☆ (orta düzeyde düzeltme gerekiyor)"
    else:
        difficulty = "★★★★★ (karmaşık sayfa, çok düzeltme gerekebilir)"
    print(f"Tahmini iş yükü: {difficulty}")


def cmd_disable(page_name: str, line_numbers: list[int]) -> None:
    """
    Satırları KALICI OLARAK SİLMEDEN pasif hale getirir (remove'un güvenli alternatifi).
    Pasif satırlar eğitimde kullanılmaz ama 'restore' ile geri getirilebilir.
    """
    xml_path, tree, root, ns = _load(page_name)
    all_lines = root.findall(".//alto:TextLine", ns)

    count = 0
    for num in sorted(set(line_numbers)):
        idx = num - 1
        if 0 <= idx < len(all_lines):
            all_lines[idx].set("DISABLED", "true")
            count += 1
            print(f"Satır {num} pasif hale getirildi (silinmedi).")
        else:
            print(f"UYARI: {num} numaralı satır bulunamadı.")

    save_xml(tree, xml_path, root, ns)
    print(f"\n{count} satır pasif yapıldı. Geri almak için: restore {page_name} <numara...>")
    _refresh_preview(page_name, xml_path)


def cmd_restore(page_name: str, line_numbers: list[int]) -> None:
    """disable ile pasif yapılmış satırları tekrar aktif hale getirir."""
    xml_path, tree, root, ns = _load(page_name)
    all_lines = root.findall(".//alto:TextLine", ns)

    count = 0
    for num in sorted(set(line_numbers)):
        idx = num - 1
        if 0 <= idx < len(all_lines):
            if "DISABLED" in all_lines[idx].attrib:
                del all_lines[idx].attrib["DISABLED"]
                count += 1
                print(f"Satır {num} tekrar aktif edildi.")
            else:
                print(f"Satır {num} zaten aktifti.")
        else:
            print(f"UYARI: {num} numaralı satır bulunamadı.")

    save_xml(tree, xml_path, root, ns)
    print(f"\n{count} satır geri getirildi.")
    _refresh_preview(page_name, xml_path)


def find_multi_region_candidates(root, ns):
    """
    Sayfayı, hem dikey (Y) hem yatay (X) büyük boşluklara bakarak
    OTOMATIK olarak birden fazla bloğa/sütuna ayırır. region_auto'nun
    (sadece 2 sütun) genelleştirilmiş hali -- başlıklı, çok bloklu
    karmaşık sayfalar için.

    Döndürür: [(bolge_adi, [satır_numaraları]), ...] okuma sırasına göre,
    ya da hiçbir çoklu blok bulunamazsa None.
    """
    all_lines = root.findall(".//alto:TextLine", ns)
    if len(all_lines) < 3:
        return None

    line_to_number = {line: i + 1 for i, line in enumerate(all_lines)}

    sorted_by_y = sorted(all_lines, key=avg_y)
    y_diffs = [avg_y(sorted_by_y[i + 1]) - avg_y(sorted_by_y[i]) for i in range(len(sorted_by_y) - 1)]
    median_gap = _median(y_diffs) if y_diffs else 0

    if median_gap <= 0:
        return None

    # 1. adım: büyük Y boşluklarına göre yatay şeritlere (bloklara) ayır
    bands = []
    current_band = [sorted_by_y[0]]
    for i in range(1, len(sorted_by_y)):
        diff = avg_y(sorted_by_y[i]) - avg_y(sorted_by_y[i - 1])
        if diff > 2.2 * median_gap:
            bands.append(current_band)
            current_band = [sorted_by_y[i]]
        else:
            current_band.append(sorted_by_y[i])
    bands.append(current_band)

    if len(bands) < 2:
        return None  # tek blok, bu fonksiyona gerek yok (region_suggest yeterli)

    # 2. adım: her bloğun içinde X'e göre sütunlara ayır
    result = []
    for band_idx, band_lines in enumerate(bands, start=1):
        clusters = _cluster_lines_by_x(band_lines)
        if len(clusters) == 1:
            nums = sorted(line_to_number[l] for l in clusters[0])
            result.append((f"blok{band_idx}", nums))
        else:
            low_group, high_group = clusters[0], clusters[1]
            right_nums = sorted(line_to_number[l] for l in high_group)
            left_nums = sorted(line_to_number[l] for l in low_group)
            result.append((f"blok{band_idx}_sag", right_nums))
            result.append((f"blok{band_idx}_sol", left_nums))

    return result


def cmd_region_suggest_multi(page_name: str) -> None:
    """Çoklu blok/sütun önerisini gösterir, hiçbir şeyi UYGULAMAZ."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    result = find_multi_region_candidates(root, ns)

    if result is None:
        print("Birden fazla blok tespit edilemedi. Sayfa tek bloklu görünüyor.")
        print("Basit 2 sütun kontrolü için 'region-suggest' komutunu deneyebilirsin.")
        return

    print(f"=== {page_name} — {len(result)} bölge tespit edildi ===")
    for name, nums in result:
        print(f"  {name}: {nums}")

    print(f"\nUygulamak için: region-auto-multi {page_name}")


def cmd_region_auto_multi(page_name: str) -> None:
    """find_multi_region_candidates'in bulduğu çoklu blok/sütun önerisini otomatik uygular."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    result = find_multi_region_candidates(root, ns)

    if result is None:
        print("Uygulanacak bir çoklu blok önerisi bulunamadı (tek blok gibi görünüyor).")
        print("Basit 2 sütun için 'region-auto' komutunu deneyebilirsin.")
        return

    print(f"{len(result)} bölge tespit edildi, uygulanıyor...")
    for name, nums in result:
        print(f"  {name}: {nums}")
        cmd_region(page_name, name, nums)

    region_order = [name for name, _ in result]
    cmd_region_order(page_name, region_order)
    print(f"\nOtomatik çoklu-bölge ataması tamamlandı (okuma sırası: {' -> '.join(region_order)}).")
    print("Önizlemeyi kontrol et -- her blok farklı renkte görünecek.")


# ---------- Region (bölge/sütun) komutları ----------

def cmd_regions(page_name: str) -> None:
    """Sayfadaki mevcut bölgeleri ve her birindeki satır sayısını listeler."""
    xml_path, tree, root, ns = _load_readonly(page_name)
    blocks = root.findall(".//alto:TextBlock", ns)

    if not blocks:
        print("Bu sayfada hiç bölge/TextBlock bulunamadı.")
        return

    print(f"=== {page_name} sayfasındaki bölgeler ===")
    global_idx = 0
    for tb in blocks:
        name = region_name_of(tb)
        lines = tb.findall("alto:TextLine", ns)
        line_numbers = list(range(global_idx + 1, global_idx + 1 + len(lines)))
        global_idx += len(lines)
        print(f"  Bölge '{name}': {len(lines)} satır -> numaralar: {line_numbers}")

    print(f"\nToplam {global_idx} satır, {len(blocks)} bölgede.")
    print("Okuma sırası şu anki bölge sırasına göre: " +
          " -> ".join(region_name_of(tb) for tb in blocks))


def cmd_region(page_name: str, region_name: str, line_numbers: list[int]) -> None:
    """Belirtilen satır numaralarını, isimlendirilmiş bir bölgeye (sütuna) taşır."""
    xml_path, tree, root, ns = _load(page_name)
    all_lines = root.findall(".//alto:TextLine", ns)

    selected = []
    for num in sorted(set(line_numbers)):
        idx = num - 1
        if 0 <= idx < len(all_lines):
            selected.append(all_lines[idx])
        else:
            print(f"UYARI: {num} numaralı satır bulunamadı, atlandı.")

    if not selected:
        print("HATA: Geçerli satır bulunamadı, hiçbir şey yapılmadı.")
        return

    parent_map = build_parent_map(root)

    dest_block = None
    for tb in root.findall(".//alto:TextBlock", ns):
        if region_name_of(tb) == region_name:
            dest_block = tb
            break

    if dest_block is None:
        existing_blocks = root.findall(".//alto:TextBlock", ns)
        if existing_blocks:
            parent = parent_map[existing_blocks[0]]
        else:
            parent = root.find(".//alto:PrintSpace", ns)
            if parent is None:
                parent = root
        dest_block = ET.SubElement(parent, f"{{{ALTO_NS}}}TextBlock")
        dest_block.set("ID", region_name)
        dest_block.set("TAGS", region_name)
        print(f"Yeni bölge oluşturuldu: '{region_name}'")

    for line in selected:
        old_parent = parent_map.get(line)
        if old_parent is not None and line in list(old_parent):
            old_parent.remove(line)
        dest_block.append(line)

    lines_in_dest = dest_block.findall("alto:TextLine", ns)
    sorted_lines = sorted(lines_in_dest, key=avg_y)
    for l in lines_in_dest:
        dest_block.remove(l)
    for l in sorted_lines:
        dest_block.append(l)

    parent_map = build_parent_map(root)
    for tb in list(root.findall(".//alto:TextBlock", ns)):
        if tb is not dest_block and len(tb.findall("alto:TextLine", ns)) == 0:
            p = parent_map.get(tb)
            if p is not None:
                p.remove(tb)

    save_xml(tree, xml_path, root, ns)
    print(f"{len(selected)} satır '{region_name}' bölgesine taşındı ve yukarıdan aşağıya sıralandı.")
    _refresh_preview(page_name, xml_path)


def cmd_region_order(page_name: str, region_order: list[str]) -> None:
    """Bölgelerin (sütunların) okuma sırasını ayarlar."""
    xml_path, tree, root, ns = _load(page_name)
    blocks = root.findall(".//alto:TextBlock", ns)

    if not blocks:
        print("HATA: Bu sayfada hiç bölge yok.")
        return

    block_by_name = {region_name_of(tb): tb for tb in blocks}

    missing = [n for n in region_order if n not in block_by_name]
    if missing:
        print(f"HATA: Şu bölge adları bulunamadı: {missing}")
        print(f"Mevcut bölgeler: {list(block_by_name.keys())}")
        return

    parent_map = build_parent_map(root)
    parent = parent_map[blocks[0]]

    for tb in blocks:
        parent.remove(tb)

    for name in region_order:
        parent.append(block_by_name[name])

    for name, tb in block_by_name.items():
        if name not in region_order:
            parent.append(tb)
            print(f"UYARI: '{name}' bölgesi sıralamada belirtilmemişti, en sona eklendi.")

    save_xml(tree, xml_path, root, ns)
    print(f"Okuma sırası güncellendi: {' -> '.join(region_order)}")
    _refresh_preview(page_name, xml_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python align_lines.py [segment|reorder|remove|swap|merge|fill|region|region-order|region-auto|regions|suggest|merge-suggest|region-suggest|disable|restore|check-all|undo|fix-rotation|fill-all] ...")
        sys.exit(1)

    action = sys.argv[1]

    if action == "segment":
        folder = Path(sys.argv[2]) if len(sys.argv) > 2 else RAW_DIR
        cmd_segment(folder)
    elif action == "segment-one":
        page = sys.argv[2]
        folder = Path(sys.argv[3]) if len(sys.argv) > 3 else RAW_DIR
        cmd_segment_one(page, folder)
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
        page = sys.argv[2]
        folder = Path(sys.argv[3]) if len(sys.argv) > 3 else RAW_DIR
        cmd_fill(page, folder)
    elif action == "undo":
        cmd_undo(sys.argv[2])
    elif action == "check-all":
        cmd_check_all()
    elif action == "fix-rotation":
        folder = Path(sys.argv[2]) if len(sys.argv) > 2 else RAW_DIR
        cmd_fix_rotation(folder)
    elif action == "fill-all":
        folder = Path(sys.argv[2]) if len(sys.argv) > 2 else RAW_DIR
        cmd_fill_all(folder)
    elif action == "region":
        page = sys.argv[2]
        region_name = sys.argv[3]
        nums = [int(n) for n in sys.argv[4:]]
        cmd_region(page, region_name, nums)
    elif action == "region-order":
        page = sys.argv[2]
        region_order = sys.argv[3:]
        cmd_region_order(page, region_order)
    elif action == "regions":
        cmd_regions(sys.argv[2])
    elif action == "suggest":
        cmd_suggest(sys.argv[2])
    elif action == "merge-suggest":
        cmd_merge_suggest(sys.argv[2])
    elif action == "region-suggest":
        cmd_region_suggest(sys.argv[2])
    elif action == "region-auto":
        cmd_region_auto(sys.argv[2])
    elif action == "region-suggest-multi":
        cmd_region_suggest_multi(sys.argv[2])
    elif action == "region-auto-multi":
        cmd_region_auto_multi(sys.argv[2])
    elif action == "disable":
        page = sys.argv[2]
        nums = [int(n) for n in sys.argv[3:]]
        cmd_disable(page, nums)
    elif action == "restore":
        page = sys.argv[2]
        nums = [int(n) for n in sys.argv[3:]]
        cmd_restore(page, nums)
    else:
        print(f"Bilinmeyen komut: {action}")