"""Foreground-text scoring for degraded document images."""

import cv2
import numpy as np

import time

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
    analysis: dict,
) -> float:
    """
    Measure how continuously foreground content is distributed
    across the horizontal extent of a candidate region.
    """

    binary = analysis["binary"]

    if binary is None or binary.size == 0:
        return 0.0

    column_density = (
        np.count_nonzero(binary, axis=0)
        / max(1, binary.shape[0])
    )

    active_columns = (
        column_density >= 0.08
    )

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

    grayscale = _to_grayscale(image)

    analysis_total = 0.0
    features_total = 0.0
    structure_total = 0.0
    alignment_total = 0.0
    repetition_total = 0.0
    coverage_total = 0.0

    for region in regions:

        t = time.perf_counter()

        analysis = analyze_region_components(
            grayscale,
            region,
        )

        analysis_total += (
            time.perf_counter() - t
        )


        t = time.perf_counter()

        features = calculate_region_features(
            grayscale,
            region,
        )

        features_total += (
            time.perf_counter() - t
        )


        score = calculate_foreground_score(
            features
        )


        t = time.perf_counter()

        structure_score = calculate_text_structure_score(
            analysis,
        )

        structure_total += (
            time.perf_counter() - t
        )


        t = time.perf_counter()

        line_alignment_score = calculate_line_alignment_score(
            analysis,
        )

        alignment_total += (
            time.perf_counter() - t
        )


        t = time.perf_counter()

        repetition_score = calculate_repetition_score(
            analysis,
        )

        repetition_total += (
            time.perf_counter() - t
        )


        t = time.perf_counter()

        horizontal_ink_coverage = calculate_horizontal_ink_coverage(
            analysis,
        )

        coverage_total += (
            time.perf_counter() - t
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

    print(
        f"[CLASSIFY] analysis: {analysis_total:.3f}s",
        flush=True,
    )

    print(
        f"[CLASSIFY] features: {features_total:.3f}s",
        flush=True,
    )

    print(
        f"[CLASSIFY] structure: {structure_total:.3f}s",
        flush=True,
    )

    print(
        f"[CLASSIFY] alignment: {alignment_total:.3f}s",
        flush=True,
    )

    print(
        f"[CLASSIFY] repetition: {repetition_total:.3f}s",
        flush=True,
    )

    print(
        f"[CLASSIFY] coverage: {coverage_total:.3f}s",
        flush=True,
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

        horizontal_ink_coverage = result[
            "horizontal_ink_coverage"
        ]

        features = result["features"]

        edge_density = features["edge_density"]
        dark_pixel_ratio = features["dark_pixel_ratio"]

        x, y, region_width, region_height = result["region"]

        aspect_ratio = (
            region_width
            / max(region_height, 1)
        )

        print(
            "[REGION DEBUG]",
            {
                "combined": round(combined_score, 3),
                "structure": round(structure_score, 3),
                "alignment": round(alignment_score, 3),
                "repetition": round(repetition_score, 3),
                "edge": round(edge_density, 3),
                "dark": round(dark_pixel_ratio, 3),
                "aspect": round(aspect_ratio, 3),
                "coverage": round(
                    result["horizontal_ink_coverage"],
                    3,
                ),
            },
            flush=True,
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
    analysis: dict,
) -> float:

    crop = analysis["crop"]
    component_count = analysis[
        "component_count"
    ]
    statistics = analysis[
        "statistics"
    ]

    if (
        crop.size == 0
        or statistics is None
    ):
        return 0.0

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

        component_width = statistics[
            label_index,
            cv2.CC_STAT_WIDTH,
        ]

        component_height = statistics[
            label_index,
            cv2.CC_STAT_HEIGHT,
        ]

        if area < 2:
            continue

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
            / max(
                1.0,
                crop.shape[1] * 0.7,
            ),
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
    analysis: dict,
) -> float:

    crop = analysis["crop"]
    component_count = analysis[
        "component_count"
    ]
    statistics = analysis[
        "statistics"
    ]

    if (
        crop.size == 0
        or statistics is None
    ):
        return 0.0

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

        components.append(
            {
                "left": left,
                "top": top,
                "width": component_width,
                "height": component_height,
                "bottom": (
                    top + component_height
                ),
                "center_x": (
                    left
                    + component_width / 2
                ),
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

    mean_width = max(
        1.0,
        float(
            np.mean(widths)
        ),
    )

    mean_height = max(
        1.0,
        float(
            np.mean(heights)
        ),
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
    analysis: dict,
) -> float:

    crop = analysis["crop"]
    component_count = analysis[
        "component_count"
    ]
    statistics = analysis[
        "statistics"
    ]

    if (
        crop.size == 0
        or statistics is None
    ):
        return 0.0

    if component_count <= 4:
        return 0.0

    crop_area = (
        crop.shape[0]
        * crop.shape[1]
    )

    widths = []
    heights = []
    areas = []
    centers_x = []
    centers_y = []

    for label_index in range(
        1,
        component_count,
    ):
        area = statistics[
            label_index,
            cv2.CC_STAT_AREA,
        ]

        if area < 2:
            continue

        if area > crop_area * 0.30:
            continue

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

        widths.append(
            component_width
        )

        heights.append(
            component_height
        )

        areas.append(
            area
        )

        centers_x.append(
            left
            + component_width / 2
        )

        centers_y.append(
            top
            + component_height / 2
        )

    if len(widths) < 4:
        return 0.0

    widths = np.asarray(
        widths,
        dtype=np.float32,
    )

    heights = np.asarray(
        heights,
        dtype=np.float32,
    )

    areas = np.asarray(
        areas,
        dtype=np.float32,
    )

    centers_x = np.asarray(
        centers_x,
        dtype=np.float32,
    )

    centers_y = np.asarray(
        centers_y,
        dtype=np.float32,
    )

    # -------------------------------------------------
    # Pairwise similarity matrices
    # -------------------------------------------------

    width_min = np.minimum(
        widths[:, None],
        widths[None, :],
    )

    width_max = np.maximum(
        widths[:, None],
        widths[None, :],
    )

    width_ratio = (
        width_min
        / np.maximum(
            width_max,
            1.0,
        )
    )

    height_min = np.minimum(
        heights[:, None],
        heights[None, :],
    )

    height_max = np.maximum(
        heights[:, None],
        heights[None, :],
    )

    height_ratio = (
        height_min
        / np.maximum(
            height_max,
            1.0,
        )
    )

    area_min = np.minimum(
        areas[:, None],
        areas[None, :],
    )

    area_max = np.maximum(
        areas[:, None],
        areas[None, :],
    )

    area_ratio = (
        area_min
        / np.maximum(
            area_max,
            1.0,
        )
    )

    vertical_distance = np.abs(
        centers_y[:, None]
        - centers_y[None, :]
    )

    similar_matrix = (
        (width_ratio >= 0.65)
        & (height_ratio >= 0.65)
        & (area_ratio >= 0.50)
        & (vertical_distance <= 12)
    )

    best_score = 0.0

    for base_index in range(
        len(widths)
    ):
        similar_indices = np.flatnonzero(
            similar_matrix[
                base_index
            ]
        )

        if len(similar_indices) < 3:
            continue

        similar_centers_x = np.sort(
            centers_x[
                similar_indices
            ]
        )

        gaps = np.diff(
            similar_centers_x
        )

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
                len(similar_indices) / 5.0,
                0.0,
                1.0,
            )
        )

        candidate_score = (
            0.55 * count_score
            + 0.45
            * spacing_regularity_score
        )

        if candidate_score > best_score:
            best_score = (
                candidate_score
            )

    return float(
        np.clip(
            best_score,
            0.0,
            1.0,
        )
    )
def analyze_region_components(
    grayscale: np.ndarray,
    region: tuple[int, int, int, int],
) -> dict:
    x, y, width, height = region

    crop = grayscale[
        y:y + height,
        x:x + width,
    ]

    if crop.size == 0:
        return {
            "crop": crop,
            "binary": None,
            "statistics": None,
            "component_count": 0,
        }

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

    return {
        "crop": crop,
        "binary": binary,
        "statistics": statistics,
        "component_count": component_count,
    }