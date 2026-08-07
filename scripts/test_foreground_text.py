from pathlib import Path

import cv2

from src.image_enhancement.foreground_text import (
    classify_text_regions,
)
from src.image_enhancement.text_region import (
    detect_text_regions,
)
from src.image_enhancement.utils import (
    read_image,
    save_image,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]

INPUT_PATH = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "ground_truth"
    / "sample_02.png"
)

OUTPUT_PATH = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "image_enhancement"
    / "foreground_text_debug.png"
)


def main() -> None:
    image = read_image(
        INPUT_PATH
    )

    regions = detect_text_regions(
        image
    )

    results = classify_text_regions(
        image,
        regions,
        foreground_threshold=None,
    )

    if results:
        print(
            "Adaptive foreground threshold:",
            f"{results[0]['threshold']:.3f}",
        )
    debug_image = image.copy()

    for index, result in enumerate(
        results,
        start=1,
    ):
        x, y, width, height = result[
            "region"
        ]

        score = result[
            "score"
        ]

        structure_score = result[
            "structure_score"
        ]

        classification = result[
            "classification"
        ]

        line_alignment_score = result[
            "line_alignment_score"
        ]

        repetition_score = result[
            "repetition_score"
        ]

        if classification == "foreground":
            color = (0, 255, 0)
        else:
            color = (0, 0, 255)

        label = (
            f"{index}:"
            f"{score:.2f}/"
            f"{structure_score:.2f}/"
            f"{line_alignment_score:.2f}/"
            f"{repetition_score:.2f}"
        )

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
        )
    OUTPUT_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    save_image(
        debug_image,
        OUTPUT_PATH,
    )

    print(
        f"Candidate regions: {len(results)}"
    )

    for index, result in enumerate(
        results,
        start=1,
    ):
        print(
            index,
            result["classification"],
            f"foreground={result['score']:.3f}",
            f"structure={result['structure_score']:.3f}",
            f"alignment={result['line_alignment_score']:.3f}",
            f"repetition={result['repetition_score']:.3f}",
        )

    print(
        f"Saved: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()