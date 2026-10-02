"""
NETRA OCR Service — FastAPI Application
─────────────────────────────────────────────────────────────
Text detection API for the NETRA React frontend, powered by PaddleOCR.

Endpoints
  POST /api/text-detection   multipart/form-data, file field "image"
  GET  /api/health           is the OCR model loaded?
  GET  /docs                 interactive Swagger UI (try uploads in the browser)

Flow
  React (textDetectionService.js) → POST image → FastAPI → PaddleOCR
    → { lines: [...], language } → React

Run:  uvicorn app.main:app --host 127.0.0.1 --port 8000
"""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings, get_settings
from .image_utils import ImageError, decode_image
from .ocr_engine import OcrEngine, OcrNotReadyError
from .schemas import ErrorResponse, HealthResponse, TextDetectionResponse, TextLine

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("netra.ocr")

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
    """Every error leaves the service in this shape (same style as the Express backend)."""
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "code": code, "message": message},
    )


def create_app(settings: Settings | None = None, engine: OcrEngine | None = None) -> FastAPI:
    """
    Builds the application. Both arguments exist so tests can inject a fake
    engine; normal start-up (`uvicorn app.main:app`) uses the defaults.
    """
    settings = settings or get_settings()
    engine = engine or OcrEngine(lang=settings.ocr_lang, min_confidence=settings.min_confidence)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        # Load the model BEFORE serving requests, so "Application startup
        # complete" in the log really means "ready to read text".
        if settings.preload_model and not engine.ready:
            engine.try_load()
        yield

    app = FastAPI(
        title="NETRA OCR Service",
        version="0.1.0",
        description="PaddleOCR text detection for the NETRA assistive vision app.",
        lifespan=lifespan,
    )

    # ── Middleware ────────────────────────────────────────────
    # Order matters: the LAST middleware added is the OUTERMOST one.
    # CORS is added last so that even error responses from the middleware
    # and handlers below carry CORS headers — otherwise the browser would
    # hide a 413 or 503 behind a generic "CORS error".

    @app.middleware("http")
    async def reject_oversized_uploads(request: Request, call_next):
        # Cheap early check using the declared size, before the body is read.
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
        # Most likely: no "image" field, or the request wasn't multipart/form-data
        return error_response(
            400,
            "INVALID_REQUEST",
            "Send the image as multipart/form-data in a file field named 'image'.",
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_request: Request, exc: StarletteHTTPException):
        # 404 unknown route, 405 wrong method, …
        return error_response(exc.status_code, f"HTTP_{exc.status_code}", str(exc.detail))

    # ── Routes ────────────────────────────────────────────────

    @app.get("/api/health", response_model=HealthResponse, tags=["system"])
    async def health():
        """200 when the OCR model is loaded, 503 when it is not."""
        body = HealthResponse(
            success=engine.ready,
            ready=engine.ready,
            language=engine.lang,
            error=engine.load_error,
        )
        return JSONResponse(status_code=200 if engine.ready else 503, content=body.model_dump())

    @app.post(
        "/api/text-detection",
        response_model=TextDetectionResponse,
        tags=["text-detection"],
        summary="Detect text in an image",
        responses={
            400: {"model": ErrorResponse, "description": "Missing, empty or invalid image"},
            413: {"model": ErrorResponse, "description": "Image too large"},
            500: {"model": ErrorResponse, "description": "OCR failed while processing the image"},
            503: {"model": ErrorResponse, "description": "OCR model is not loaded"},
        },
    )
    async def detect_text(
        image: UploadFile = File(description="The image to read, as a multipart file field named 'image'"),
    ):
        """
        Runs PaddleOCR on the uploaded image and returns each detected line
        with its confidence and outline. Returns `lines: []` (HTTP 200)
        when the image contains no readable text.
        """
        started = time.perf_counter()

        if not engine.ready:
            raise ApiError(
                503,
                "MODEL_NOT_READY",
                "The OCR engine is not available yet. Check the OCR service logs.",
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

        try:
            found = await run_in_threadpool(engine.detect, image_bgr)
        except OcrNotReadyError:
            raise ApiError(
                503,
                "MODEL_NOT_READY",
                "The OCR engine is not available yet. Check the OCR service logs.",
            ) from None
        except Exception:  # noqa: BLE001
            # Log the details here; never send stack traces to the client.
            # (Also keeps the error inside the app, so CORS headers are still added.)
            logger.exception("OCR failed")
            raise ApiError(
                500, "OCR_FAILED", "Text detection failed. Please try again."
            ) from None

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        # Only counts and timing are logged — never the text itself (it may be private).
        logger.info("text-detection: %d line(s), %dx%d image, %d ms", len(found), width, height, elapsed_ms)

        return TextDetectionResponse(
            lines=[TextLine(text=l.text, confidence=l.confidence, box=l.box) for l in found],
            language=engine.lang,
            image_width=width,
            image_height=height,
            processing_ms=elapsed_ms,
        )

    return app


# The object uvicorn imports:  uvicorn app.main:app
app = create_app()
