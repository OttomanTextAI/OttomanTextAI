import os, sys
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont

src, dst = sys.argv[1], sys.argv[2]
only = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(dst, exist_ok=True)
colors = [(230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180), (0, 150, 150), (240, 50, 230), (128, 128, 0)]
try:
    font = ImageFont.truetype("arial.ttf", 30)
except Exception:
    font = ImageFont.load_default()

def tag(e):
    return e.tag.split("}")[-1]

def num(v):
    return int(float(v))

for name in sorted(os.listdir(src)):
    if not name.lower().endswith(".xml"):
        continue
    base = name[:-4]
    if only and base != only:
        continue
    png = os.path.join(src, base + ".png")
    if not os.path.exists(png):
        print("gorsel yok:", base)
        continue
    root = ET.parse(os.path.join(src, name)).getroot()
    im = Image.open(png).convert("RGB")
    d = ImageDraw.Draw(im)
    n = 0
    bi = -1
    for blk in root.iter():
        if tag(blk) != "TextBlock":
            continue
        bi += 1
        col = colors[bi % len(colors)]
        for ln in blk.iter():
            if tag(ln) != "TextLine" or ln.get("DISABLED") == "true":
                continue
            n += 1
            try:
                x, y = num(ln.get("HPOS")), num(ln.get("VPOS"))
                w, h = num(ln.get("WIDTH")), num(ln.get("HEIGHT"))
                d.rectangle([x, y, x + w, y + h], outline=col, width=2)
                d.text((x, max(0, y - 34)), str(n), fill=col, font=font)
            except (TypeError, ValueError):
                pass
            try:
                p = [num(v) for v in ln.get("BASELINE").split()]
                d.line(p, fill=col, width=3)
            except (AttributeError, TypeError, ValueError):
                pass
    im.save(os.path.join(dst, base + "_preview.png"))
    print(base, n, "satir")
print("bitti")