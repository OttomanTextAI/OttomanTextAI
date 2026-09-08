"""Preprocessing pipelines for Ottoman document images."""

from pathlib import Path
from typing import Any
import gc
import time

import numpy as np
import cv2

from src.image_enhancement.deskew import deskew_image
from src.image_enhancement.perspective import correct_perspective


from src.common.config import load_yaml_config

from src.image_enhancement.bleed_through import (
    suppress_bleed_through,
)

from src.image_enhancement.line_removal import (
    remove_long_lines,
    remove_fold_lines_with_text_protection,
)

from src.image_enhancement.text_region import (
    crop_to_text_region,
    detect_text_regions,
)

from src.image_enhancement.foreground_text import (
    classify_text_regions,
)

from src.image_enhancement.text_mask import (
    create_pixel_text_mask,
    remove_long_artifacts_from_text_mask,
    restore_text_pixels_to_binary,
    restore_text_pixels_by_regions,
)


from src.image_enhancement.background import (
    normalize_background,
    suppress_stains,
)

from src.image_enhancement.morphology import (
    clean_binary_noise,
    remove_isolated_speckles,
    remove_isolated_speckles_v2,
    remove_isolated_speckles_v3,
    remove_isolated_speckles_v4,
)

from src.image_enhancement.enhance import (
    apply_clahe,
    convert_to_grayscale,
    reduce_noise,
)

from src.image_enhancement.threshold import (
    apply_adaptive_threshold,
    apply_otsu_threshold,
    apply_faint_text_threshold,
)

from src.image_enhancement.utils import (
    read_image,
    save_image,
)

from src.image_enhancement.orientation import (
    correct_document_orientation,
)


SUPPORTED_THRESHOLD_METHODS = {
    "otsu",
    "adaptive",
}

DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "configs"
    / "image_enhancement.yaml"
)

AUTO_PROFILES = (
    "printed",
    "printed-degraded",
    "delicate",
    "manuscript",
)

def _create_auto_preview(
    image: np.ndarray,
    max_long_edge: int = 1100,
) -> np.ndarray:
    height, width = image.shape[:2]
    long_edge = max(height, width)

    if long_edge <= max_long_edge:
        return image.copy()

    scale = max_long_edge / long_edge

    return cv2.resize(
        image,
        None,
        fx=scale,
        fy=scale,
        interpolation=cv2.INTER_AREA,
    )

