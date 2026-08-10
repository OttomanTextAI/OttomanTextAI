"""Automatic text-region detection for document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_HORIZONTAL_KERNEL_WIDTH = 35
DEFAULT_VERTICAL_KERNEL_HEIGHT = 5
DEFAULT_MIN_REGION_AREA_RATIO = 0.05
DEFAULT_PADDING = 15


def detect_text_region(
    image: np.ndarray,
    horizontal_kernel_width: int = DEFAULT_HORIZONTAL_KERNEL_WIDTH,
    vertical_kernel_height: int = DEFAULT_VERTICAL_KERNEL_HEIGHT,
    min_region_area_ratio: float = DEFAULT_MIN_REGION_AREA_RATIO,
    padding: int = DEFAULT_PADDING,
) -> tuple[int, int, int, int]:
    """
    Detect the dominant text block in a document image.

    Text components are connected horizontally and vertically so that
    lines form larger regions. The largest suitable region is returned
    as a bounding box.

    Args:
        image: Grayscale or binary document image.
        horizontal_kernel_width: Width used to connect characters in lines.
        vertical_kernel_height: Height used to connect neighbouring lines.
        min_region_area_ratio: Minimum bounding-box area relative to the image.
        padding: Extra pixels added around the detected region.

    Returns:
        Bounding box as (x, y, width, height).

    Raises:
        TypeError: If parameters have invalid types.
        ValueError: If values are invalid or no text region is detected.
    """
    validate_image(image)

    if isinstance(horizontal_kernel_width, bool) or not isinstance(
        horizontal_kernel_width,
        int,
    ):
        raise TypeError(
            "horizontal_kernel_width must be an integer."
        )

    if isinstance(vertical_kernel_height, bool) or not isinstance(
        vertical_kernel_height,
        int,
    ):
        raise TypeError(
            "vertical_kernel_height must be an integer."
        )

    if isinstance(padding, bool) or not isinstance(
        padding,
        int,
    ):
        raise TypeError(
            "padding must be an integer."
        )

    if (
        horizontal_kernel_width <= 0
        or vertical_kernel_height <= 0
        or padding < 0
    ):
        raise ValueError(
            "Kernel sizes must be positive and padding cannot be negative."
        )

    if not isinstance(min_region_area_ratio, (int, float)):
        raise TypeError(
            "min_region_area_ratio must be numeric."
        )

    if not 0 < min_region_area_ratio <= 1:
        raise ValueError(
            "min_region_area_ratio must be between 0 and 1."
        )

    grayscale_image = (
        image.squeeze(axis=2)
        if image.ndim == 3 and is_grayscale(image)
        else image
    )

    if grayscale_image.ndim == 3:
        grayscale_image = cv2.cvtColor(
            grayscale_image,
            cv2.COLOR_BGR2GRAY,
        )

    if len(np.unique(grayscale_image)) > 2:
        _, binary_image = cv2.threshold(
            grayscale_image,
            0,
            255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
        )
    else:
        binary_image = cv2.bitwise_not(
            grayscale_image
        )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (horizontal_kernel_width, 1),
    )

    connected_lines = cv2.morphologyEx(
        binary_image,
        cv2.MORPH_CLOSE,
        horizontal_kernel,
    )

    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (1, vertical_kernel_height),
    )

    connected_blocks = cv2.dilate(
        connected_lines,
        vertical_kernel,
        iterations=2,
    )

    contours, _ = cv2.findContours(
        connected_blocks,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    image_height, image_width = grayscale_image.shape[:2]
    image_area = image_height * image_width

    valid_regions: list[tuple[int, int, int, int]] = []

    for contour in contours:
        x, y, width, height = cv2.boundingRect(
            contour
        )

        region_area = width * height

        if (
            region_area
            >= image_area * min_region_area_ratio
        ):
            valid_regions.append(
                (x, y, width, height)
            )

    if not valid_regions:
        raise ValueError(
            "No suitable text region could be detected."
        )

    x, y, width, height = max(
        valid_regions,
        key=lambda region: region[2] * region[3],
    )

    x_start = max(0, x - padding)
    y_start = max(0, y - padding)
    x_end = min(
        image_width,
        x + width + padding,
    )
    y_end = min(
        image_height,
        y + height + padding,
    )

    return (
        x_start,
        y_start,
        x_end - x_start,
        y_end - y_start,
    )


def crop_to_text_region(
    image: np.ndarray,
    **detection_kwargs,
) -> np.ndarray:
    """
    Crop an image to its dominant text region.

    Args:
        image: Input document image.
        **detection_kwargs: Arguments forwarded to detect_text_region().

    Returns:
        Cropped document image.
    """
    x, y, width, height = detect_text_region(
        image,
        **detection_kwargs,
    )

    return image[
        y:y + height,
        x:x + width,
    ].copy()

def detect_text_regions(
    image: np.ndarray,
    min_component_area: int = 3,
    max_component_area_ratio: float = 0.01,
    max_component_width_ratio: float = 0.12,
    max_component_height_ratio: float = 0.08,
    horizontal_gap_ratio: float = 0.04,
    vertical_tolerance_ratio: float = 0.025,
    min_components_per_region: int = 4,
    padding: int = 8,
) -> list[tuple[int, int, int, int]]:
    """
    Detect text regions using character-like connected components.

    Large lines, borders and stains are rejected before components
    are grouped into text-like regions.
    """
    validate_image(image)

    if image.ndim == 3:
        if is_grayscale(image):
            grayscale_image = image.squeeze(axis=2)
        else:
            grayscale_image = cv2.cvtColor(
                image,
                cv2.COLOR_BGR2GRAY,
            )
    else:
        grayscale_image = image.copy()

    height, width = grayscale_image.shape[:2]
    image_area = height * width

    _, binary = cv2.threshold(
        grayscale_image,
        0,
        255,
        cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU,
    )

    # Secondary candidate layer for very faint text.
    # This is used only for region detection, not for final binarization.
    faint_binary = cv2.adaptiveThreshold(
        grayscale_image,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        41,
        11,
    )

    binary = cv2.bitwise_or(
        binary,
        faint_binary,
    )

    number_of_labels, _, stats, _ = (
        cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
    )

    components = []

    for label in range(1, number_of_labels):
        x = stats[
            label,
            cv2.CC_STAT_LEFT,
        ]
        y = stats[
            label,
            cv2.CC_STAT_TOP,
        ]
        component_width = stats[
            label,
            cv2.CC_STAT_WIDTH,
        ]
        component_height = stats[
            label,
            cv2.CC_STAT_HEIGHT,
        ]
        area = stats[
            label,
            cv2.CC_STAT_AREA,
        ]

        if area < min_component_area:
            continue

        if (
            area
            > image_area
            * max_component_area_ratio
        ):
            continue

        # Uzun çizgi / border gibi yapıları reddet.
        if (
            component_width
            > width * max_component_width_ratio
            and component_height < 8
        ):
            continue

        if (
            component_height
            > height * max_component_height_ratio
            and component_width < 8
        ):
            continue

        # Çok büyük bileşenler karakter adayı değildir.
        if (
            component_width
            > width * max_component_width_ratio
        ):
            continue

        if (
            component_height
            > height * max_component_height_ratio
        ):
            continue

        components.append(
            (
                x,
                y,
                component_width,
                component_height,
            )
        )

    if not components:
        return []

    # Bileşenleri yaklaşık satır merkezlerine göre grupla.
    components.sort(
        key=lambda item: (
            item[1] + item[3] / 2,
            item[0],
        )
    )

    vertical_tolerance = max(
        8,
        int(
            height
            * vertical_tolerance_ratio
        ),
    )

    lines = []

    for component in components:
        x, y, cw, ch = component

        component_center_y = (
            y + ch / 2
        )

        best_line = None
        best_distance = None

        for line_info in lines:
            line_center_y = (
                line_info["center_sum"]
                / line_info["count"]
            )

            distance = abs(
                component_center_y
                - line_center_y
            )

            if distance <= vertical_tolerance:
                if (
                    best_distance is None
                    or distance < best_distance
                ):
                    best_line = line_info
                    best_distance = distance

        if best_line is None:
            lines.append(
                {
                    "components": [
                        component
                    ],
                    "center_sum": component_center_y,
                    "count": 1,
                }
            )

        else:
            best_line[
                "components"
            ].append(
                component
            )

            best_line[
                "center_sum"
            ] += component_center_y

            best_line[
                "count"
            ] += 1

    regions = []

    horizontal_gap = max(
        15,
        int(
            width
            * horizontal_gap_ratio
        ),
    )

    # Her satırdaki bileşenleri yatay yakınlığa göre
    # küçük text cluster'larına ayır.
    for line_info in lines:
        line = line_info[
            "components"
        ]

        line.sort(
            key=lambda item: item[0]
        )

        clusters = []
        current_cluster = []

        for component in line:
            if not current_cluster:
                current_cluster.append(
                    component
                )
                continue

            previous = current_cluster[-1]

            previous_right = (
                previous[0]
                + previous[2]
            )

            gap = (
                component[0]
                - previous_right
            )

            if gap <= horizontal_gap:
                current_cluster.append(
                    component
                )
            else:
                clusters.append(
                    current_cluster
                )

                current_cluster = [
                    component
                ]

        if current_cluster:
            clusters.append(
                current_cluster
            )

        for cluster in clusters:
            if (
                len(cluster)
                < min_components_per_region
            ):
                continue

            x_start = min(
                item[0]
                for item in cluster
            )

            y_start = min(
                item[1]
                for item in cluster
            )

            x_end = max(
                item[0] + item[2]
                for item in cluster
            )

            y_end = max(
                item[1] + item[3]
                for item in cluster
            )

            x_start = max(
                0,
                x_start - padding,
            )

            y_start = max(
                0,
                y_start - padding,
            )

            x_end = min(
                width,
                x_end + padding,
            )

            y_end = min(
                height,
                y_end + padding,
            )

            regions.append(
                (
                    x_start,
                    y_start,
                    x_end - x_start,
                    y_end - y_start,
                )
            )

    regions.sort(
        key=lambda region: (
            region[1],
            region[0],
        )
    )

    return regions

def create_text_region_mask(
    image: np.ndarray,
    regions: list[tuple[int, int, int, int]],
) -> np.ndarray:
    """
    Create a binary mask covering all detected text regions.

    Args:
        image: Source document image.
        regions: Bounding boxes returned by detect_text_regions().

    Returns:
        Binary mask where protected text regions are white.
    """
    validate_image(image)

    height, width = image.shape[:2]

    mask = np.zeros(
        (height, width),
        dtype=np.uint8,
    )

    for x, y, region_width, region_height in regions:
        cv2.rectangle(
            mask,
            (x, y),
            (
                x + region_width,
                y + region_height,
            ),
            255,
            thickness=-1,
        )

    return mask