"""
NETRA OCR Service — Configuration
─────────────────────────────────────────────────────────────
Reads settings from environment variables (and from ocr-service/.env
if that file exists). Every setting has a safe default, so the service
runs without any .env file.

No secrets live here: this service needs no API keys.
"""

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

# Load ocr-service/.env before anything reads os.environ. This runs before
# PaddleOCR is imported, so PADDLE_PDX_* variables in .env take effect too.
load_dotenv()


def _env_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(f"{name} must be a whole number, got {raw!r}") from None


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return float(raw)
    except ValueError:
        raise ValueError(f"{name} must be a number, got {raw!r}") from None


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Immutable service settings."""

    ocr_lang: str                # PaddleOCR language, e.g. "en"
    min_confidence: float        # lines scoring below this are dropped (0.0 – 1.0)
    cors_origins: list[str]      # browser origins allowed to call the API
    max_upload_bytes: int        # reject uploads bigger than this
    max_image_pixels: int        # reject images with more pixels than this (width × height)
    preload_model: bool          # load the OCR model at start-up


def load_settings() -> Settings:
    """Builds Settings from the current environment."""
    settings = Settings(
        ocr_lang=_env_str("OCR_LANG", "en"),
        min_confidence=_env_float("OCR_MIN_CONFIDENCE", 0.5),
        cors_origins=_env_list(
            "CORS_ORIGINS",
            ["http://localhost:5173", "http://127.0.0.1:5173"],
        ),
        max_upload_bytes=_env_int("MAX_UPLOAD_MB", 10) * 1024 * 1024,
        max_image_pixels=_env_int("MAX_IMAGE_PIXELS", 25_000_000),
        preload_model=_env_bool("PRELOAD_MODEL", True),
    )

    if not 0.0 <= settings.min_confidence <= 1.0:
        raise ValueError("OCR_MIN_CONFIDENCE must be between 0.0 and 1.0")
    if settings.max_upload_bytes <= 0 or settings.max_image_pixels <= 0:
        raise ValueError("MAX_UPLOAD_MB and MAX_IMAGE_PIXELS must be positive")

    return settings


@lru_cache
def get_settings() -> Settings:
    """Cached settings used by the running app."""
    return load_settings()
