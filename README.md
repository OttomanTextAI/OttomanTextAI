# 📜 Osmanlıca Belge Analiz ve Çeviri Platformu
> **Görselden Günümüz Türkçesine:** Basılı Osmanlıca belgeleri mobil kamera aracılığıyla dijitalleştiren, görüntü kusurlarını iyileştiren, transkripsiyonunu çıkaran ve LLM desteğiyle günümüz Türkçesine sadeleştiren uçtan uca mobil platform.

## 📌 Proje Hakkında

Bu proje, tarihî ve matbu Osmanlıca belgelerin okunması ve anlaşılması süreçlerindeki zorlukları çözmek amacıyla geliştirilmiştir. Saha koşullarında (mobil kamera ile) çekilen belgelerdeki eğiklik, gölge ve düşük çözünürlük gibi problemleri **OpenCV** ile giderir; ardından metni **OCR**, **Transkripsiyon** ve **Büyük Dil Modelleri (LLM)** aşamalarından geçirerek kullanıcıya sunar.

### 🌟 Öne Çıkan Özellikler

* 📸 **Mobil Ön İşleme (OpenCV):** Eğiklik düzeltme (Deskew), perspektif hizalama ve noktalama işaretlerini koruyan gürültü temizleme.
* 🔍 **Arap Harfli Osmanlıca OCR:** Matbu metinler üzerinde optimize edilmiş karakter tanıma motoru.
* 🔤 **Aşamalı Transkripsiyon:** Kural tabanlı ve LLM destekli melez yapısıyla Osmanlıca metni Latin harflerine aktarma.
* 🤖 **LLM Sadeleştirme:** Eski kelimeleri ve karmaşık cümle yapılarını günümüz Türkçesine dönüştürme.
✍️ **Kullanıcı Onaylı Düzenleme (Human-in-the-Loop):**
Kullanıcı, OCR, transkripsiyon ve sadeleştirme çıktılarını inceleyebilir, gerekli düzeltmeleri yapabilir ve sonraki aşamaya onay vererek ilerleyebilir.
* 📱 **Uçtan Uca Mobil Deneyim:** React Native (Expo) ile geliştirilmiş, hızlı ve kullanıcı dostu arayüz.

## 🏗️ Sistem Mimarisi 
data/
└── raw/
    ├── ground_truth/
    │   ├── dergi_ornek_1.jpg   # Az önce gösterdiğin çevirili dergi görseli
    │   └── dergi_ornek_1.txt   # O dergi sayfasının sağındaki hazır Latin metni
    │
    └── unlabelled/
        ├── ham_dergi_sayfasi_1.jpg  # Sadece Osmanlıca metin olan dergi görseli
        └── ham_dergi_sayfasi_2.jpg


Image Enhancement Pipeline
Image
  │
Perspective Correction
  │
Deskew
  │
Grayscale
  │
CLAHE
  │
Threshold
  │
Enhanced Image

## 🛠️ Technologies

- Python 3.11
- OpenCV
- NumPy
- PyYAML
- Pytest
- Docker
- React Native
- Kraken OCR
- LLM

## 📒 Experiments

Image enhancement experiments are available in:

notebooks/01_image_enhancement/

## 🚀 Kurulum

```bash
git clone <repo-url>
cd Osmanl-caCeviri
```

Sanal ortam oluşturun:

```bash
python -m venv .venv
```

Aktifleştirin:

```powershell
.venv\Scripts\Activate.ps1
```

Bağımlılıkları yükleyin:

```bash
pip install -r requirements.txt
```

Docker ile çalıştırmak için:

```bash
docker compose build
docker compose up
```