"""Removal of long non-text lines from document images."""

import cv2
import numpy as np

from src.image_enhancement.utils import (
    is_grayscale,
    validate_image,
)


DEFAULT_MIN_LINE_LENGTH_RATIO = 0.35
DEFAULT_MAX_LINE_GAP = 20
DEFAULT_HOUGH_THRESHOLD = 80
DEFAULT_LINE_THICKNESS = 5


def remove_long_lines(
    image: np.ndarray,
    min_line_length_ratio: float = DEFAULT_MIN_LINE_LENGTH_RATIO,
    max_line_gap: int = DEFAULT_MAX_LINE_GAP,
    hough_threshold: int = DEFAULT_HOUGH_THRESHOLD,
    line_thickness: int = DEFAULT_LINE_THICKNESS,
) -> np.ndarray:
    """
    Detect and remove long straight lines while preserving text strokes.

    Args:
        image: Grayscale or binary document image.
        min_line_length_ratio: Minimum detected line length relative
            to the image width.
        max_line_gap: Maximum gap allowed between line segments.
        hough_threshold: Minimum Hough accumulator threshold.
        line_thickness: Thickness of the removal mask.

    Returns:
        Image with long detected lines replaced by white pixels.
    """
    validate_image(image)

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

    height, width = grayscale_image.shape[:2]

    edges = cv2.Canny(
        grayscale_image,
        50,
        150,
        apertureSize=3,
    )

    min_line_length = int(
        width * min_line_length_ratio
    )

    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=hough_threshold,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        return grayscale_image.copy()

    result = grayscale_image.copy()

    for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
        delta_x = x2 - x1
        delta_y = y2 - y1

        line_length = np.hypot(
            delta_x,
            delta_y,
        )

        if line_length < min_line_length:
            continue

        angle = abs(
            np.degrees(
                np.arctan2(
                    delta_y,
                    delta_x,
                )
            )
        )

        # 0–180 derece aralığına normalize et
        if angle > 180:
            angle %= 180

        if angle > 90:
            angle = 180 - angle

        # Yatay veya yataya yakın çizgileri koru.
        # Bunlar Osmanlıca metin satırlarının parçası olabilir.
        if angle < 15:
            continue

        # Dikey çizgileri de şimdilik koru.
        # Çerçeve ve sayfa sınırları için ayrı işlem yapacağız.
        if angle > 75:
            continue

        cv2.line(
            result,
            (int(x1), int(y1)),
            (int(x2), int(y2)),
            255,
            thickness=line_thickness,
        )
    return result

