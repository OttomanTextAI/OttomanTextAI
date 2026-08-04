"""
src/ocr_htr/metrics.py
CER/WER hesaplayan değerlendirme modülü.
"""

from pathlib import Path
from jiwer import cer, wer


def load_pairs(test_dir: Path, predictions_dir: Path) -> tuple[list[str], list[str]]:
    references = []
    hypotheses = []

    gt_files = sorted(test_dir.glob("*.gt.txt"))
    for gt_file in gt_files:
        file_id = gt_file.stem.replace(".gt", "")
        pred_file = predictions_dir / f"{file_id}.txt"

        if not pred_file.exists():
            print(f"Uyarı: {pred_file} bulunamadı, atlanıyor.")
            continue

        with open(gt_file, "r", encoding="utf-8") as f:
            references.append(f.read().strip())
        with open(pred_file, "r", encoding="utf-8") as f:
            hypotheses.append(f.read().strip())

    return references, hypotheses


def evaluate(test_dir: str, predictions_dir: str) -> dict:
    references, hypotheses = load_pairs(Path(test_dir), Path(predictions_dir))

    if not references:
        raise ValueError("Karşılaştırılacak örnek bulunamadı, yolları kontrol et.")

    score_cer = cer(references, hypotheses)
    score_wer = wer(references, hypotheses)

    print(f"Örnek sayısı: {len(references)}")
    print(f"CER (Karakter Hata Oranı): {score_cer:.4f}")
    print(f"WER (Kelime Hata Oranı):   {score_wer:.4f}")

    return {
        "cer": score_cer,
        "wer": score_wer,
        "num_samples": len(references),
    }


if __name__ == "__main__":
    evaluate(
        test_dir="data/processed/ocr_htr/test",
        predictions_dir="experiments/ocr_htr/predictions",
    )