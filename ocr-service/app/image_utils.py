"""
NETRA OCR Service — Image Decoding
─────────────────────────────────────────────────────────────
Turns the uploaded bytes into the array PaddleOCR expects, and rejects
anything that is not a usable image. Everything happens in memory —
uploaded images are never written to disk by this code.
"""

import io

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError


class ImageError(Exception):
    """The upload cannot be used. Carries the HTTP status to answer with."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def decode_image(data: bytes, max_pixels: int) -> tuple[np.ndarray, int, int]:
    """
    Decodes image bytes (JPEG, PNG, WebP, BMP, GIF, TIFF …).

    Returns (image_bgr, width, height) where image_bgr is a contiguous
    uint8 array of shape (height, width, 3) in BGR channel order — the
    order PaddleOCR expects for numpy input (the OpenCV convention).

    Raises ImageError for corrupt / non-image data or oversized images.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            # Image.open() is lazy: size is known before pixels are decoded,
            # so a huge image is refused before it uses any memory.
            if img.width * img.height > max_pixels:
                raise ImageError(
                    413,
                    "IMAGE_TOO_LARGE",
                    f"Image is too large ({img.width}×{img.height}). "
                    f"Maximum is {max_pixels:,} pixels.",
                )

            img = ImageOps.exif_transpose(img)  # honour phone-camera rotation
            rgb = img.convert("RGB")            # also handles PNG alpha, greyscale, palette
            pixels = np.asarray(rgb)
    except ImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError):
        raise ImageError(
            400,
            "INVALID_IMAGE",
            "The uploaded file is not a valid image. Send a JPEG, PNG or WebP image.",
        ) from None

    height, width = pixels.shape[:2]
    bgr = np.ascontiguousarray(pixels[:, :, ::-1])  # RGB → BGR
    return bgr, width, height
