"""Foreground-text scoring for degraded document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


def _to_grayscale(
    image: np.ndarray,
) -> np.ndarray:
    """Convert an input image to 2D grayscale."""
    validate_image(image)

    if image.ndim == 2:
        return image.copy()

    if is_grayscale(image):
        return image.squeeze(axis=2).copy()

    if image.shape[2] == 4:
        return cv2.cvtColor(
            image,
            cv2.COLOR_BGRA2GRAY,
        )

    return cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )


def calculate_region_features(
    image: np.ndarray,
    region: tuple[int, int, int, int],
) -> dict[str, float]:
    """
    Calculate visual features for a candidate text region.

    Args:
        image: Input document image.
        region: Region as (x, y, width, height).

    Returns:
        Dictionary containing local contrast, edge density,
        sharpness and dark-pixel ratio.
    """
    grayscale = _to_grayscale(
        image
    )

    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return {
            "contrast": 0.0,
            "edge_density": 0.0,
            "sharpness": 0.0,
            "dark_pixel_ratio": 0.0,
        }

    contrast = float(
        np.std(crop)
    )

    edges = cv2.Canny(
        crop,
        50,
        150,
    )

    edge_density = float(
        np.count_nonzero(edges)
        / edges.size
    )

    laplacian = cv2.Laplacian(
        crop,
        cv2.CV_64F,
    )

    sharpness = float(
        laplacian.var()
    )

    threshold_value = float(
        np.mean(crop)
        - np.std(crop)
    )

    dark_pixel_ratio = float(
        np.count_nonzero(
            crop < threshold_value
        )
        / crop.size
    )

    return {
        "contrast": contrast,
        "edge_density": edge_density,
        "sharpness": sharpness,
        "dark_pixel_ratio": dark_pixel_ratio,
    }


def calculate_horizontal_ink_coverage(
    image: np.ndarray,
    region: tuple[int, int, int, int],
) -> float:
    """
    Measure how continuously dark foreground content is distributed
    across the horizontal extent of a candidate region.

    Real text lines usually contain foreground pixels across a
    substantial portion of their width, while stains and isolated
    artifacts often occupy only a few columns.
    """
    grayscale = _to_grayscale(image)

    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return 0.0

    _, binary = cv2.threshold(
        crop,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    # Her sütunda kaç foreground pixel var?
    column_density = (
        np.count_nonzero(binary, axis=0)
        / max(1, binary.shape[0])
    )

    # Tek bir noise pixelini "text var" diye kabul etmiyoruz.
    active_columns = column_density >= 0.08

    coverage = float(
        np.count_nonzero(active_columns)
        / max(1, binary.shape[1])
    )

    return float(
        np.clip(
            coverage,
            0.0,
            1.0,
        )
    )


def calculate_foreground_score(
    features: dict[str, float],
) -> float:
    """
    Calculate a foreground-text confidence score.

    Higher scores indicate darker, sharper and structurally
    stronger text regions.

    Args:
        features: Region features returned by
            calculate_region_features().

    Returns:
        Foreground confidence score between 0 and 1.
    """
    contrast_score = np.clip(
        features["contrast"] / 60.0,
        0.0,
        1.0,
    )

    edge_score = np.clip(
        features["edge_density"] / 0.20,
        0.0,
        1.0,
    )

    sharpness_score = np.clip(
        features["sharpness"] / 1500.0,
        0.0,
        1.0,
    )

    darkness_score = np.clip(
        features["dark_pixel_ratio"] / 0.25,
        0.0,
        1.0,
    )

    score = (
        0.30 * contrast_score
        + 0.25 * edge_score
        + 0.30 * sharpness_score
        + 0.15 * darkness_score
    )

    return float(
        np.clip(
            score,
            0.0,
            1.0,
        )
    )


def classify_text_regions(
    image: np.ndarray,
    regions: list[tuple[int, int, int, int]],
    foreground_threshold: float | None = None,
) -> list[dict]:
    """
    Classify candidate regions using document-relative scoring.

    If foreground_threshold is None, the threshold is calculated
    automatically from the score distribution of the document.
    """
    results = []

    for region in regions:
        features = calculate_region_features(
            image,
            region,
        )

        score = calculate_foreground_score(
            features
        )

        structure_score = calculate_text_structure_score(
            image,
            region,
        )

        line_alignment_score = calculate_line_alignment_score(
            image,
            region,
        )

        repetition_score = calculate_repetition_score(
            image,
            region,
        )

        horizontal_ink_coverage = calculate_horizontal_ink_coverage(
            image,
            region,
        )
        combined_score = (
            0.45 * score
            + 0.25 * structure_score
            + 0.20 * line_alignment_score
            + 0.10 * (1.0 - repetition_score)
        )
        
        results.append(
            {
                "region": region,
                "score": score,
                "combined_score": combined_score,
                "structure_score": structure_score,
                "line_alignment_score": line_alignment_score,
                "features": features,
                "repetition_score": repetition_score,
                "horizontal_ink_coverage": horizontal_ink_coverage,
            }
        )

    if not results:
        return []

    scores = np.array(
        [
            result["combined_score"]
            for result in results
        ],
        dtype=np.float32,
    )

    if foreground_threshold is None:
        median_score = float(
            np.median(scores)
        )

        score_std = float(
            np.std(scores)
        )

        foreground_threshold = (
            median_score
            + 0.45 * score_std
        )

    for result in results:
        combined_score = result["combined_score"]
        structure_score = result["structure_score"]
        alignment_score = result["line_alignment_score"]
        repetition_score = result["repetition_score"]

        features = result["features"]

        edge_density = features["edge_density"]
        dark_pixel_ratio = features["dark_pixel_ratio"]

        x, y, region_width, region_height = result["region"]

        aspect_ratio = (
            region_width
            / max(region_height, 1)
        )

        # -------------------------------------------------
        # 1. Güçlü foreground text
        # -------------------------------------------------

        if combined_score >= foreground_threshold:
            classification = "foreground"

        # -------------------------------------------------
        # 2. Soluk fakat yapısal olarak gerçek metin
        # -------------------------------------------------

        elif (
            combined_score >= 0.48
            and structure_score >= 0.40
            and alignment_score >= 0.38
            and repetition_score <= 0.82
            and edge_density >= 0.015
            and dark_pixel_ratio >= 0.015
            and aspect_ratio >= 2.0
        ):
            classification = "faint_text"

        # -------------------------------------------------
        # 3. Geri kalan belirsiz / artifact bölgeler
        # -------------------------------------------------

        else:
            classification = "weak"

        result["classification"] = classification
        result["threshold"] = foreground_threshold

    return results

def calculate_text_structure_score(
    image: np.ndarray,
    region: tuple[int, int, int, int],
) -> float:
    """
    Estimate how strongly a region resembles a text structure.

    The score uses connected-component count, component-size consistency,
    and horizontal distribution.

    Args:
        image: Input document image.
        region: Region as (x, y, width, height).

    Returns:
        Text-structure score between 0 and 1.
    """
    grayscale = _to_grayscale(
        image
    )

    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return 0.0

    _, binary = cv2.threshold(
        crop,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    component_count, _, statistics, _ = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
    )

    component_widths = []
    component_heights = []
    component_centers_x = []

    crop_area = (
        crop.shape[0]
        * crop.shape[1]
    )

    for label_index in range(
        1,
        component_count,
    ):
        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        left = statistics[
            label_index,
            cv2.CC_STAT_LEFT,
        ]

        top = statistics[
            label_index,
            cv2.CC_STAT_TOP,
        ]

        component_width = statistics[
            label_index,
            cv2.CC_STAT_WIDTH,
        ]

        component_height = statistics[
            label_index,
            cv2.CC_STAT_HEIGHT,
        ]

 

        # Çok küçük tek-piksel gürültüyü hesaba katma.
        if area < 2:
            continue

        # Bölgenin büyük kısmını kaplayan yapı muhtemelen
        # çizgi, çerçeve veya leke.
        if area > crop_area * 0.35:
            continue

        component_widths.append(
            component_width
        )

        component_heights.append(
            component_height
        )

        component_centers_x.append(
            left + component_width / 2
        )

    valid_component_count = len(
        component_widths
    )

    if valid_component_count < 2:
        return 0.0

    # 1. Component sayısı
    component_count_score = float(
        np.clip(
            valid_component_count / 12.0,
            0.0,
            1.0,
        )
    )

    heights = np.array(
        component_heights,
        dtype=np.float32,
    )

    mean_height = float(
        np.mean(heights)
    )

    if mean_height > 0:
        height_variation = float(
            np.std(heights)
            / mean_height
        )
    else:
        height_variation = 1.0

    # Gerçek yazıda karakter yükseklikleri tamamen aynı
    # değildir ama aşırı düzensiz de olmaz.
    height_consistency_score = float(
        np.clip(
            1.0 - height_variation,
            0.0,
            1.0,
        )
    )

    centers_x = np.array(
        component_centers_x,
        dtype=np.float32,
    )

    horizontal_span = float(
        centers_x.max()
        - centers_x.min()
    )

    horizontal_coverage_score = float(
        np.clip(
            horizontal_span
            / max(1.0, crop.shape[1] * 0.7),
            0.0,
            1.0,
        )
    )

    score = (
        0.40 * component_count_score
        + 0.30 * height_consistency_score
        + 0.30 * horizontal_coverage_score
    )

    return float(
        np.clip(
            score,
            0.0,
            1.0,
        )
    )

def calculate_line_alignment_score(
    image: np.ndarray,
    region: tuple[int, int, int, int],
) -> float:
    """
    Estimate whether connected components form a natural text line.

    The score considers:
    - baseline consistency,
    - vertical alignment,
    - horizontal spread,
    - component-size diversity.

    Repetitive decorative shapes may be well aligned, but usually have
    unusually uniform component dimensions. The diversity term reduces
    their score.

    Args:
        image: Input document image.
        region: Region as (x, y, width, height).

    Returns:
        Text-line alignment score between 0 and 1.
    """
    grayscale = _to_grayscale(
        image
    )

    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return 0.0

    _, binary = cv2.threshold(
        crop,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    component_count, _, statistics, _ = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
    )

    components = []

    crop_area = crop.shape[0] * crop.shape[1]

    for label_index in range(
        1,
        component_count,
    ):
        left = statistics[
            label_index,
            cv2.CC_STAT_LEFT,
        ]

        top = statistics[
            label_index,
            cv2.CC_STAT_TOP,
        ]

        component_width = statistics[
            label_index,
            cv2.CC_STAT_WIDTH,
        ]

        component_height = statistics[
            label_index,
            cv2.CC_STAT_HEIGHT,
        ]

        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        if area < 2:
            continue

        # Çok büyük çizgi/leke benzeri component'ları dışarıda bırak.
        if area > crop_area * 0.30:
            continue

        components.append(
            {
                "left": left,
                "top": top,
                "width": component_width,
                "height": component_height,
                "bottom": top + component_height,
                "center_x": left + component_width / 2,
                "area": area,
            }
        )

    if len(components) < 3:
        return 0.0

    bottoms = np.array(
        [
            component["bottom"]
            for component in components
        ],
        dtype=np.float32,
    )

    heights = np.array(
        [
            component["height"]
            for component in components
        ],
        dtype=np.float32,
    )

    widths = np.array(
        [
            component["width"]
            for component in components
        ],
        dtype=np.float32,
    )

    centers_x = np.array(
        [
            component["center_x"]
            for component in components
        ],
        dtype=np.float32,
    )

    # -------------------------------------------------
    # 1. Baseline consistency
    # -------------------------------------------------

    median_bottom = float(
        np.median(bottoms)
    )

    baseline_deviation = float(
        np.median(
            np.abs(
                bottoms - median_bottom
            )
        )
    )

    median_height = max(
        1.0,
        float(
            np.median(heights)
        ),
    )

    normalized_baseline_deviation = (
        baseline_deviation
        / median_height
    )

    baseline_score = float(
        np.clip(
            1.0
            - normalized_baseline_deviation,
            0.0,
            1.0,
        )
    )

    # -------------------------------------------------
    # 2. Horizontal coverage
    # -------------------------------------------------

    horizontal_span = float(
        centers_x.max()
        - centers_x.min()
    )

    horizontal_coverage_score = float(
        np.clip(
            horizontal_span
            / max(
                1.0,
                crop.shape[1] * 0.65,
            ),
            0.0,
            1.0,
        )
    )

    # -------------------------------------------------
    # 3. Component size diversity
    #
    # Gerçek yazıda component boyutları belli ölçüde farklıdır.
    # Tekrarlanan süslerde ise component'lar aşırı benzer olabilir.
    # -------------------------------------------------

    mean_width = max(
        1.0,
        float(np.mean(widths)),
    )

    mean_height = max(
        1.0,
        float(np.mean(heights)),
    )

    width_variation = float(
        np.std(widths)
        / mean_width
    )

    height_variation = float(
        np.std(heights)
        / mean_height
    )

    average_size_variation = (
        width_variation
        + height_variation
    ) / 2.0

    diversity_score = float(
        np.clip(
            average_size_variation / 0.45,
            0.0,
            1.0,
        )
    )

    # -------------------------------------------------
    # 4. Çok düzenli tekrar cezası
    # -------------------------------------------------

    if (
        width_variation < 0.12
        and height_variation < 0.12
        and len(components) >= 4
    ):
        repetition_penalty = 0.45
    else:
        repetition_penalty = 1.0

    score = (
        0.45 * baseline_score
        + 0.25 * horizontal_coverage_score
        + 0.30 * diversity_score
    )

    score *= repetition_penalty

    return float(
        np.clip(
            score,
            0.0,
            1.0,
        )
    )

def calculate_repetition_score(
    image: np.ndarray,
    region: tuple[int, int, int, int],
) -> float:
    """
    Estimate how strongly a region contains repetitive decorative patterns.

    The score is based on:
    - component size similarity,
    - spacing regularity,
    - repeated horizontal arrangement.

    Higher values indicate stronger repetition and therefore a lower
    probability of natural text.

    Args:
        image: Input document image.
        region: Region as (x, y, width, height).

    Returns:
        Repetition score between 0 and 1.
    """
    grayscale = _to_grayscale(
        image
    )

    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return 0.0

    _, binary = cv2.threshold(
        crop,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    component_count, _, statistics, _ = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
    )

    components = []

    crop_area = (
        crop.shape[0]
        * crop.shape[1]
    )

    for label_index in range(
        1,
        component_count,
    ):
        left = statistics[
            label_index,
            cv2.CC_STAT_LEFT,
        ]

        top = statistics[
            label_index,
            cv2.CC_STAT_TOP,
        ]

        component_width = statistics[
            label_index,
            cv2.CC_STAT_WIDTH,
        ]

        component_height = statistics[
            label_index,
            cv2.CC_STAT_HEIGHT,
        ]

        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        if area < 2:
            continue

        if area > crop_area * 0.30:
            continue

        center_x = (
            left
            + component_width / 2
        )

        center_y = (
            top
            + component_height / 2
        )

        components.append(
            {
                "width": component_width,
                "height": component_height,
                "area": area,
                "center_x": center_x,
                "center_y": center_y,
            }
        )

    if len(components) < 4:
        return 0.0

    # Component'ları yatay konuma göre sırala
    components.sort(
        key=lambda item: item["center_x"]
    )

    best_score = 0.0

    for base in components:
        similar_components = []

        for candidate in components:
            width_ratio = (
                min(
                    base["width"],
                    candidate["width"],
                )
                / max(
                    base["width"],
                    candidate["width"],
                )
            )

            height_ratio = (
                min(
                    base["height"],
                    candidate["height"],
                )
                / max(
                    base["height"],
                    candidate["height"],
                )
            )

            area_ratio = (
                min(
                    base["area"],
                    candidate["area"],
                )
                / max(
                    base["area"],
                    candidate["area"],
                )
            )

            vertical_distance = abs(
                base["center_y"]
                - candidate["center_y"]
            )

            if (
                width_ratio >= 0.65
                and height_ratio >= 0.65
                and area_ratio >= 0.50
                and vertical_distance <= 12
            ):
                similar_components.append(
                    candidate
                )

        if len(similar_components) < 3:
            continue

        similar_components.sort(
            key=lambda item: item["center_x"]
        )

        centers_x = np.array(
            [
                item["center_x"]
                for item in similar_components
            ],
            dtype=np.float32,
        )

        gaps = np.diff(
            centers_x
        )

        if len(gaps) < 2:
            continue

        positive_gaps = gaps[
            gaps > 0
        ]

        if len(positive_gaps) < 2:
            continue

        mean_gap = float(
            np.mean(
                positive_gaps
            )
        )

        if mean_gap <= 0:
            continue

        gap_variation = float(
            np.std(
                positive_gaps
            )
            / mean_gap
        )

        spacing_regularity_score = float(
            np.clip(
                1.0
                - gap_variation / 0.50,
                0.0,
                1.0,
            )
        )

        count_score = float(
            np.clip(
                len(similar_components) / 5.0,
                0.0,
                1.0,
            )
        )

        candidate_score = (
            0.55 * count_score
            + 0.45 * spacing_regularity_score
        )

        best_score = max(
            best_score,
            candidate_score,
        )

    return float(
        np.clip(
            best_score,
            0.0,
            1.0,
        )
    )