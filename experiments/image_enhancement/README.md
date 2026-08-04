# Image Enhancement Experiments

This directory contains experiment scripts for the image enhancement module.

## Purpose

The experiment scripts are used to:

- Run the complete image enhancement pipeline on a folder of images.
- Compare different enhancement stages.
- Generate images that can be used in reports and presentations.

---

## Run the Complete Pipeline

This script applies the complete image enhancement pipeline to all supported images in the input directory.

Command:

```bash
python -m experiments.image_enhancement.run_pipeline
```

Input directory:

```text
data/raw/ground_truth/
```

Output directory:

```text
data/processed/image_enhancement/
```

Supported image formats:

- PNG
- JPG
- JPEG
- TIFF
- BMP

---

## Compare Enhancement Stages

This script generates comparison images for the following stages:

- Original
- Grayscale
- CLAHE
- Otsu Threshold
- Adaptive Threshold

Command:

```bash
python -m experiments.image_enhancement.compare_thresholds
```

Input image:

```text
data/raw/ground_truth/sample_01.png
```

Output directory:

```text
data/processed/comparisons/
```

Generated files:

```text
01_original.png
02_grayscale.png
03_clahe.png
04_otsu.png
05_adaptive.png
pipeline_comparison.png
```

---

## Notes

- All experiment scripts use the implementation under `src/image_enhancement/`.
- Image enhancement parameters are defined in `configs/image_enhancement.yaml`.
- The comparison script is intended for visual evaluation and documentation.

The image enhancement pipeline consists of the following stages:

1. Perspective Correction
2. Deskew
3. Grayscale Conversion
4. CLAHE Enhancement
5. Thresholding