"""Perspective correction operations for document images."""

import cv2
import numpy as np

from src.image_enhancement.enhance import convert_to_grayscale
from src.image_enhancement.utils import validate_image

_MINIMUM_DOCUMENT_AREA_RATIO = 0.20
_APPROXIMATION_EPSILON_RATIO = 0.02
_CANNY_LOWER_THRESHOLD = 50
_CANNY_UPPER_THRESHOLD = 150
_GAUSSIAN_KERNEL_SIZE = (5, 5)


def correct_perspective(
    image: np.ndarray,
) -> np.ndarray:
    """
    Correct the perspective distortion of a document image.

    If document corners cannot be detected, the original image
    is returned unchanged.

    Args:
        image: Input document image.

    Returns:
        Perspective-corrected document image.
    """
    validate_image(image)

    try:
        document_corners = _detect_document_corners(
            image
        )

    # Documents that are already scanned may not expose
    # detectable page boundaries. In such cases, skip
    # perspective correction and continue preprocessing.
    except ValueError:
        return image

    ordered_corners = _order_corner_points(
        document_corners
    )

    output_width, output_height = (
        _compute_destination_size(
            ordered_corners
        )
    )

    destination_points = np.array(
        [
            [0.0, 0.0],
            [output_width - 1.0, 0.0],
            [output_width - 1.0, output_height - 1.0],
            [0.0, output_height - 1.0],
        ],
        dtype=np.float32,
    )

    transform_matrix = cv2.getPerspectiveTransform(
        ordered_corners,
        destination_points,
    )

    return cv2.warpPerspective(
        image,
        transform_matrix,
        (output_width, output_height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _order_corner_points(
    corners: np.ndarray,
) -> np.ndarray:
    """
    Order corner points as top-left, top-right, bottom-right,
    and bottom-left.

    Args:
        corners: Four unordered corner points.

    Returns:
        Ordered corner points.
    """
    ordered_corners = np.zeros(
        (4, 2),
        dtype=np.float32,
    )

    coordinate_sums = corners.sum(
        axis=1
    )

    coordinate_differences = np.diff(
        corners,
        axis=1,
    ).reshape(-1)

    ordered_corners[0] = corners[
        np.argmin(coordinate_sums)
    ]
    ordered_corners[2] = corners[
        np.argmax(coordinate_sums)
    ]
    ordered_corners[1] = corners[
        np.argmin(coordinate_differences)
    ]
    ordered_corners[3] = corners[
        np.argmax(coordinate_differences)
    ]

    return ordered_corners


def _compute_destination_size(
    ordered_corners: np.ndarray,
) -> tuple[int, int]:
    """
    Compute the destination image size from ordered document corners.

    Args:
        ordered_corners: Corner points ordered clockwise.

    Returns:
        Output width and height.
    """
    top_left, top_right, bottom_right, bottom_left = (
        ordered_corners
    )

    top_width = np.linalg.norm(
        top_right - top_left
    )
    bottom_width = np.linalg.norm(
        bottom_right - bottom_left
    )

    left_height = np.linalg.norm(
        bottom_left - top_left
    )
    right_height = np.linalg.norm(
        bottom_right - top_right
    )

    output_width = max(
        1,
        int(round(max(top_width, bottom_width))),
    )

    output_height = max(
        1,
        int(round(max(left_height, right_height))),
    )

    return output_width, output_height


def _detect_document_corners(
    image: np.ndarray,
) -> np.ndarray:
    """
    Detect the four outer corners of a document.

    Args:
        image: Input document image.

    Returns:
        Four detected document corner points.

    Raises:
        ValueError: If a suitable four-corner document contour
            cannot be detected.
    """
    grayscale_image = convert_to_grayscale(
        image
    )

    blurred_image = cv2.GaussianBlur(
        grayscale_image,
        _GAUSSIAN_KERNEL_SIZE,
        0,
    )

    edge_image = cv2.Canny(
        blurred_image,
        _CANNY_LOWER_THRESHOLD,
        _CANNY_UPPER_THRESHOLD,
    )

    morphology_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (7, 7),
    )

    closed_edges = cv2.morphologyEx(
        edge_image,
        cv2.MORPH_CLOSE,
        morphology_kernel,
        iterations=2,
    )

    contours, _ = cv2.findContours(
        closed_edges,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )

    image_height, image_width = image.shape[:2]
    image_area = image_height * image_width

    sorted_contours = sorted(
        contours,
        key=cv2.contourArea,
        reverse=True,
    )

    for contour in sorted_contours:
        contour_area = cv2.contourArea(
            contour
        )

        if (
            contour_area
            < image_area * _MINIMUM_DOCUMENT_AREA_RATIO
        ):
            continue

        perimeter = cv2.arcLength(
            contour,
            True,
        )

        approximated_contour = cv2.approxPolyDP(
            contour,
            _APPROXIMATION_EPSILON_RATIO * perimeter,
            True,
        )

        if len(approximated_contour) == 4:
            return approximated_contour.reshape(
                4,
                2,
            ).astype(np.float32)

        if len(approximated_contour) > 4:
            rectangle = cv2.minAreaRect(
                contour
            )

            box_points = cv2.boxPoints(
                rectangle
            )

            return box_points.astype(
                np.float32
            )

    raise ValueError(
        "Document corners could not be detected."
    )