def _score_enhancement_candidate(
    image: np.ndarray,
    reference_image: np.ndarray,
    return_details: bool = False,
) -> float | tuple[float, dict[str, float]]:
    """
    Score a preprocessing candidate.

    Higher score means:
    - original text strokes are preserved,
    - unnecessary new edges are avoided,
    - foreground amount stays close to the source document,
    - large black blobs are avoided,
    - connected components remain structurally reasonable.
    """

    # -------------------------------------------------
    # Convert candidate to grayscale
    # -------------------------------------------------
    if image.ndim == 3:
        grayscale = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        grayscale = image.copy()

    # -------------------------------------------------
    # Convert reference to grayscale
    # -------------------------------------------------
    if reference_image.ndim == 3:
        reference_gray = cv2.cvtColor(
            reference_image,
            cv2.COLOR_BGR2GRAY,
        )
    else:
        reference_gray = reference_image.copy()

    # Candidate may be upscaled by some profiles.
    # Resize only for comparison-based metrics.
    if grayscale.shape != reference_gray.shape:
        grayscale_for_compare = cv2.resize(
            grayscale,
            (
                reference_gray.shape[1],
                reference_gray.shape[0],
            ),
            interpolation=cv2.INTER_AREA,
        )
    else:
        grayscale_for_compare = grayscale

    # =================================================
    # 1. FOREGROUND CONSISTENCY
    # =================================================

    # Candidate foreground
    # Candidate binary at original output size.
    # This can still be useful for actual output-related checks.
    _, binary_inv = cv2.threshold(
        grayscale,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    # Candidate binary normalized to reference resolution.
    # Structural scoring must use this version so that
    # upscaled profiles are compared fairly.
    _, binary_inv_compare = cv2.threshold(
        grayscale_for_compare,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    foreground_ratio = float(
        np.mean(binary_inv > 0)
    )

    # Reference foreground
    _, reference_binary_inv = cv2.threshold(
        reference_gray,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    reference_foreground_ratio = float(
        np.mean(reference_binary_inv > 0)
    )

    # Compare candidate foreground with source foreground.
    #
    # A candidate should not lose most of the text
    # or create excessive foreground.
    if reference_foreground_ratio > 1e-6:
        foreground_relative_error = abs(
            foreground_ratio
            - reference_foreground_ratio
        ) / reference_foreground_ratio

        foreground_score = max(
            0.0,
            1.0 - foreground_relative_error,
        )
    else:
        foreground_score = (
            1.0
            if foreground_ratio < 0.015
            else 0.0
        )

    # Additional protection against obviously invalid
    # mostly-empty or mostly-black outputs.
    if foreground_ratio < 0.01:
        foreground_score *= (
            foreground_ratio / 0.01
        )

    if foreground_ratio > 0.45:
        foreground_score *= max(
            0.0,
            1.0 - (
                foreground_ratio - 0.45
            ) / 0.35,
        )

    foreground_score = float(
        np.clip(
            foreground_score,
            0.0,
            1.0,
        )
    )
   
    # =================================================
    # 2. EDGE PRESERVATION — PRECISION + RECALL + F1
    # =================================================

    _, reference_compare_binary = cv2.threshold(
        reference_gray,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )

    reference_edges = cv2.Canny(
        reference_compare_binary,
        50,
        150,
    )

    _, candidate_compare_binary = cv2.threshold(
        grayscale_for_compare,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )

    candidate_edges = cv2.Canny(
        candidate_compare_binary,
        50,
        150,
    )

    kernel = np.ones(
        (3, 3),
        dtype=np.uint8,
    )

    # Tolerance in both directions.
    candidate_edges_dilated = cv2.dilate(
        candidate_edges,
        kernel,
        iterations=1,
    )

    reference_edges_dilated = cv2.dilate(
        reference_edges,
        kernel,
        iterations=1,
    )

    reference_edge_pixels = (
        reference_edges > 0
    )

    candidate_edge_pixels = (
        candidate_edges > 0
    )

    reference_edge_count = int(
        np.count_nonzero(
            reference_edge_pixels
        )
    )

    candidate_edge_count = int(
        np.count_nonzero(
            candidate_edge_pixels
        )
    )

    # Recall:
    # How much of the original edge structure survived?
    if reference_edge_count > 0:
        preserved_reference_edges = (
            np.logical_and(
                reference_edge_pixels,
                candidate_edges_dilated > 0,
            )
        )

        edge_recall = float(
            np.count_nonzero(
                preserved_reference_edges
            )
            / reference_edge_count
        )
    else:
        edge_recall = 0.0

    # Precision:
    # How much of the candidate edge structure
    # corresponds to something in the source?
    if candidate_edge_count > 0:
        valid_candidate_edges = (
            np.logical_and(
                candidate_edge_pixels,
                reference_edges_dilated > 0,
            )
        )

        edge_precision = float(
            np.count_nonzero(
                valid_candidate_edges
            )
            / candidate_edge_count
        )
    else:
        edge_precision = 0.0

    # F1 prevents a profile from winning simply by
    # generating many additional edges.
    if (
        edge_precision
        + edge_recall
        > 1e-8
    ):
        edge_preservation_score = (
            2.0
            * edge_precision
            * edge_recall
            / (
                edge_precision
                + edge_recall
            )
        )
    else:
        edge_preservation_score = 0.0

    # =================================================
    # 3. CONNECTED COMPONENTS — CANDIDATE
    # =================================================

    num_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            binary_inv_compare,
            connectivity=8,
        )
    )

    image_area = float(
        binary_inv_compare.shape[0]
        * binary_inv_compare.shape[1]
    )

    if num_labels > 1:
        component_areas = stats[
            1:,
            cv2.CC_STAT_AREA,
        ]
    else:
        component_areas = np.array(
            [],
            dtype=np.int32,
        )

    # =================================================
    # 4. LARGE BLACK BLOB PENALTY
    # =================================================

    large_blob_area = 0.0
    max_component_ratio = 0.0

    if len(component_areas) > 0:
        max_component_ratio = float(
            np.max(component_areas)
            / image_area
        )

        large_components = component_areas[
            component_areas
            > image_area * 0.01
        ]

        large_blob_area = float(
            np.sum(large_components)
            / image_area
        )

    blob_score = 1.0

    if max_component_ratio > 0.035:
        blob_score -= min(
            (
                max_component_ratio
                - 0.035
            ) * 8.0,
            0.65,
        )

    if large_blob_area > 0.08:
        blob_score -= min(
            (
                large_blob_area
                - 0.08
            ) * 3.0,
            0.35,
        )

    blob_score = float(
        np.clip(
            blob_score,
            0.0,
            1.0,
        )
    )

    # =================================================
    # 5. COMPONENT STRUCTURE
    # =================================================

    if len(component_areas) > 0:
        character_like_components = (
            component_areas[
                (
                    component_areas >= 3
                )
                & (
                    component_areas
                    <= image_area * 0.003
                )
            ]
        )

        character_like_ratio = (
            len(character_like_components)
            / max(
                len(component_areas),
                1,
            )
        )
    else:
        character_like_components = np.array(
            [],
            dtype=np.int32,
        )

        character_like_ratio = 0.0

    # Candidate component quality.
    #
    # Unlike the old version, do not immediately
    # saturate at 1.0 around 70%.
    character_quality_score = float(
        np.clip(
            character_like_ratio,
            0.0,
            1.0,
        )
    )

    # -------------------------------------------------
    # Reference component count
    # -------------------------------------------------

    reference_num_labels, _, reference_stats, _ = (
        cv2.connectedComponentsWithStats(
            reference_binary_inv,
            connectivity=8,
        )
    )

    reference_component_count = max(
        reference_num_labels - 1,
        1,
    )

    candidate_component_count = max(
        num_labels - 1,
        0,
    )

    # Candidate and reference may have different dimensions
    # because some profiles upscale the output.
    #
    # Normalize component density by image area rather
    # than comparing raw component counts directly.
    if reference_component_count > 0:
        component_density_ratio = (
            candidate_component_count
            / reference_component_count
        )
    else:
        component_density_ratio = 0.0

        # Ideal density ratio is around 1.
        #
        # Allow moderate changes, but increasingly
        # penalize excessive fragmentation or merging.
    if 0.60 <= component_density_ratio <= 1.60:
        fragmentation_score = 1.0

    elif component_density_ratio < 0.60:
        fragmentation_score = max(
            0.0,
            component_density_ratio / 0.60,
        )

    else:
        fragmentation_score = max(
            0.0,
            1.0
            - (
                component_density_ratio
                - 1.60
            ) / 2.00,
        )

    fragmentation_score = float(
        np.clip(
            fragmentation_score,
            0.0,
            1.0,
        )
    )

    # Character-likeness alone should not be enough.
    # A fragmented candidate must also be penalized.
    component_score = (
        0.55 * character_quality_score
        + 0.45 * fragmentation_score
    )

    component_score = float(
        np.clip(
            component_score,
            0.0,
            1.0,
        )
    )

    # =================================================
    # FINAL SCORE
    # =================================================
    # Hard rejection for obviously broken candidates.
    # A mostly-black image with a huge connected blob
    # must never win automatic profile selection.
    if (
        foreground_ratio > 0.45
        and blob_score <= 0.05
    ):
        print(
            "[SCORE REJECTED]",
            {
                "reason": "mostly_black_large_blob",
                "foreground_ratio": round(
                    float(foreground_ratio),
                    4,
                ),
                "blob_score": round(
                    float(blob_score),
                    3,
                ),
            },
            flush=True,
        )

        if return_details:
            return 0.0, {
                "edge_f1": float(edge_preservation_score),
                "foreground": float(foreground_score),
                "blob": float(blob_score),
                "component": float(component_score),
                "character_ratio": float(character_like_ratio),
                "fragmentation": float(fragmentation_score),
                "component_density_ratio": float(component_density_ratio),
            }

        return 0.0

    final_score = (
        0.40 * edge_preservation_score
        + 0.20 * foreground_score
        + 0.25 * blob_score
        + 0.15 * component_score
    )

    print(
        "[SCORE DETAILS]",
        {
            "edge_f1": round(
                float(edge_preservation_score),
                3,
            ),
            "edge_precision": round(
                float(edge_precision),
                3,
            ),
            "edge_recall": round(
                float(edge_recall),
                3,
            ),

            "foreground": round(
                float(foreground_score),
                3,
            ),
            "foreground_ratio": round(
                float(foreground_ratio),
                4,
            ),

            "blob": round(
                float(blob_score),
                3,
            ),

            "component": round(
                float(component_score),
                3,
            ),
            "character_ratio": round(
                float(character_like_ratio),
                3,
            ),
            "fragmentation": round(
                float(fragmentation_score),
                3,
            ),
            "component_density_ratio": round(
                float(component_density_ratio),
                3,
            ),

            "components_total": int(
                candidate_component_count
            ),
            "reference_components": int(
                reference_component_count
            ),

            "final": round(
                float(final_score),
                3,
            ),
        },
        flush=True,
    )

    if return_details:
        return float(final_score), {
            "edge_f1": float(edge_preservation_score),
            "foreground": float(foreground_score),
            "blob": float(blob_score),
            "component": float(component_score),
            "character_ratio": float(character_like_ratio),
            "fragmentation": float(fragmentation_score),
            "component_density_ratio": float(component_density_ratio),
        }

    return float(final_score)


def _select_auto_profile(
    image: np.ndarray,
    config_path: str | Path | None = None,
) -> str:
    preview = _create_auto_preview(
        image
    )

    scores = {}
    details = {}

    for candidate_profile in AUTO_PROFILES:
        candidate = preprocess_image(
            preview,
            config_path=config_path,
            profile=candidate_profile,
        )

        score, candidate_details = _score_enhancement_candidate(
            candidate,
            reference_image=preview,
            return_details=True,
        )

        scores[candidate_profile] = score
        details[candidate_profile] = candidate_details

        print(
            "[AUTO CANDIDATE]",
            candidate_profile,
            round(score, 3),
            flush=True,
        )

    selected_profile = max(
        scores,
        key=scores.get,
    )

    # -------------------------------------------------
    # Conservative structural tie-break
    # -------------------------------------------------
    ranked_profiles = sorted(
        scores,
        key=scores.get,
        reverse=True,
    )

    best_profile = ranked_profiles[0]
    second_profile = ranked_profiles[1]

    score_gap = (
        scores[best_profile]
        - scores[second_profile]
    )

    # Only reconsider reasonably close candidates.
    # This avoids changing clear profile decisions.
    if 0.015 <= score_gap <= 0.035:
        best_details = details[best_profile]
        second_details = details[second_profile]

        character_gain = (
            second_details["character_ratio"]
            - best_details["character_ratio"]
        )

        component_gain = (
            second_details["component"]
            - best_details["component"]
        )

        # Override only when the runner-up has a clear
        # structural advantage in BOTH metrics.
        if (
            character_gain >= 0.05
            and component_gain >= 0.04
            and best_details["component_density_ratio"] <= 3.0
            and second_details["component_density_ratio"] <= 3.0
        ):
            selected_profile = second_profile

            print(
                "[AUTO TIE-BREAK]",
                {
                    "original": best_profile,
                    "selected": second_profile,
                    "score_gap": round(float(score_gap), 3),
                    "character_gain": round(float(character_gain), 3),
                    "component_gain": round(float(component_gain), 3),
                },
                flush=True,
            )

    print(
            "[AUTO PROFILE]",
            {
                profile: round(score, 3)
                for profile, score in scores.items()
            },
            "selected:",
            selected_profile,
            flush=True,
        )

    return selected_profile


def preprocess_image(
    image: np.ndarray,
    threshold_method: str | None = None,
    config_path: str | Path | None = None,
    profile: str = "printed",
) -> np.ndarray:
    """
    Apply the default preprocessing pipeline to an image.

    The pipeline consists of perspective correction, deskewing,
    grayscale conversion, noise reduction, background normalization,
    CLAHE enhancement, and thresholding.

    config_path: Optional path to an image enhancement
            configuration file.

    Args:
        image: Input document image.
        threshold_method: Thresholding method to apply. Supported values
            are "otsu" and "adaptive".
            profile: Preprocessing profile. Supported values are
            "printed" and "manuscript".
    Returns:
        Preprocessed binary image.

    Raises:
        TypeError: If threshold_method is not a string.
        ValueError: If threshold_method is unsupported.
    """
   
    total_start = time.perf_counter()


    config = _load_preprocessing_config(
        config_path
    )

    profiles = config["profiles"]

    normalized_profile = profile.strip().lower()

    if normalized_profile == "auto":
        normalized_profile = _select_auto_profile(
            image,
            config_path=config_path,
        )

        if normalized_profile not in profiles:
            supported_profiles = ", ".join(
                sorted(profiles)
            )

            raise ValueError(
                f"Unsupported profile: {profile!r}. "
                f"Supported profiles: {supported_profiles}."
            )

    profile_config = profiles[
        normalized_profile
    ]
    print(
        "\n===== IMAGE ENHANCEMENT DEBUG =====",
        flush=True,
    )

    print(
        "PROFILE:",
        profile,
        flush=True,
    )

    print(
        "PROFILE CONFIG:",
        profile_config,
        flush=True,
    )

    print(
        "THRESHOLD METHOD:",
        profile_config["threshold_method"],
        flush=True,
    )

    print(
        "CLAHE:",
        profile_config["clahe_enabled"],
        flush=True,
    )

    print(
        "STAIN:",
        profile_config["stain_suppression_enabled"],
        flush=True,
    )

    print(
        "===================================",
        flush=True,
    )
    selected_threshold_method = (
                profile_config["threshold_method"]
                if threshold_method is None
                else threshold_method
            )
    normalized_threshold_method = _validate_threshold_method(
                selected_threshold_method
            )
    
    enhancement_config = config[
        "enhancement"
    ]

    threshold_config = config[
        "threshold"
    ]

    adaptive_config = {
        **threshold_config["adaptive"],
        **profile_config.get("adaptive", {}),
    }

    denoise_config = {
        **enhancement_config["denoise"],
        **profile_config.get("denoise", {}),
    }

    clahe_config = {
        **enhancement_config["clahe"],
        **profile_config.get("clahe", {}),
    }

    background_config = {
        **enhancement_config["background_normalization"],
        **profile_config.get(
            "background_normalization",
            {},
        ),
    }

    stain_config = enhancement_config[
    "stain_suppression"
    ]
    
    morphology_config = enhancement_config[
    "morphology"
    ]

    speckle_config = enhancement_config[
    "speckle_removal"
    ]

    speckle_v2_config = enhancement_config[
        "speckle_removal_v2"
    ]

    speckle_v3_config = enhancement_config[
        "speckle_removal_v3"
    ]


    bleed_through_config = enhancement_config[
    "bleed_through"
    ]

    line_removal_config = enhancement_config[
        "line_removal"
    ]

    text_region_config = enhancement_config[
    "text_region"
    ]
    
    orientation_config = config.get("orientation", {"enabled": False})

    if orientation_config.get("enabled", False):
        (
            orientation_corrected_image,
            rotation_angle,
            orientation_confidence,
        ) = correct_document_orientation(image)
    else:
        orientation_corrected_image = image.copy()
        rotation_angle = 0
        orientation_confidence = 0.0

    perspective_corrected_image = correct_perspective(
        orientation_corrected_image
    )

    try:
        deskewed_image = deskew_image(
            perspective_corrected_image
        )
    except ValueError:
        deskewed_image = (
            perspective_corrected_image.copy()
        )

    text_region_image = deskewed_image

    if profile_config["text_region_enabled"]:
        text_region_image = crop_to_text_region(
            deskewed_image,
            horizontal_kernel_width=text_region_config[
                "horizontal_kernel_width"
            ],
            vertical_kernel_height=text_region_config[
                "vertical_kernel_height"
            ],
            min_region_area_ratio=text_region_config[
                "min_region_area_ratio"
            ],
            padding=text_region_config[
                "padding"
            ],
        )

    height, width = text_region_image.shape[:2]

    if (
        profile_config["upscale_enabled"]
        and width < 1000
    ):
        scale = profile_config[
            "upscale_factor"
        ]

        text_region_image = cv2.resize(
            text_region_image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_CUBIC,
        )

    # orientation_corrected_image, perspective_corrected_image and
    # deskewed_image were each full-size BGR copies used only to produce
    # the next one; text_region_image (used for the rest of the pipeline)
    # already holds what's needed, so these can be freed now instead of
    # sitting in memory for the rest of the function.
    del orientation_corrected_image
    del perspective_corrected_image
    del deskewed_image
    gc.collect()

    text_protection_mask = None
    faint_text_mask = None
    very_faint_text_mask = None

    # Region listeleri her profil için güvenli şekilde
    # başlangıçta boş tanımlanır.
    foreground_regions = []
    faint_text_regions = []
    very_faint_text_regions = []
    protected_regions = []

    debug_dir = Path(
        "data/processed/debug"
    )

    debug_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    foreground_regions = []
    faint_text_regions = []
    very_faint_text_regions = []
    protected_regions = []

    if normalized_profile == "printed-degraded":

        # -----------------------------------------
        # Text region detection
        # -----------------------------------------

        t = time.perf_counter()

        candidate_regions = detect_text_regions(
            text_region_image
        )

        print(
            "[DEBUG] candidate_regions:",
            len(candidate_regions),
            flush=True,
        )

        print(
            f"[TIMING] detect_text_regions: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )


        # -----------------------------------------
        # Region classification
        # -----------------------------------------

        t = time.perf_counter()

        classified_regions = classify_text_regions(
            text_region_image,
            candidate_regions,
        )

        print(
            f"[TIMING] classify_text_regions: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )


        # -----------------------------------------
        # Separate region classes
        # -----------------------------------------

        foreground_regions = [
            result["region"]
            for result in classified_regions
            if result["classification"] == "foreground"
        ]

        faint_text_regions = [
            result["region"]
            for result in classified_regions
            if result["classification"] == "faint_text"
        ]

        very_faint_text_regions = [
            result["region"]
            for result in classified_regions
            if result["classification"] == "very_faint_text"
        ]

        protected_regions = (
            foreground_regions
            + faint_text_regions
            + very_faint_text_regions
        )


        # -----------------------------------------
        # Debug: classification counts
        # -----------------------------------------

        classification_counts = {}

        for result in classified_regions:
            label = result["classification"]

            classification_counts[label] = (
                classification_counts.get(label, 0)
                + 1
            )

        print(
            "[DEBUG] classification_counts:",
            classification_counts,
            flush=True,
        )

        print(
            "[DEBUG] foreground_regions:",
            len(foreground_regions),
            flush=True,
        )

        print(
            "[DEBUG] faint_text_regions:",
            len(faint_text_regions),
            flush=True,
        )

        print(
            "[DEBUG] very_faint_text_regions:",
            len(very_faint_text_regions),
            flush=True,
        )


        # -----------------------------------------
        # Debug visualization
        # -----------------------------------------

        debug_faint_regions = (
            text_region_image.copy()
        )

        for x, y, w, h in faint_text_regions:
            cv2.rectangle(
                debug_faint_regions,
                (x, y),
                (x + w, y + h),
                (0, 255, 0),
                2,
            )

        cv2.imwrite(
            str(
                debug_dir
                / "faint_text_regions.png"
            ),
            debug_faint_regions,
        )


        # -----------------------------------------
        # Protected text mask
        # -----------------------------------------

        if protected_regions:

            t = time.perf_counter()

            text_protection_mask = create_pixel_text_mask(
                text_region_image,
                protected_regions,
                padding=1,
            )

            print(
                f"[TIMING] create_text_protection_mask: "
                f"{time.perf_counter() - t:.3f}s",
                flush=True,
            )

        else:

            print(
                "[DEBUG] No protected text regions found. "
                "Protected cleanup stages will be skipped.",
                flush=True,
            )


        # -----------------------------------------
        # Faint text mask
        # -----------------------------------------

        if faint_text_regions:

            faint_text_mask = create_pixel_text_mask(
                text_region_image,
                faint_text_regions,
                padding=1,
            )

            cv2.imwrite(
                str(
                    debug_dir
                    / "faint_text_mask.png"
                ),
                faint_text_mask,
            )


        # -----------------------------------------
        # Very faint text mask
        # -----------------------------------------

        if very_faint_text_regions:

            very_faint_text_mask = create_pixel_text_mask(
                text_region_image,
                very_faint_text_regions,
                padding=1,
            )

            cv2.imwrite(
                str(
                    debug_dir
                    / "very_faint_text_mask.png"
                ),
                very_faint_text_mask,
            )


        # -----------------------------------------
        # Remove long artifacts from protection mask
        # -----------------------------------------

        if text_protection_mask is not None:

            t = time.perf_counter()

            text_protection_mask = (
                remove_long_artifacts_from_text_mask(
                    text_protection_mask,
                    horizontal_ratio=0.18,
                    vertical_ratio=0.12,
                )
            )

            print(
                f"[TIMING] remove_long_artifacts: "
                f"{time.perf_counter() - t:.3f}s",
                flush=True,
            )


    grayscale_image = convert_to_grayscale(
        text_region_image
    )

    denoised_image = reduce_noise(
        grayscale_image,
        diameter=denoise_config["diameter"],
        sigma_color=denoise_config["sigma_color"],
        sigma_space=denoise_config["sigma_space"],
    )

    del grayscale_image

    normalized_image = denoised_image

    if profile_config[
        "background_normalization_enabled"
    ]:
        t = time.perf_counter()

        normalized_image = normalize_background(
            denoised_image,
            kernel_size=background_config[
                "kernel_size"
            ],
        )

        print(
            f"[TIMING] normalize_background: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )

    del denoised_image
    gc.collect()

    bleed_suppressed_image = normalized_image

    if  profile_config["bleed_through_enabled"]:
       bleed_suppressed_image = suppress_bleed_through(
        normalized_image,
        background_kernel_size=bleed_through_config[
            "background_kernel_size"
        ],
        min_contrast=bleed_through_config[
            "min_contrast"
        ],
        foreground_gain=bleed_through_config[
            "foreground_gain"
        ],
        edge_threshold=bleed_through_config[
            "edge_threshold"
        ],
        connectivity_kernel_size=bleed_through_config[
            "connectivity_kernel_size"
        ],
    )


    stain_suppressed_image = (
            bleed_suppressed_image
        )

    if profile_config[
            "stain_suppression_enabled"
        ]:

        stain_suppressed_image = suppress_stains(
                bleed_suppressed_image,
                kernel_size=stain_config[
                    "kernel_size"
                ],
            )

    enhanced_image = stain_suppressed_image

    if profile_config["clahe_enabled"]:
        enhanced_image = apply_clahe(
            stain_suppressed_image,
            clip_limit=clahe_config[
                "clip_limit"
            ],
            tile_grid_size=tuple(
                clahe_config[
                    "tile_grid_size"
                ]
            ),
        )

    line_cleaned_image = enhanced_image

    if line_removal_config["enabled"]:
        line_cleaned_image = remove_long_lines(
            enhanced_image,
            min_line_length_ratio=line_removal_config[
                "min_line_length_ratio"
            ],
            max_line_gap=line_removal_config[
                "max_line_gap"
            ],
            hough_threshold=line_removal_config[
                "hough_threshold"
            ],
            line_thickness=line_removal_config[
                "line_thickness"
            ],
        )


    if not profile_config["threshold_enabled"]:
        return line_cleaned_image

    # -----------------------------------------
    # Base threshold
    # -----------------------------------------

    debug_dir = Path("data/processed/debug")
    debug_dir.mkdir(parents=True, exist_ok=True)

    cv2.imwrite(
        str(debug_dir / "00_before_threshold.png"),
        line_cleaned_image,
    )
    t = time.perf_counter()

    if normalized_threshold_method == "otsu":
        binary_image = apply_otsu_threshold(
            line_cleaned_image
        )
    else:
        binary_image = apply_adaptive_threshold(
            line_cleaned_image,
            block_size=adaptive_config[
                "block_size"
            ],
            constant=adaptive_config[
                "constant"
            ],
        )

    print(
        f"[TIMING] base_threshold: "
        f"{time.perf_counter() - t:.3f}s",
        flush=True,
    )

    cv2.imwrite(
        str(debug_dir / "00_after_threshold.png"),
        binary_image,
    )

    # -----------------------------------------
    # Faint text recovery
    # -----------------------------------------

    if (
        normalized_profile == "printed-degraded"
        and faint_text_mask is not None
    ):
        t = time.perf_counter()

        binary_image = apply_faint_text_threshold(
            image=line_cleaned_image,
            base_binary=binary_image,
            faint_text_mask=faint_text_mask,
            block_size=31,
            constant=3.0,
        )

        print(
            f"[TIMING] faint_text_threshold: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )


    cv2.imwrite(
        str(debug_dir / "00_after_faint_recovery.png"),
        binary_image,
    )


    # -----------------------------------------
    # Fold / artifact removal
    # -----------------------------------------

    if (
        normalized_profile == "printed-degraded"
        and text_protection_mask is not None
    ):
        t = time.perf_counter()

        binary_image = remove_fold_lines_with_text_protection(
            binary_image=binary_image,
            text_mask=text_protection_mask,
            horizontal_ratio=0.18,
            vertical_ratio=0.12,
            protection_dilation=0,
        )

        print(
            f"[TIMING] fold_line_removal: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )


    # -----------------------------------------
    # Text restoration
    # -----------------------------------------

    if text_protection_mask is not None:
        t = time.perf_counter()

        binary_image = restore_text_pixels_by_regions(
            source_image=text_region_image,
            binary_image=binary_image,
            text_mask=text_protection_mask,
            regions=protected_regions,
            darkness_percentile=40.0,
        )

        print(
            f"[TIMING] restore_text_regions: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )

        debug_dir = Path("data/processed/debug")
        debug_dir.mkdir(parents=True, exist_ok=True)

        cv2.imwrite(
            str(debug_dir / "01_before_speckle_v4.png"),
            binary_image,
        )


    # -----------------------------------------
    # Protected speckle removal v4
    # -----------------------------------------

    if (
        normalized_profile == "printed-degraded"
        and text_protection_mask is not None
    ):
        t = time.perf_counter()

        binary_image = remove_isolated_speckles_v4(
            image=binary_image,
            text_mask=text_protection_mask,
            max_speckle_area=20,
            text_protection_margin=3,
        )

        print(
            f"[TIMING] speckle_removal_v4: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )

    cv2.imwrite(
        str(debug_dir / "02_after_speckle_v4.png"),
        binary_image,
    )

    if profile_config["morphology_enabled"]:
        binary_image = clean_binary_noise(
            binary_image,
            kernel_size=morphology_config[
                "kernel_size"
            ],
            iterations=morphology_config[
                "iterations"
            ],
        )
    if speckle_v2_config["enabled"]:
        binary_image = remove_isolated_speckles_v2(
            binary_image,
            min_area=speckle_v2_config[
                "min_area"
            ],
            text_anchor_area=speckle_v2_config[
                "text_anchor_area"
            ],
            horizontal_distance=speckle_v2_config[
                "horizontal_distance"
            ],
            vertical_distance=speckle_v2_config[
                "vertical_distance"
            ],
            max_isolated_distance=speckle_v2_config[
                "max_isolated_distance"
            ],
        )

    if speckle_v3_config["enabled"]:
        binary_image = remove_isolated_speckles_v3(
            binary_image,
            min_area=speckle_v3_config[
                "min_area"
            ],
            line_kernel_width=speckle_v3_config[
                "line_kernel_width"
            ],
            line_kernel_height=speckle_v3_config[
                "line_kernel_height"
            ],
            line_dilation_iterations=speckle_v3_config[
                "line_dilation_iterations"
            ],
            safe_vertical_margin=speckle_v3_config[
                "safe_vertical_margin"
            ],
        )

    if profile_config["speckle_removal_enabled"]:
        binary_image = remove_isolated_speckles(
            binary_image,
            min_area=speckle_config[
                "min_area"
            ],
            anchor_area=speckle_config[
                "anchor_area"
            ],
            horizontal_distance=speckle_config[
                "horizontal_distance"
            ],
            vertical_distance=speckle_config[
                "vertical_distance"
            ],
        )

    debug_dir = Path(
            "data/processed/debug"
        )

    debug_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

    cv2.imwrite(
            str(
                debug_dir
                / "03_final_output.png"
            ),
            binary_image,
        )

    print(
        f"[TIMING] TOTAL preprocess_image: "
        f"{time.perf_counter() - total_start:.3f}s",
        flush=True,
    )
      
    return binary_image


def preprocess_image_file(
    input_path: str | Path,
    output_path: str | Path,
    threshold_method: str = "otsu",
) -> np.ndarray:
    """
    Read, preprocess, and save a document image.

   Args:
    image: Input document image.
    threshold_method: Optional thresholding method. Supported values
        are "otsu" and "adaptive".
    config_path: Optional configuration file path.
    profile: Preprocessing profile. Supported values are
        "printed" and "manuscript".

    Returns:
        Preprocessed binary image.
    """
    image = read_image(input_path)

    processed_image = preprocess_image(
        image,
        threshold_method=threshold_method,
    )

    save_image(
        processed_image,
        output_path,
    )

    return processed_image


def _validate_threshold_method(
    threshold_method: str,
) -> str:
    """
    Validate and normalize a thresholding method name.

    Args:
        threshold_method: Thresholding method name.

    Returns:
        Normalized lowercase thresholding method name.

    Raises:
        TypeError: If threshold_method is not a string.
        ValueError: If threshold_method is unsupported.
    """
    if not isinstance(threshold_method, str):
        raise TypeError(
            "threshold_method must be a string."
        )

    normalized_threshold_method = (
        threshold_method.strip().lower()
    )



    if normalized_threshold_method not in SUPPORTED_THRESHOLD_METHODS:
        supported_methods = ", ".join(
            sorted(SUPPORTED_THRESHOLD_METHODS)
        )

        raise ValueError(
            "Unsupported threshold_method: "
            f"{threshold_method!r}. "
            f"Supported methods: {supported_methods}."
        )

    return normalized_threshold_method

def _load_preprocessing_config(
    config_path: str | Path | None = None,
) -> dict[str, Any]:
    """
    Load image enhancement configuration values.

    Args:
        config_path: Optional custom configuration file path.

    Returns:
        Parsed image enhancement configuration.
    """
    resolved_config_path = (
        DEFAULT_CONFIG_PATH
        if config_path is None
        else Path(config_path)
    )

    return load_yaml_config(
        resolved_config_path
    )