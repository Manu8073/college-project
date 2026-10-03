"""
NETRA OCR Service — Response Schemas
─────────────────────────────────────────────────────────────
Pydantic models that define the JSON this service returns.

The success shape is what the React frontend's textDetectionService.js
already understands (see normalizeResponse() there):

    { "lines": [{ "text", "confidence", "box" }], "language": "en" }

The extra fields (image_width, image_height, processing_ms) are ignored
by the frontend and are there for debugging / future use.

Errors use the same shape as the NETRA Express backend
({ "success": false, "message": "..." }) plus a machine-readable "code".
"""

from pydantic import BaseModel, Field


class TextLine(BaseModel):
    """One line of text found in the image."""

    text: str = Field(description="The recognized text")
    confidence: float = Field(ge=0.0, le=1.0, description="Recognition confidence, 0.0 – 1.0")
    box: list[list[int]] = Field(
        description="Outline of the text as [[x, y], ...] pixel points "
        "(normally 4 corners), in the coordinates of the uploaded image"
    )


class TextDetectionResponse(BaseModel):
    """Successful response of POST /api/text-detection."""

    lines: list[TextLine] = Field(description="Detected lines, top to bottom. Empty if no text was found")
    language: str = Field(description="OCR language the service is running, e.g. 'en'")
    image_width: int = Field(description="Width in pixels of the image that was analysed")
    image_height: int = Field(description="Height in pixels of the image that was analysed")
    processing_ms: int = Field(description="Server time spent on this request, in milliseconds")


class ErrorResponse(BaseModel):
    """Body of every error response."""

    success: bool = False
    code: str = Field(description="Stable machine-readable error code, e.g. INVALID_IMAGE")
    message: str = Field(description="Human-readable explanation")


class HealthResponse(BaseModel):
    """Body of GET /api/health."""

    success: bool
    ready: bool = Field(description="True once the OCR model is loaded and requests can be served")
    language: str
    error: str | None = Field(default=None, description="Why the model failed to load, if it did")