def remove_fold_lines_with_text_protection(
    binary_image: np.ndarray,
    text_mask: np.ndarray,
    horizontal_ratio: float = 0.35,
    vertical_ratio: float = 0.20,
    protection_dilation: int = 2,
) -> np.ndarray:
    """
    Remove long horizontal and vertical fold-like lines while
    protecting pixels identified as text.

    Args:
        binary_image:
            Binary document image. Text/foreground is expected
            to be black (0), background white (255).

        text_mask:
            Binary protection mask. Text pixels are white (255).

        horizontal_ratio:
            Minimum horizontal line length relative to image width.

        vertical_ratio:
            Minimum vertical line length relative to image height.

        protection_dilation:
            Extra protection around detected text pixels.

    Returns:
        Binary image with safe fold-line pixels removed.
    """

    validate_image(binary_image)

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D binary image."
        )

    if text_mask.shape != binary_image.shape:
        raise ValueError(
            "text_mask and binary_image must have the same shape."
        )

    height, width = binary_image.shape

    # Binary image has black foreground.
    # Morphology works more naturally with white foreground,
    # so invert it.
    foreground = cv2.bitwise_not(
        binary_image
    )

    component_line_mask = detect_fold_line_components(
        binary_image,
        min_horizontal_ratio=0.30,
        min_vertical_ratio=0.20,
        max_horizontal_thickness=12,
        max_vertical_thickness=12,
    )

    cv2.imwrite(
        "outputs/debug_component_lines.png",
        component_line_mask,
    )

    fragmented_vertical_mask = detect_fragmented_vertical_fold(
        binary_image,
        min_component_height=8,
        max_component_width=18,
        x_tolerance=14,
        min_total_height_ratio=0.22,
        max_gap=45,
    )

    bottom_artifact_mask = detect_bottom_edge_artifacts(
        binary_image,
        bottom_zone_ratio=0.12,
        min_width_ratio=0.15,
        max_distance_from_bottom=25,
    )

    cv2.imwrite(
        "outputs/debug_bottom_artifacts.png",
        bottom_artifact_mask,
    )


    cv2.imwrite(
        "outputs/debug_fragmented_vertical.png",
        fragmented_vertical_mask,
    )

    horizontal_length = max(
        30,
        int(width * horizontal_ratio),
    )

    vertical_length = max(
        30,
        int(height * vertical_ratio),
    )

    horizontal_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (horizontal_length, 1),
    )

    vertical_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (1, vertical_length),
    )

    horizontal_connect_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (9, 3),
    )

    vertical_connect_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (3, 9),
    )

    horizontal_connected = cv2.morphologyEx(
        foreground,
        cv2.MORPH_CLOSE,
        horizontal_connect_kernel,
        iterations=1,
    )

    vertical_connected = cv2.morphologyEx(
        foreground,
        cv2.MORPH_CLOSE,
        vertical_connect_kernel,
        iterations=1,
    )

    horizontal_lines = cv2.morphologyEx(
        foreground,
        cv2.MORPH_OPEN,
        horizontal_kernel,
    )

    vertical_lines = cv2.morphologyEx(
        foreground,
        cv2.MORPH_OPEN,
        vertical_kernel,
    )

    component_line_mask = detect_fold_line_components(
        binary_image,
        min_horizontal_ratio=0.30,
        min_vertical_ratio=0.20,
        max_horizontal_thickness=12,
        max_vertical_thickness=12,
    )

    line_mask = cv2.bitwise_or(
        horizontal_lines,
        vertical_lines,
    )

    line_mask = cv2.bitwise_or(
        line_mask,
        component_line_mask,
    )

    # Protect not only exact text pixels but also a small
    # neighbourhood around them.
    protection_kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (
            2 * protection_dilation + 1,
            2 * protection_dilation + 1,
        ),
    )

    protected_text = cv2.dilate(
        text_mask,
        protection_kernel,
        iterations=1,
    )

    # Remove only line pixels that are NOT protected as text.
    safe_line_mask = cv2.bitwise_and(
        line_mask,
        cv2.bitwise_not(
            protected_text
        ),
    )

    safe_fragmented_vertical_mask = cv2.bitwise_and(
        fragmented_vertical_mask,
        cv2.bitwise_not(
            protected_text
        ),
    )

    safe_line_mask = cv2.bitwise_or(
        safe_line_mask,
        safe_fragmented_vertical_mask,
    )

    safe_bottom_artifact_mask = cv2.bitwise_and(
        bottom_artifact_mask,
        cv2.bitwise_not(
            protected_text
        ),
    )

    safe_line_mask = cv2.bitwise_or(
            safe_line_mask,
            safe_bottom_artifact_mask,
        )

    cv2.imwrite(
        "outputs/debug_safe_bottom_artifacts.png",
        safe_bottom_artifact_mask,
    )



    cv2.imwrite(
        "outputs/debug_horizontal_lines.png",
        horizontal_lines,
    )

    cv2.imwrite(
        "outputs/debug_vertical_lines.png",
        vertical_lines,
    )

    cv2.imwrite(
        "outputs/debug_safe_line_mask.png",
        safe_line_mask,
    )

    result = binary_image.copy()

    result[
        safe_line_mask > 0
    ] = 255

    return result

def detect_fold_line_components(
    binary_image: np.ndarray,
    min_horizontal_ratio: float = 0.30,
    min_vertical_ratio: float = 0.20,
    max_horizontal_thickness: int = 12,
    max_vertical_thickness: int = 12,
) -> np.ndarray:

    validate_image(binary_image)

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D binary image."
        )

    height, width = binary_image.shape

    foreground = cv2.bitwise_not(
        binary_image
    )

    number_of_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            foreground,
            connectivity=8,
        )
    )

    line_mask = np.zeros_like(
        binary_image,
        dtype=np.uint8,
    )

    for label in range(
        1,
        number_of_labels,
    ):
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

        is_horizontal = (
            component_width
            >= width * min_horizontal_ratio
            and component_height
            <= max_horizontal_thickness
        )

        is_vertical = (
            component_height
            >= height * min_vertical_ratio
            and component_width
            <= max_vertical_thickness
        )

        if not (
            is_horizontal
            or is_vertical
        ):
            continue

        component_mask = (
            labels == label
        )

        line_mask[
            component_mask
        ] = 255

    return line_mask

