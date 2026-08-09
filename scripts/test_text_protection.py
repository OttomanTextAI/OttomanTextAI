import argparse
from pathlib import Path

import cv2

from src.image_enhancement.text_region import (
    detect_text_regions,
)

from src.image_enhancement.foreground_text import (
    classify_text_regions,
)

from src.image_enhancement.text_mask import (
    create_pixel_text_mask,
    overlay_text_mask,
    remove_long_artifacts_from_text_mask,
    remove_extreme_line_components,
)


def main():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "input_image",
        type=str,
    )

    parser.add_argument(
        "--output",
        type=str,
        default="outputs/text_protection_debug.png",
    )

    args = parser.parse_args()

    image = cv2.imread(
        args.input_image
    )

    if image is None:
        raise ValueError(
            f"Image could not be loaded: {args.input_image}"
        )

    # -----------------------------------------
    # 1. Candidate text regions
    # -----------------------------------------

    regions = detect_text_regions(
        image
    )

    print()
    print(
        "Detected regions:",
        len(regions),
    )
    print()

    # -----------------------------------------
    # 2. Score regions
    # -----------------------------------------

    classified_regions = classify_text_regions(
        image,
        regions,
    )

    debug_image = image.copy()

    foreground_count = 0
    faint_text_count = 0
    weak_count = 0

    for index, result in enumerate(
        classified_regions,
        start=1,
    ):
        x, y, width, height = (
            result["region"]
        )

        classification = (
            result["classification"]
        )

        score = result["score"]

        combined_score = result.get(
            "combined_score",
            score,
        )

        structure_score = result[
            "structure_score"
        ]

        alignment_score = result[
            "line_alignment_score"
        ]

        repetition_score = result[
            "repetition_score"
        ]

        horizontal_coverage = result[
            "horizontal_ink_coverage"
        ]


        # -------------------------------------
        # Debug colours
        #
        # Green  -> strong foreground text
        # Yellow -> faint but probable text
        # Red    -> weak / artifact
        # -------------------------------------

        if classification == "foreground":
            foreground_count += 1
            color = (0, 255, 0)

        elif classification == "faint_text":
            faint_text_count += 1
            color = (0, 255, 255)

        else:
            weak_count += 1
            color = (0, 0, 255)

        cv2.rectangle(
            debug_image,
            (x, y),
            (
                x + width,
                y + height,
            ),
            color,
            2,
        )

        label = (
            f"{index}: "
            f"{classification} "
            f"{combined_score:.2f}"
        )

        cv2.putText(
            debug_image,
            label,
            (
                x,
                max(15, y - 5),
            ),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            color,
            1,
            cv2.LINE_AA,
        )

        print(
            f"[{index}] "
            f"{classification:10} "
            f"base={score:.3f} "
            f"combined={combined_score:.3f} "
            f"structure={structure_score:.3f} "
            f"alignment={alignment_score:.3f} "
            f"repetition={repetition_score:.3f} "
            f"region={(x, y, width, height)}"
            f"coverage={horizontal_coverage:.3f} "
        )

    # -----------------------------------------
    # 3. Select regions to protect
    # -----------------------------------------

    protected_regions = [
        result["region"]
        for result in classified_regions
        if result["classification"]
        in {
            "foreground",
            "faint_text",
        }
    ]

    faint_text_regions = [
        result["region"]
        for result in classified_regions
        if result["classification"] == "faint_text"
    ]

    print()
    print(
        "Foreground:",
        foreground_count,
    )
    print(
        "Faint text:",
        faint_text_count,
    )
    print(
        "Weak:",
        weak_count,
    )
    print(
        "Protected regions:",
        len(protected_regions),
    )

    # -----------------------------------------
    # 4. Save region visualization
    # -----------------------------------------

    output_path = Path(
        args.output
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    cv2.imwrite(
        str(output_path),
        debug_image,
    )

    print()
    print(
        "Debug image saved:",
        output_path,
    )

    # -----------------------------------------
    # 5. Create pixel-level protection mask
    # -----------------------------------------

    pixel_mask = create_pixel_text_mask(
        image,
        protected_regions,
        padding=1,
    )

    pixel_mask = (
        remove_long_artifacts_from_text_mask(
            pixel_mask,
            horizontal_ratio=0.18,
            vertical_ratio=0.12,
        )
    )

    pixel_mask = remove_extreme_line_components(
        pixel_mask,
        horizontal_width_ratio=0.18,
        horizontal_max_height=6,
        vertical_height_ratio=0.12,
        vertical_max_width=6,
    )

    mask_debug = overlay_text_mask(
        image,
        pixel_mask,
    )

    mask_output = Path(
        "outputs/pixel_text_mask_debug.png"
    )

    faint_text_mask = create_pixel_text_mask(
        image,
        faint_text_regions,
        padding=1,
    )

    faint_debug = overlay_text_mask(
        image,
        faint_text_mask,
    )

    faint_output = Path(
        "outputs/faint_text_mask_debug.png"
    )

    cv2.imwrite(
        str(faint_output),
        faint_debug,
    )

    cv2.imwrite(
        "outputs/faint_text_mask.png",
        faint_text_mask,
    )

    print(
        "Faint text mask saved:",
        faint_output,
    )

    mask_output.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    cv2.imwrite(
        str(mask_output),
        mask_debug,
    )

    cv2.imwrite(
        "outputs/pixel_text_mask.png",
        pixel_mask,
    )

    print(
        "Pixel mask saved:",
        mask_output,
    )


if __name__ == "__main__":
    main()