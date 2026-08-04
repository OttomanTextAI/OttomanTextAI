"""
convert_ckpt_to_safetensors.py

.ckpt (PyTorch Lightning checkpoint) dosyasını, kraken'in inference (kullanım)
komutunun okuyabileceği .safetensors formatına çevirir.

Kullanım (Docker konteyneri içinde):
    python convert_ckpt_to_safetensors.py GIRIS.ckpt CIKIS.safetensors
"""

import sys
import torch

# PyTorch 2.6 güvenlik kısıtlamasını aş (kendi eğittiğimiz, güvenilir dosya)
_orig_load = torch.load


def _patched_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _orig_load(*args, **kwargs)


torch.load = _patched_load


def convert(ckpt_path: str, output_path: str) -> None:
    print(f"Yükleniyor: {ckpt_path}")

    # ketos test/train'in kullandığı ile aynı sınıfı deniyoruz
    model = None
    last_error = None

    import_attempts = [
        ("kraken.train.vgsl", "VGSLRecognitionModel"),
    ]

    for module_name, class_name in import_attempts:
        try:
            module = __import__(module_name, fromlist=[class_name])
            cls = getattr(module, class_name)
            model = cls.load_from_checkpoint(ckpt_path)
            print(f"Başarılı: {module_name}.{class_name} ile yüklendi.")
            break
        except Exception as e:
            last_error = e
            print(f"Denendi ama olmadı: {module_name}.{class_name} -- {e}")

    if model is None:
        raise RuntimeError(f"Hiçbir yöntemle yüklenemedi. Son hata: {last_error}")

    # Modelin içindeki gerçek VGSL ağını (TorchVGSLModel) bulmaya çalışıyoruz
    inner_model = None
    for attr_name in ["nn", "net", "model"]:
        if hasattr(model, attr_name):
            candidate = getattr(model, attr_name)
            if hasattr(candidate, "save_model"):
                inner_model = candidate
                print(f"İç model bulundu: model.{attr_name}")
                break

    if inner_model is None:
        print("UYARI: İç modeli otomatik bulamadım, model nesnesinin özelliklerini listeliyorum:")
        print([a for a in dir(model) if not a.startswith("_")])
        raise RuntimeError("İç model bulunamadı, yukarıdaki listeye bakıp doğru attribute adını bulmamız lazım.")

    print(f"Kaydediliyor: {output_path}")
    inner_model.save_model(output_path)
    print("Tamamlandı!")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Kullanım: python convert_ckpt_to_safetensors.py GIRIS.ckpt CIKIS.safetensors")
        sys.exit(1)
    convert(sys.argv[1], sys.argv[2])