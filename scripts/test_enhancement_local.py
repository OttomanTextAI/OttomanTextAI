from pathlib import Path
import argparse

from src.image_enhancement.utils import (
    read_image,
    save_image,
)
from src.image_enhancement.preprocess import (
    preprocess_image,
)
from src.image_enhancement.line_removal import (
    remove_fold_lines_with_text_protection,
)



SUPPORTED_PROFILES = {
    "printed",
    "printed-degraded",
    "delicate",
    "manuscript",
}


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Run image enhancement locally "
            "with a selected document profile."
        )
    )

    parser.add_argument(
        "input_image",
        help="Path to the input document image.",
    )

    parser.add_argument(
        "profile",
        choices=sorted(SUPPORTED_PROFILES),
        help="Image enhancement profile.",
    )

    parser.add_argument(
        "--output",
        default=None,
        help=(
            "Optional output path. "
            "If omitted, output is saved under "
            "data/processed/local_tests/."
        ),
    )

    args = parser.parse_args()

    input_path = Path(
        args.input_image
    )

    if not input_path.exists():
        raise FileNotFoundError(
            f"Input image not found: {input_path}"
        )

    image = read_image(
        input_path
    )

    processed = preprocess_image(
        image,
        profile=args.profile,
    )

    if args.output:
        output_path = Path(
            args.output
        )
    else:
        output_dir = Path(
            "data/processed/local_tests"
        )

        output_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        profile_name = (
            args.profile.replace(
                "-",
                "_",
            )
        )

        output_path = (
            output_dir
            / (
                f"{input_path.stem}"
                f"_{profile_name}.png"
            )
        )

    save_image(
        processed,
        output_path,
    )

    print(
        f"Profile: {args.profile}"
    )

    print(
        f"Input:   {input_path}"
    )

    print(
        f"Output:  {output_path}"
    )


if __name__ == "__main__":
    main()