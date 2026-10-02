"""
NETRA Currency Detection Service — FastAPI Application
─────────────────────────────────────────────────────────────
Currency/denomination detection API for the NETRA React frontend,
powered by Microsoft's pretrained BankNote-Net encoder.

Endpoints
  POST /api/currency-detection   multipart/form-data, file field "image"
  GET  /api/health               are the models loaded?
  GET  /docs                     interactive Swagger UI (try uploads in the browser)

Flow
  React (currencyDetectionService.js) → POST image → FastAPI → BankNote-Net
    → { found, currency, denomination, confidence } → React

Before first run:
  python setup/download_and_train.py

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8001
"""

import logging
import time
from contextlib import asynccontextmanager
import os

# Set legacy Keras mode before importing anything that might import TensorFlow
os.environ["TF_USE_LEGACY_KERAS"] = "1"

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, get_settings
from .currency_engine import CurrencyEngine, CurrencyNotReadyError
from .image_utils import ImageError, decode_image
from .schemas import CurrencyDetectionResponse, ErrorResponse, HealthResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("netra.currency")

# multipart/form-data adds boundaries and headers on top of the file itself
MULTIPART_OVERHEAD_BYTES = 64 * 1024


class ApiError(Exception):
    """An error that should become a clean JSON error response."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    """Every error leaves the service in this shape (same style as the OCR service)."""
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "code": code, "message": message},
    )


def create_app(settings: Settings | None = None, engine: CurrencyEngine | None = None) -> FastAPI:
    """
    Builds the application. Both arguments exist so tests can inject a fake
    engine; normal start-up (`uvicorn app.main:app`) uses the defaults.
    """
    settings = settings or get_settings()
    engine = engine or CurrencyEngine(min_confidence=settings.min_confidence)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Load the models BEFORE serving requests, so "Application startup
        # complete" in the log really means "ready to detect currency".
        if settings.preload_model and not engine.ready:
            engine.try_load()
        yield

    app = FastAPI(
        title="NETRA Currency Detection Service",
        version="0.1.0",
        description="BankNote-Net based currency/denomination detection for the NETRA assistive vision app.",
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────
    # Order matters: the LAST middleware added is the OUTERMOST one.
    # CORS is added last so that even error responses from the middleware
    # and handlers below carry CORS headers.

    @app.middleware("http")
    async def reject_oversized_uploads(request: Request, call_next):
        declared = request.headers.get("content-length", "")
        if (
            request.method == "POST"
            and declared.isdigit()
            and int(declared) > settings.max_upload_bytes + MULTIPART_OVERHEAD_BYTES
        ):
            return error_response(
                413,
                "IMAGE_TOO_LARGE",
                f"Upload is too large. Maximum is {settings.max_upload_bytes // (1024 * 1024)} MB.",
            )
        return await call_next(request)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,  # the frontend sends no cookies
    )

    # ── Error handlers ────────────────────────────────────────

    @app.exception_handler(ApiError)
    async def handle_api_error(_request: Request, exc: ApiError):
        return error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, _exc: RequestValidationError):
        return error_response(
            400,
            "INVALID_REQUEST",
            "Send the image as multipart/form-data in a file field named 'image'.",
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_request: Request, exc: StarletteHTTPException):
        return error_response(exc.status_code, f"HTTP_{exc.status_code}", str(exc.detail))

    # ── Routes ────────────────────────────────────────────────

    @app.get("/api/health", response_model=HealthResponse, tags=["system"])
    async def health():
        """200 when the currency models are loaded, 503 when they are not."""
        body = HealthResponse(
            success=engine.ready,
            ready=engine.ready,
            num_classes=engine.num_classes,
            error=engine.load_error,
        )
        return JSONResponse(status_code=200 if engine.ready else 503, content=body.model_dump())

    @app.post(
        "/api/currency-detection",
        response_model=CurrencyDetectionResponse,
        tags=["currency-detection"],
        summary="Detect a banknote's currency and denomination in an image",
        responses={
            400: {"model": ErrorResponse, "description": "Missing, empty or invalid image"},
            413: {"model": ErrorResponse, "description": "Image too large"},
            500: {"model": ErrorResponse, "description": "Detection failed while processing the image"},
            503: {"model": ErrorResponse, "description": "Currency model is not loaded"},
        },
    )
    async def detect_currency(
        image: UploadFile = File(description="The image to analyze, as a multipart file field named 'image'"),
    ):
        """
        Runs the BankNote-Net encoder + classifier on the uploaded image.
        Returns `found: false` (HTTP 200) when nothing was recognized with
        confidence, rather than guessing.
        """
        started = time.perf_counter()

        if not engine.ready:
            raise ApiError(
                503,
                "MODEL_NOT_READY",
                "The currency detection engine is not available yet. Check the service logs.",
            )

        # Read at most limit+1 bytes: enough to know whether it is too big
        data = await image.read(settings.max_upload_bytes + 1)
        if len(data) > settings.max_upload_bytes:
            raise ApiError(
                413,
                "IMAGE_TOO_LARGE",
                f"Image is too large. Maximum is {settings.max_upload_bytes // (1024 * 1024)} MB.",
            )
        if not data:
            raise ApiError(400, "EMPTY_IMAGE", "The uploaded image is empty.")

        try:
            image_bgr, width, height = await run_in_threadpool(
                decode_image, data, settings.max_image_pixels
            )
        except ImageError as exc:
            raise ApiError(exc.status_code, exc.code, exc.message) from None

        # decode_image() returns BGR (OpenCV convention); the model wants RGB.
        image_rgb = image_bgr[:, :, ::-1]

        try:
            prediction = await run_in_threadpool(engine.detect, image_rgb)
        except CurrencyNotReadyError:
            raise ApiError(
                503,
                "MODEL_NOT_READY",
                "The currency detection engine is not available yet. Check the service logs.",
            ) from None
        except Exception:  # noqa: BLE001
            logger.exception("Currency detection failed")
            raise ApiError(
                500, "DETECTION_FAILED", "Currency detection failed. Please try again."
            ) from None

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "currency-detection: found=%s, %dx%d image, %d ms",
            prediction is not None, width, height, elapsed_ms,
        )

        if prediction is None:
            return CurrencyDetectionResponse(found=False, processing_ms=elapsed_ms)

        return CurrencyDetectionResponse(
            found=True,
            currency=prediction.currency,
            denomination=prediction.denomination,
            confidence=prediction.confidence,
            processing_ms=elapsed_ms,
        )

    return app


# The object uvicorn imports:  uvicorn app.main:app
app = create_app()
