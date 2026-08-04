# Docker Notes

## Docker Desktop
Docker Desktop açık olmalı.

## Build
Dockerfile veya requirements.txt değişirse:

```bash
docker compose build
```

## Run

```bash
docker compose up
```

## Stop

```bash
docker compose down
```

## Docker sürümü kontrolü

```bash
docker --version
docker compose version
```

## VS Code docker komutunu görmüyorsa

Geçici çözüm:

```powershell
$env:Path += ";C:\Users\SİNEM SARIÇİÇEK\AppData\Local\Programs\DockerDesktop\resources\bin"
```

Kalıcı çözüm:
- VS Code'u tamamen kapatıp yeniden aç.
- Gerekirse PATH değişkenine Docker Desktop'ın bin klasörünü ekle.

## Build başarılıysa görülecek çıktı

```
✔ Image osmanl-caceviri-image-enhancement Built
```

## Çalışma başarılıysa görülecek çıktı

```
image-enhancement exited with code 0
```

Bu hata değildir.
Program başarıyla çalışıp işlemini bitirmiştir.

## Uyarı

```
the attribute `version` is obsolete
```

Hata değildir.
İstenirse docker-compose.yml içindeki

version: "3.x"

satırı silinebilir.