import re
import json

def load_pages(path):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    return content.split(chr(12))

def strip_page_header(page_text):
    lines = page_text.split('\n')
    if lines and 0 < len(lines[0].strip()) < 40 and ':' not in lines[0]:
        lines = lines[1:]
    return '\n'.join(lines)

def clean_text(text):
    text = text.replace('\xad', '')
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

TURKISH_WORD = r"[a-zçğıöşüA-ZÇĞİÖŞÜ][a-zçğıöşü'’\-]{1,30}"
# Gerçek Türkçe kelime kontrolü: sadece izin verilen harflerden oluşmalı, üstelik
# ardışık büyük/küçük harf karışıklığı (bozuk OCR belirtisi) olmamalı
VALID_WORD_RE = re.compile(r"^[a-zçğıöşü]+(['’\-][a-zçğıöşü]+)*$")

def is_clean_word(w):
    wl = w.lower()
    if not VALID_WORD_RE.match(wl):
        return False
    if len(wl) < 3:
        return False
    return True

pages = load_pages('/tmp/lugat_full.txt')
body_pages = pages[19:]  # önsöz sayfalarını atla, sözlük gövdesinden itibaren

full_text = ''
for p in body_pages:
    full_text += ' ' + strip_page_header(p)
full_text = clean_text(full_text)
print("Toplam karakter:", len(full_text))

# Abbreviation-colon işaretlerini bul (tanımın başladığı yer)
def_start_pattern = re.compile(r"\(([a-zA-Z]{1,4}(?:\.[a-zA-Z]{1,5}){0,4})\.?\)\s*:")
def_starts = list(def_start_pattern.finditer(full_text))
print("Bulunan (abbr): işareti sayısı:", len(def_starts))

# Her def_start için, öncesindeki en yakın "gerçek" kelimeyi (headword) bul
word_re = re.compile(r"\b(" + TURKISH_WORD + r")\b")

entries = []
for i, ds in enumerate(def_starts):
    search_window_start = max(0, ds.start() - 60)
    window = full_text[search_window_start:ds.start()]
    words_in_window = list(word_re.finditer(window))
    if not words_in_window:
        continue
    last_word_match = words_in_window[-1]
    headword = last_word_match.group(1)
    headword_abs_start = search_window_start + last_word_match.start()

    def_text_start = ds.end()
    def_text_end = def_starts[i+1].start() if i+1 < len(def_starts) else len(full_text)
    # tanımı, bir sonraki girişin headword başlangıcına kadar kısıtla (varsa)
    if i+1 < len(def_starts):
        next_window_start = max(0, def_starts[i+1].start() - 60)
        next_window = full_text[next_window_start:def_starts[i+1].start()]
        next_words = list(word_re.finditer(next_window))
        if next_words:
            def_text_end = next_window_start + next_words[-1].start()

    definition = full_text[def_text_start:def_text_end].strip(" .")
    entries.append({"word": headword, "definition": definition})

print("Ham giriş sayısı:", len(entries))

# Temiz filtreleme
clean_entries = []
for e in entries:
    if is_clean_word(e["word"]) and len(e["definition"]) >= 5 and len(e["definition"]) < 500:
        clean_entries.append(e)

print("Temiz (filtrelenmiş) giriş sayısı:", len(clean_entries))

with open('/home/claude/lugat_entries.jsonl', 'w', encoding='utf-8') as f:
    for e in clean_entries:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")

print("\n--- İlk 15 temiz örnek ---")
for e in clean_entries[:15]:
    print(e)

# --- Ek temizlik geçişi ---
import re as _re

def final_clean(definition):
    d = definition
    # Yalnız rakamlardan oluşan bağımsız token'ları at (sayfa numarası sızıntısı)
    d = _re.sub(r'\b\d{1,4}\b', '', d)
    # Türkçe alfabesi + temel noktalama dışındaki karakter dizilerini temizle
    # (bozuk Arap harfi kalıntıları genelde ardışık garip sembol/harf karışımı olur)
    allowed = r"a-zA-ZçğıöşüÇĞİÖŞÜ0-9\s\.\,\;\:\'\"\(\)\[\]\-\!\?"
    d = _re.sub(rf'[^{allowed}]', ' ', d)
    d = _re.sub(r'\s+', ' ', d).strip(" .,;:")
    return d

final_entries = []
for e in clean_entries:
    d = final_clean(e["definition"])
    if len(d) >= 5 and len(d) < 400:
        final_entries.append({"word": e["word"], "definition": d})

print("\nSon temizlik sonrası giriş sayısı:", len(final_entries))

with open('/home/claude/lugat_entries_final.jsonl', 'w', encoding='utf-8') as f:
    for e in final_entries:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")

import random
random.seed(7)
print("\n--- Son temizlikten sonra rastgele 10 örnek ---")
for e in random.sample(final_entries, 10):
    print(f"{e['word']!r} -> {e['definition']!r}")
