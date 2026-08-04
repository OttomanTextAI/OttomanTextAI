"""Configuration loading utilities."""

# TODO:
# The configuration loader and image_enhancement.yaml are ready.
# In a future phase, expose only experiment-oriented parameters
# (e.g., CLAHE clip limit, adaptive threshold block size and constant)
# through the configuration file. Algorithm-specific constants
# (e.g., aspect-ratio limits, border margins, MAD multiplier)
# should remain in the implementation unless runtime tuning
# becomes necessary.

from pathlib import Path
from typing import Any

import yaml


def load_yaml_config(
    config_path: str | Path,
) -> dict[str, Any]:
    """
    Load a YAML configuration file.

    Args:
        config_path: Path to the YAML configuration file.

    Returns:
        Parsed configuration values.

    Raises:
        FileNotFoundError: If the configuration file does not exist.
        ValueError: If the YAML file is empty or does not contain a mapping.
    """
    path = Path(config_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Configuration file not found: {path}"
        )

    with path.open(
        mode="r",
        encoding="utf-8",
    ) as config_file:
        config = yaml.safe_load(
            config_file
        )

    if not isinstance(config, dict):
        raise ValueError(
            "Configuration file must contain a YAML mapping."
        )

    return config