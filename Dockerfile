FROM python:3.10-slim

WORKDIR /app

# Kraken ve gerekli sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir kraken jiwer pyyaml

COPY . .

CMD ["python", "-u", "src/ocr_htr/train.py"]