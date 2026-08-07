from pathlib import Path

from src.image_enhancement.text_mask import (
    create_text_mask_from_regions,
    overlay_text_mask,
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
    / "text_mask_debug.png"
)


def main() -> None:
    image = read_image(
        INPUT_PATH
    )

    regions = detect_text_regions(
        image
    )

    text_mask = create_text_mask_from_regions(
        image,
        regions,
        padding=6,
    )

    debug_image = overlay_text_mask(
        image,
        text_mask,
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
        f"Detected text regions: {len(regions)}"
    )

    print(
        f"Saved: {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()