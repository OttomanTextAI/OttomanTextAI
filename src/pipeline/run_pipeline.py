"""
src/pipeline/run_pipeline.py

Tüm modülleri (Sinem -> Zehra -> İrem -> Zeynep) birbirine bağlayan
ana orkestrasyon dosyası.

ŞİMDİLİK sadece "photo" (fotoğraf) girişi aktif çalışır.
"document" ve "text" girişleri ileride kolayca eklenebilsin diye
iskelet olarak burada duruyor (henüz uygulanmadı).
"""

from src.image_enhancement.enhance import enhance_image
from src.ocr_htr.inference import run_ocr
from src.transliteration.inference import transliterate
from src.simplification.inference import simplify


def process_photo(
    image_bytes: bytes,
    profile: str = "printed",
) -> dict:
    enhanced = enhance_image(
        image_bytes,
        profile=profile,
    )

    ottoman_arabic = run_ocr(
        enhanced
    )

    latin_ottoman = transliterate(
        ottoman_arabic
    )

    result = simplify(
        latin_ottoman
    )

    return {
        "ocr_output": ottoman_arabic,
        "transliteration_output": latin_ottoman,
        "final_output": result["text"],
        "mock": result["mock"],
    }


def process_document(document_bytes: bytes) -> dict:
    """
    İLERİDE EKLENECEK: PDF/belge girişi.
    Muhtemel akış: belgeden sayfa görselleri çıkar -> her sayfa için process_photo() çağır.
    """
    raise NotImplementedError("Belge girişi henüz eklenmedi. Şimdilik sadece process_photo() aktif.")


def process_typed_text(latin_ottoman_text: str) -> dict:
    """
    İLERİDE EKLENECEK: Kullanıcının doğrudan Latin harfli Osmanlıca yazdığı durum.
    OCR ve transliterasyon adımları atlanır, direkt sadeleştirmeye girer.
    """
    result = simplify(latin_ottoman_text)
    return {
        "ocr_output": None,
        "transliteration_output": latin_ottoman_text,
        "final_output": result["text"],
        "mock": result["mock"],
    }


def process(
    input_type: str,
    data,
    profile: str = "printed",
):
    if input_type == "photo":
        return process_photo(
            data,
            profile=profile,
        )
    elif input_type == "document":
        return process_document(data)
    elif input_type == "text":
        return process_typed_text(data)
    else:
        raise ValueError(f"Bilinmeyen giriş türü: {input_type}")


if __name__ == "__main__":
    # Basit bir test: sahte (mock) bir "fotoğraf" ile pipeline'ı çalıştır
    fake_image_bytes = b"BU_SAHTE_BIR_FOTOGRAF_ICERIGIDIR"
    sonuc = process("photo", fake_image_bytes)
    print("SONUÇ:")
    for k, v in sonuc.items():
        print(f"  {k}: {v}")