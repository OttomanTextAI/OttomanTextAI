"""Automatic document orientation correction."""

import cv2
import numpy as np

from src.image_enhancement.text_region import (
    detect_text_regions,
)

from src.image_enhancement.foreground_text import (
    classify_text_regions,
)


SUPPORTED_ANGLES = (
    0,
    90,
    180,
    270,
)


def _rotate_image(
    image: np.ndarray,
    angle: int,
) -> np.ndarray:
    """Rotate image by a multiple of 90 degrees."""

    if angle == 0:
        return image.copy()

    if angle == 90:
        return cv2.rotate(
            image,
            cv2.ROTATE_90_CLOCKWISE,
        )

    if angle == 180:
        return cv2.rotate(
            image,
            cv2.ROTATE_180,
        )

    if angle == 270:
        return cv2.rotate(
            image,
            cv2.ROTATE_90_COUNTERCLOCKWISE,
        )

    raise ValueError(
        "angle must be one of: "
        "0, 90, 180, 270"
    )


def _calculate_text_layout_score(
    image: np.ndarray,
) -> float:
    """
    Score how strongly an image resembles a normally
    oriented document with horizontal text lines.

    Higher score means more likely to be correctly oriented.
    """

    regions = detect_text_regions(
        image
    )

    if not regions:
        return 0.0

    classified_regions = classify_text_regions(
        image,
        regions,
    )

    total_score = 0.0
    valid_region_count = 0

    for result in classified_regions:

        classification = result[
            "classification"
        ]

        if classification == "weak":
            continue

        combined_score = float(
            result["combined_score"]
        )

        x, y, region_width, region_height = (
            result["region"]
        )

        aspect_ratio = (
            region_width
            / max(region_height, 1)
        )

        # Normal text lines are usually wider
        # than they are tall.
        horizontal_bonus = min(
            max(aspect_ratio, 0.25),
            6.0,
        )

        if classification == "foreground":
            class_weight = 1.30

        elif classification == "faint_text":
            class_weight = 1.00

        elif classification == "very_faint_text":
            class_weight = 0.60

        else:
            continue

        region_score = (
            combined_score
            * class_weight
            * horizontal_bonus
        )

        total_score += region_score
        valid_region_count += 1

    if valid_region_count == 0:
        return 0.0

    # Reward orientations that contain several
    # plausible text regions, without letting
    # region count dominate the score.
    count_bonus = min(
        valid_region_count / 10.0,
        1.5,
    )

    return float(
        total_score
        * (1.0 + 0.15 * count_bonus)
    )


def _calculate_orientation_confidence(
    best_score: float,
    second_score: float,
) -> float:
    """
    Calculate orientation confidence in range 0-1.

    A larger difference between the best and second-best
    orientations produces higher confidence.
    """

    if best_score <= 0:
        return 0.0

    difference = (
        best_score
        - second_score
    )

    confidence = (
        difference
        / max(best_score, 1e-6)
    )

    return float(
        np.clip(
            confidence,
            0.0,
            1.0,
        )
    )

def _calculate_uprightness_score(
    image: np.ndarray,
) -> float:
    """
    Estimate whether horizontally arranged Arabic/Ottoman
    text is upright or upside down.

    Arabic-script text usually has its main baseline
    slightly below the vertical center of a text line.
    """

    regions = detect_text_regions(
        image
    )

    if not regions:
        return 0.0

    classified_regions = classify_text_regions(
        image,
        regions,
    )

    if image.ndim == 3:
        grayscale = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = image.copy()

    total_score = 0.0
    total_weight = 0.0

    for result in classified_regions:

        classification = result[
            "classification"
        ]

        if classification == "weak":
            continue

        x, y, width, height = result[
            "region"
        ]

        # Only use reasonably horizontal text regions.
        aspect_ratio = (
            width
            / max(height, 1)
        )

        if (
            aspect_ratio < 1.8
            or height < 12
        ):
            continue

        crop = grayscale[
            y:y + height,
            x:x + width,
        ]

        if crop.size == 0:
            continue

        binary = cv2.adaptiveThreshold(
            crop,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            15,
            7,
        )

        # Ignore the outer border of the region.
        margin_y = max(
            1,
            int(height * 0.10),
        )

        if height > 2 * margin_y:
            binary[
                :margin_y,
                :
            ] = 0

            binary[
                height - margin_y:,
                :
            ] = 0

        row_projection = np.sum(
            binary > 0,
            axis=1,
        ).astype(
            np.float32
        )

        if np.max(row_projection) <= 0:
            continue

        baseline_row = int(
            np.argmax(
                row_projection
            )
        )

        normalized_position = (
            baseline_row
            / max(height - 1, 1)
        )

        # Upright Arabic text tends to have the strongest
        # horizontal body slightly below the center.
        #
        # Positive -> likely upright
        # Negative -> likely upside down
        region_uprightness = (
            normalized_position
            - 0.50
        )

        combined_score = float(
            result["combined_score"]
        )

        weight = (
            combined_score
            * min(
                aspect_ratio,
                6.0,
            )
        )

        total_score += (
            region_uprightness
            * weight
        )

        total_weight += weight

    if total_weight <= 0:
        return 0.0

    return float(
        total_score
        / total_weight
    )

