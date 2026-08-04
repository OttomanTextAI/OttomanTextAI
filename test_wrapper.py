"""
test_wrapper.py

PyTorch 2.6+'nin varsayılan güvenlik ayarı (weights_only=True), Kraken'in
checkpoint (.ckpt) dosyalarını yüklemesini engelliyor. Bu script, torch.load'u
güvenli bir şekilde eski davranışına (weights_only=False) döndürüp, sonra
normal ketos komutunu çalıştırır.

SADECE KENDİ EĞİTTİĞİN, GÜVENDİĞİN checkpoint dosyaları için kullan.

Kullanım (ketos komutuyla birebir aynı, sadece başına "python test_wrapper.py" gelir):
    python test_wrapper.py test -m MODEL_YOLU -f alto VERI/*.xml
    python test_wrapper.py train -i MODEL_YOLU ...
"""

import torch

_orig_load = torch.load


def _patched_load(*args, **kwargs):
    kwargs["weights_only"] = False
    return _orig_load(*args, **kwargs)


torch.load = _patched_load

from kraken.ketos import cli

if __name__ == "__main__":
    cli()