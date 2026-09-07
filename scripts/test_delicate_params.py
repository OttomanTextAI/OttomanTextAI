from pathlib import Path
import copy

import cv2
import numpy as np
import yaml

from src.image_enhancement.preprocess import preprocess_image


ROOT = Path(__file__).resolve().parents[1]

INPUT_PATH = ROOT / "data" / "test_images" / "leke7.jpg"
BASE_CONFIG_PATH = ROOT / "configs" / "image_enhancement.yaml"

OUTPUT_DIR = (
    ROOT
    / "data"
    / "processed"
    / "delicate_upscale_sweep"
)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


BLOCK_SIZE = 31
CONSTANT = 5.0

UPSCALE_VALUES = [
    1.5,
    2.0,
    2.5,
    3.0,
]


def read_image_unicode_safe(
    path: Path,
) -> np.ndarray:
    image_bytes = np.fromfile(
        str(path),
        dtype=np.uint8,
    )

    image = cv2.imdecode(
        image_bytes,
        cv2.IMREAD_COLOR,
    )

    if image is None:
        raise ValueError(
            f"Image could not be read: {path}"
        )

    return image


def save_image_unicode_safe(
    path: Path,
    image: np.ndarray,
) -> None:
    success, encoded = cv2.imencode(
        ".png",
        image,
    )

    if not success:
        raise ValueError(
            f"Image could not be encoded: {path}"
        )

    encoded.tofile(
        str(path)
    )


def main() -> None:
    image = read_image_unicode_safe(
        INPUT_PATH
    )

    with open(
        BASE_CONFIG_PATH,
        "r",
        encoding="utf-8",
    ) as file:
        base_config = yaml.safe_load(
            file
        )

    for upscale_factor in UPSCALE_VALUES:

        config = copy.deepcopy(
            base_config
        )

        # -----------------------------
        # Delicate threshold
        # -----------------------------
        config[
            "profiles"
        ][
            "delicate"
        ][
            "adaptive"
        ][
            "block_size"
        ] = BLOCK_SIZE

        config[
            "profiles"
        ][
            "delicate"
        ][
            "adaptive"
        ][
            "constant"
        ] = CONSTANT

        # -----------------------------
        # Delicate denoise override
        # -----------------------------
        config[
            "profiles"
        ][
            "delicate"
        ][
            "upscale_factor"
        ] = upscale_factor

        tag = f"up{upscale_factor:g}"

        temp_config_path = (
            OUTPUT_DIR
            / f"config_{tag}.yaml"
        )

        with open(
            temp_config_path,
            "w",
            encoding="utf-8",
        ) as file:
            yaml.safe_dump(
                config,
                file,
                allow_unicode=True,
                sort_keys=False,
            )

        processed = preprocess_image(
            image,
            config_path=temp_config_path,
            profile="delicate",
        )

        output_path = (
            OUTPUT_DIR
            / (
                f"leke7_delicate"
                f"_block{BLOCK_SIZE}"
                f"_c{CONSTANT:g}"
                f"_up{upscale_factor:g}.png"
            )
        )

        save_image_unicode_safe(
            output_path,
            processed,
        )

        print(
            "[OUTPUT]",
            output_path,
            flush=True,
        )


if __name__ == "__main__":
    main()