def detect_fragmented_vertical_fold(
    binary_image: np.ndarray,
    min_component_height: int = 8,
    max_component_width: int = 18,
    x_tolerance: int = 14,
    min_total_height_ratio: float = 0.22,
    max_gap: int = 45,
) -> np.ndarray:
    """
    Detect vertically aligned fragmented fold-line components.

    Small vertical fragments that lie on nearly the same x-axis
    are grouped together. If their combined vertical coverage is
    large enough, they are treated as one fragmented fold line.
    """

    validate_image(binary_image)

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D binary image."
        )

    height, width = binary_image.shape

    foreground = cv2.bitwise_not(
        binary_image
    )

    number_of_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            foreground,
            connectivity=8,
        )
    )

    candidates = []

    for label in range(
        1,
        number_of_labels,
    ):
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

        if component_height < min_component_height:
            continue

        if component_width > max_component_width:
            continue

        center_x = (
            x
            + component_width / 2
        )

        aspect_ratio = (
            component_height
            / max(component_width, 1)
        )

        if aspect_ratio < 2.0:
            continue

        candidates.append(
            {
                "label": label,
                "x": x,
                "y": y,
                "width": component_width,
                "height": component_height,
                "center_x": center_x,
                "bottom": y + component_height,
            }
        )

    if not candidates:
        return np.zeros_like(
            binary_image,
            dtype=np.uint8,
        )

    candidates.sort(
        key=lambda item: (
            item["center_x"],
            item["y"],
        )
    )

    groups = []

    for candidate in candidates:
        best_group = None
        best_distance = None

        for group in groups:
            group_center_x = float(
                np.mean(
                    [
                        item["center_x"]
                        for item in group
                    ]
                )
            )

            distance = abs(
                candidate["center_x"]
                - group_center_x
            )

            if distance <= x_tolerance:
                if (
                    best_distance is None
                    or distance < best_distance
                ):
                    best_group = group
                    best_distance = distance

        if best_group is None:
            groups.append(
                [candidate]
            )
        else:
            best_group.append(
                candidate
            )

    output_mask = np.zeros_like(
        binary_image,
        dtype=np.uint8,
    )

    minimum_total_height = (
        height
        * min_total_height_ratio
    )

    for group in groups:
        if len(group) < 2:
            continue

        group.sort(
            key=lambda item: item["y"]
        )

        accepted = [
            group[0]
        ]

        for candidate in group[1:]:
            previous = accepted[-1]

            gap = (
                candidate["y"]
                - previous["bottom"]
            )

            if gap <= max_gap:
                accepted.append(
                    candidate
                )

        if len(accepted) < 2:
            continue

        total_height = sum(
            item["height"]
            for item in accepted
        )

        vertical_start = min(
            item["y"]
            for item in accepted
        )

        vertical_end = max(
            item["bottom"]
            for item in accepted
        )

        vertical_span = (
            vertical_end
            - vertical_start
        )

        minimum_vertical_span = (
            height * 0.20
        )

        if vertical_span < minimum_vertical_span:
            continue

        # Divide the vertical span into bins and check how many
        # different height levels contain fold candidates.
        bin_count = 8

        occupied_bins = set()

        for item in accepted:
            center_y = (
                item["y"]
                + item["height"] / 2
            )

            relative_y = (
                center_y - vertical_start
            )

            bin_index = int(
                relative_y
                / max(vertical_span, 1)
                * bin_count
            )

            bin_index = min(
                bin_index,
                bin_count - 1,
            )

            occupied_bins.add(
                bin_index
            )

        minimum_occupied_bins = 4

        if len(occupied_bins) < minimum_occupied_bins:
            continue


        for item in accepted:
            output_mask[
                labels == item["label"]
            ] = 255

    return output_mask

def detect_bottom_edge_artifacts(
    binary_image: np.ndarray,
    bottom_zone_ratio: float = 0.10,
    min_width_ratio: float = 0.20,
    max_distance_from_bottom: int = 8,
) -> np.ndarray:
    """
    Detect wide irregular artifacts located near the bottom edge
    of a binary document image.

    This function only creates a detection mask.
    It does not modify the document.
    """

    validate_image(binary_image)

    if binary_image.ndim != 2:
        raise ValueError(
            "binary_image must be a 2D binary image."
        )

    height, width = binary_image.shape

    zone_height = max(
        20,
        int(height * bottom_zone_ratio),
    )

    zone_start = (
        height - zone_height
    )

    bottom_zone = binary_image[
        zone_start:height,
        :
    ]

    # Black foreground -> white foreground
    foreground = cv2.bitwise_not(
        bottom_zone
    )

    # Only inside the bottom zone:
    # connect small gaps belonging to the same border/artifact.
    connection_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (9, 3),
    )

    connected = cv2.morphologyEx(
        foreground,
        cv2.MORPH_CLOSE,
        connection_kernel,
        iterations=1,
    )

    number_of_labels, labels, stats, _ = (
        cv2.connectedComponentsWithStats(
            connected,
            connectivity=8,
        )
    )

    output_mask = np.zeros_like(
        binary_image,
        dtype=np.uint8,
    )

    minimum_width = (
        width * min_width_ratio
    )

    for label in range(
        1,
        number_of_labels,
    ):
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

        component_bottom = (
            y + component_height
        )

        distance_from_bottom = (
            zone_height
            - component_bottom
        )

        if component_width < minimum_width:
            continue

        if (
            distance_from_bottom
            > max_distance_from_bottom
        ):
            continue

        component_mask = (
            labels == label
        )

        target_area = output_mask[
            zone_start:height,
            :
        ]

        target_area[
            component_mask
        ] = 255

    return output_mask