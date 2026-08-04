# Setup Guide

This document explains how to set up and run the Smart Ottoman Assistant project.

---

# Prerequisites

Before running the project, make sure the following software is installed:

- Python 3.11
- Git
- Docker Desktop
- Docker Compose
- WSL2 (Windows)

---

# Clone the Repository

```bash
git clone <repository-url>
cd Osmanl-caCeviri
```

---

# Local Installation

Create a virtual environment:

```bash
python -m venv .venv
```

Activate the environment (Windows PowerShell):

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

---

# Run Unit Tests

```bash
pytest
```

Expected result:

```
4 passed
```

---

# Run with Docker

Build the Docker image:

```bash
docker compose build
```

Run the image enhancement pipeline:

```bash
docker compose up
```

Stop and remove the container:

```bash
docker compose down
```

---

# Output

Processed images are saved in:

```
data/processed/image_enhancement/
```

---

# Image Enhancement Pipeline

The preprocessing pipeline consists of the following steps:

```
Perspective Correction
        ↓
Deskew
        ↓
Grayscale
        ↓
CLAHE
        ↓
Thresholding
```

Configuration parameters are stored in:

```
configs/image_enhancement.yaml
```

---

# Project Structure

```
src/image_enhancement/
│
├── preprocess.py
├── enhance.py
├── threshold.py
├── deskew.py
├── perspective.py
└── utils.py

configs/
└── image_enhancement.yaml

experiments/
└── image_enhancement/

tests/
└── test_image_enhancement.py
```

---

# Docker Notes

Docker image:

```
osmanl-caceviri-image-enhancement
```

Useful commands:

```bash
docker compose build
docker compose up
docker compose down
```