def correct_document_orientation(
    image: np.ndarray,
    minimum_axis_confidence: float = 0.12,
) -> tuple[np.ndarray, int, float]:
    """
    Detect and correct document orientation.

    Stage 1:
        Decide whether text belongs to the
        0/180 or 90/270 orientation family.

    Stage 2:
        Choose the stronger direction inside
        the winning family.

    Returns:
        corrected_image,
        selected_angle,
        axis_confidence
    """

    orientation_results = {}

    for angle in SUPPORTED_ANGLES:

        rotated_image = _rotate_image(
            image,
            angle,
        )

        score = _calculate_text_layout_score(
            rotated_image
        )

        orientation_results[angle] = {
            "image": rotated_image,
            "score": score,
        }

    scores = {
        angle: orientation_results[
            angle
        ]["score"]
        for angle in SUPPORTED_ANGLES
    }

    # -----------------------------------------
    # Stage 1: orientation axis
    # -----------------------------------------

    upright_family_score = max(
        _calculate_axis_score(
            orientation_results[0]["image"]
        ),
        _calculate_axis_score(
            orientation_results[180]["image"]
        ),
    )

    sideways_family_score = max(
        _calculate_axis_score(
            orientation_results[90]["image"]
        ),
        _calculate_axis_score(
            orientation_results[270]["image"]
        ),
    )


    best_family_score = max(
        upright_family_score,
        sideways_family_score,
    )

    family_difference = abs(
        upright_family_score
        - sideways_family_score
    )

    if best_family_score > 0:
        axis_confidence = (
            family_difference
            / best_family_score
        )
    else:
        axis_confidence = 0.0

    # -----------------------------------------
    # Stage 2: direction inside selected family
    # -----------------------------------------

    if sideways_family_score > upright_family_score:

        first_angle = 90
        second_angle = 270

    else:

        first_angle = 0
        second_angle = 180

