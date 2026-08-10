"""Preprocessing pipelines for Ottoman document images."""

from pathlib import Path
from typing import Any
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


SUPPORTED_THRESHOLD_METHODS = {
    "otsu",
    "adaptive",
}

DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "configs"
    / "image_enhancement.yaml"
)


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

    adaptive_config = threshold_config[
        "adaptive"
    ]

    denoise_config = enhancement_config[
        "denoise"
    ]

    clahe_config = enhancement_config[
        "clahe"
    ]

    background_config = enhancement_config[
        "background_normalization"
    ]

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
    
    perspective_corrected_image = correct_perspective(
        image
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

    text_protection_mask = None
    faint_text_mask = None

    if normalized_profile == "printed-degraded":

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

        debug_faint_regions = text_region_image.copy()

        for x, y, w, h in faint_text_regions:
            cv2.rectangle(
                debug_faint_regions,
                (x, y),
                (x + w, y + h),
                (0, 255, 0),
                2,
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
                / "faint_text_regions.png"
            ),
            debug_faint_regions,
        )

        classification_counts = {}

        for result in classified_regions:
            label = result["classification"]

            classification_counts[label] = (
                classification_counts.get(label, 0) + 1
            )

        print(
            "[DEBUG] classification_counts:",
            classification_counts,
            flush=True,
        )

        print(
            "[DEBUG] faint_text_regions:",
            len(faint_text_regions),
            flush=True,
        )

        protected_regions = (
            foreground_regions
            + faint_text_regions
        )
          

        t = time.perf_counter()

        text_protection_mask = create_pixel_text_mask(
            text_region_image,
            protected_regions,
            padding=1,
        )

        faint_text_mask = create_pixel_text_mask(
            text_region_image,
            faint_text_regions,
            padding=1,
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
                / "faint_text_mask.png"
            ),
            faint_text_mask,
        )

        print(
            f"[TIMING] create_pixel_text_masks: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
        )

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

    t = time.perf_counter()

    if normalized_threshold_method == "otsu":
        binary_image = apply_otsu_threshold(
            line_cleaned_image
        )
    else:
        if normalized_profile == "delicate":
            binary_image = apply_adaptive_threshold(
                line_cleaned_image,
                block_size=31,
                constant=6.0,
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
            constant=6.0,
        )

        print(
            f"[TIMING] faint_text_threshold: "
            f"{time.perf_counter() - t:.3f}s",
            flush=True,
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