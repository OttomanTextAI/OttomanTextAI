from pathlib import Path

from scripts.process_uploaded_image import (
    process_uploaded_image,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    tests = [
        {
            "input": (
                PROJECT_ROOT
                / "data"
                / "raw"
                / "ground_truth"
                / "sample_02.png"
            ),
            "output": (
                PROJECT_ROOT
                / "data"
                / "processed"
                / "image_enhancement"
                / "test_printed_stained.png"
            ),
            "profile": "printed",
        },
    ]

    for test in tests:
        print(
            f"Processing: {test['input'].name} "
            f"[{test['profile']}]"
        )

        saved_path = process_uploaded_image(
            test["input"],
            test["output"],
            profile=test["profile"],
        )

        print(
            f"Saved: {saved_path}"
        )


if __name__ == "__main__":
    main()