# -----------------------------------------
    # Stage 2: determine which side is UP
    # -----------------------------------------

    first_image = orientation_results[
        first_angle
    ]["image"]

    second_image = orientation_results[
        second_angle
    ]["image"]

    first_uprightness = _calculate_uprightness_score(
        first_image
    )

    second_uprightness = _calculate_uprightness_score(
        second_image
    )

    # Compare the two candidate directions directly.
    uprightness_difference = (
        first_uprightness
        - second_uprightness
    )

    # Layout score is used only as supporting evidence.
    first_layout_score = float(
        scores[first_angle]
    )

    second_layout_score = float(
        scores[second_angle]
    )

    layout_scale = max(
        abs(first_layout_score),
        abs(second_layout_score),
        1e-6,
    )

    layout_difference = (
        first_layout_score
        - second_layout_score
    ) / layout_scale

    # Uprightness remains the main evidence.
    # Layout score is only a tie-breaker/supporting signal.
    direction_score = (
        0.75 * uprightness_difference
        + 0.25 * layout_difference
    )

    if direction_score >= 0:
        selected_angle = first_angle
        other_angle = second_angle
    else:
        selected_angle = second_angle
        other_angle = first_angle

    direction_confidence = min(
        abs(direction_score) * 4.0,
        1.0,
    )


    print(
        "[ORIENTATION SCORES]",
        {
            angle: round(
                scores[angle],
                3,
            )
            for angle in SUPPORTED_ANGLES
        },
        flush=True,
    )

    print(
        "[ORIENTATION AXIS]",
        {
            "0/180": round(
                upright_family_score,
                3,
            ),
            "90/270": round(
                sideways_family_score,
                3,
            ),
            "confidence": round(
                axis_confidence,
                3,
            ),
        },
        flush=True,
    )

    print(
    "[ORIENTATION DIRECTION]",
    {
        "selected_angle": selected_angle,
        "layout_90_or_0": round(
            scores[first_angle],
            3,
        ),
        "layout_270_or_180": round(
            scores[second_angle],
            3,
        ),
        "upright_first": round(
            first_uprightness,
            4,
        ),
        "upright_second": round(
            second_uprightness,
            4,
        ),
        "layout_difference": round(
            layout_difference,
            4,
        ),
        "direction_score": round(
            direction_score,
            4,
        ),
        "confidence": round(
            direction_confidence,
            3,
        ),
    },
    flush=True,
)

    # If even the axis is uncertain, do not rotate.
    if axis_confidence < minimum_axis_confidence:

        print(
            "[ORIENTATION] Axis uncertain. "
            "Keeping original orientation.",
            flush=True,
        )

        return (
            image.copy(),
            0,
            axis_confidence,
        )


    corrected_image = orientation_results[
        selected_angle
    ]["image"]

    print(
        "[ORIENTATION] selected:",
        selected_angle,
        "degrees",
        flush=True,
    )

    if direction_confidence < 0.05:
        print(
            "[ORIENTATION] Direction confidence is low; "
            "90/270 or 0/180 distinction is ambiguous.",
            flush=True,
        )

    return (
        corrected_image,
        selected_angle,
        axis_confidence,
    )

def _prepare_orientation_mask(
    image: np.ndarray,
) -> np.ndarray:
    """
    Create a text-focused binary mask for orientation analysis.

    Large stains, borders, and isolated components are removed so
    orientation estimation is driven mainly by text structures.
    """
    if image.ndim == 3:
        grayscale = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = image.copy()

    blurred = cv2.GaussianBlur(
        grayscale,
        (3, 3),
        0,
    )

    binary = cv2.adaptiveThreshold(
        blurred,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        31,
        15,
    )

    height, width = binary.shape
    image_area = height * width

    component_count, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
    )

    # A real document photo can have many hundreds of connected components
    # (every letter stroke/diacritic counts). Looping over each one and
    # doing `labels == label` re-scans the *entire* image per component —
    # this alone was ~5s per call and, run 4x per request (once per
    # rotation candidate), was the dominant cost of the whole enhance
    # pipeline. Building one keep/reject mask over all labels at once and
    # applying it in a single vectorized pass does the same filtering in
    # a fraction of the time.
    areas = stats[:, cv2.CC_STAT_AREA]
    widths = stats[:, cv2.CC_STAT_WIDTH]
    heights = stats[:, cv2.CC_STAT_HEIGHT]

    keep_label_mask = (
        (areas >= 5)
        & (areas <= image_area * 0.03)
        & (widths <= width * 0.85)
        & (heights <= height * 0.85)
    )
    keep_label_mask[0] = False  # label 0 is the background

    kept_labels = np.flatnonzero(keep_label_mask)

    cleaned = np.where(
        np.isin(labels, kept_labels),
        np.uint8(255),
        np.uint8(0),
    )

    return cleaned

def _calculate_axis_score(
    image: np.ndarray,
) -> float:
    """
    Estimate whether document text is predominantly horizontal.

    Horizontal text produces stronger row-wise projection peaks,
    while sideways text produces stronger column-wise peaks.

    Higher values indicate a normal 0/180 text axis.
    """

    binary = _prepare_orientation_mask(
        image
    )

    row_projection = np.sum(
        binary > 0,
        axis=1,
    ).astype(np.float32)

    column_projection = np.sum(
        binary > 0,
        axis=0,
    ).astype(np.float32)

    # Projection variation indicates how strongly pixels
    # form repeated horizontal/vertical text bands.
    row_mean = float(
        np.mean(row_projection)
    )

    column_mean = float(
        np.mean(column_projection)
    )

    row_variation = float(
        np.std(row_projection)
        / max(row_mean, 1e-6)
    )

    column_variation = float(
        np.std(column_projection)
        / max(column_mean, 1e-6)
    )

    return (
        row_variation
        / max(column_variation, 1e-6)
    )