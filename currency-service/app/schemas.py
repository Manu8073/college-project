"""
NETRA Currency Detection Service — Response Schemas
─────────────────────────────────────────────────────────────
Pydantic models that define the JSON this service returns.

The success shape is what the frontend's currencyDetectionService.js
already understands:

    { "found": true, "currency": "INR", "denomination": "500", "confidence": 0.93 }

Errors use the same shape as the NETRA OCR service and Express backend
({ "success": false, "message": "..." }) plus a machine-readable "code".
"""

from pydantic import BaseModel, Field


class CurrencyDetectionResponse(BaseModel):
    """Successful response of POST /api/currency-detection."""

    found: bool = Field(description="False when no banknote was confidently recognized")
    currency: str | None = Field(default=None, description="Currency code, e.g. 'INR', 'USD'")
    denomination: str | None = Field(default=None, description="Denomination, e.g. '500'")
    confidence: float | None = Field(default=None, ge=0.0, le=1.0, description="0.0 - 1.0")
    processing_ms: int = Field(description="Server time spent on this request, in milliseconds")


class ErrorResponse(BaseModel):
    """Body of every error response."""

    success: bool = False
    code: str = Field(description="Stable machine-readable error code, e.g. IMAGE_TOO_LARGE")
    message: str = Field(description="Human-readable explanation")


class HealthResponse(BaseModel):
    """Body of GET /api/health."""

    success: bool
    ready: bool = Field(description="True once the models are loaded and requests can be served")
    num_classes: int | None = Field(default=None, description="Number of currency+denomination classes")
    error: str | None = Field(default=None, description="Why the models failed to load, if they did")
