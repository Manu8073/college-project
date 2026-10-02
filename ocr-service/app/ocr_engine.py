"""
NETRA OCR Service — PaddleOCR Engine
─────────────────────────────────────────────────────────────
The only file that talks to PaddleOCR. Everything else in the service
works with plain Python objects (DetectedLine), so if PaddleOCR's API
changes again, this is the one file to update.

PaddleOCR API used (PaddleOCR 3.x):
  • PaddleOCR(lang=..., use_doc_orientation_classify=..., ...)  — load once
  • ocr.predict(numpy_image)                                    — run OCR
  • result["rec_texts"], result["rec_scores"], result["rec_polys"]

NOT used (deprecated in 3.x): ocr.ocr(...), use_angle_cls, cls=...,
show_log, use_gpu, det_model_dir / rec_model_dir.
"""

import logging
import math
import threading
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger("netra.ocr")


@dataclass(frozen=True)
class DetectedLine:
    """One recognized line of text."""

    text: str
    confidence: float          # 0.0 – 1.0
    box: list[list[int]]       # [[x, y], ...] outline, image pixel coordinates


class OcrNotReadyError(RuntimeError):
    """The OCR model is not loaded (still starting, or failed to load)."""


class OcrInferenceError(RuntimeError):
    """PaddleOCR failed while processing an image."""


class OcrEngine:
    """Owns one PaddleOCR pipeline for the whole life of the server."""

    def __init__(self, lang: str = "en", min_confidence: float = 0.5):
        self.lang = lang
        self.min_confidence = min_confidence
        self.load_error: str | None = None  # set if the model could not be loaded

        self._ocr = None
        # The Paddle predictor is not documented as thread-safe, and FastAPI
        # runs blocking work in a thread pool — so requests take turns.
        self._lock = threading.Lock()

    # ── Loading ───────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._ocr is not None

    def load(self) -> None:
        """
        Creates the PaddleOCR pipeline. On the very first run this downloads
        the model files (needs internet); afterwards they are cached in
        ~/.paddlex and loading takes a few seconds.
        """
        # Imported here (not at the top of the file) so importing this module
        # is instant and the tests can run without PaddleOCR installed.
        from paddleocr import PaddleOCR

        logger.info("Loading PaddleOCR (lang=%s) …", self.lang)
        self._ocr = PaddleOCR(
            lang=self.lang,
            # These three are for scanned documents / upside-down text lines.
            # NETRA reads camera frames, so they are off — faster on CPU.
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        self.load_error = None

    def try_load(self) -> bool:
        """
        Like load(), but never raises: on failure the reason is stored in
        load_error and the server keeps running (answering 503) so the
        problem is visible through /api/health instead of a crashed process.
        """
        try:
            self.load()
        except Exception as exc:  # noqa: BLE001 — any failure must be reported, not crash the server
            self._ocr = None
            self.load_error = f"{type(exc).__name__}: {exc}"[:400]
            logger.exception("Could not load PaddleOCR")
            return False

        self._warm_up()
        logger.info("PaddleOCR is ready")
        return True

    def _warm_up(self) -> None:
        """Runs OCR once on a blank image so the first real request isn't slow."""
        try:
            blank = np.full((96, 320, 3), 255, dtype=np.uint8)
            with self._lock:
                self._ocr.predict(blank)
        except Exception:  # noqa: BLE001 — warm-up is only an optimisation
            logger.warning("OCR warm-up failed (continuing anyway)", exc_info=True)

    # ── Inference ─────────────────────────────────────────────

    def detect(self, image_bgr: np.ndarray) -> list[DetectedLine]:
        """
        Runs OCR on a BGR uint8 image array of shape (height, width, 3).

        Blocking and CPU-heavy: call it from a worker thread, not directly
        from the async event loop.

        Raises OcrNotReadyError or OcrInferenceError.
        """
        if not self.ready:
            raise OcrNotReadyError("OCR model is not loaded")

        try:
            with self._lock:
                results = self._ocr.predict(image_bgr)
            return extract_lines(results, self.min_confidence)
        except OcrInferenceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise OcrInferenceError(f"{type(exc).__name__}: {exc}") from exc


def extract_lines(results, min_confidence: float) -> list[DetectedLine]:
    """
    Converts PaddleOCR's predict() output into DetectedLine objects.

    predict() returns a list with one result per input image. Each result
    behaves like a dict; for text OCR these keys matter:
        rec_texts  — list[str]            recognized text of each line
        rec_scores — list[float]          confidence of each line
        rec_polys  — list[ndarray (N,2)]  outline of each line (usually 4 corners)

    Lines that are empty or score below min_confidence are dropped.
    """
    lines: list[DetectedLine] = []

    for result in results:
        if "error" in result:
            raise OcrInferenceError(str(result["error"]))

        texts = list(result.get("rec_texts", []))
        scores = list(result.get("rec_scores", []))
        polys = list(result.get("rec_polys", []))

        for text, score, poly in zip(texts, scores, polys):
            text = str(text).strip()
            confidence = float(score)

            if not text or math.isnan(confidence) or confidence < min_confidence:
                continue

            points = np.asarray(poly).reshape(-1, 2)
            box = [[int(round(x)), int(round(y))] for x, y in points]

            lines.append(
                DetectedLine(
                    text=text,
                    confidence=round(min(1.0, max(0.0, confidence)), 4),
                    box=box,
                )
            )

    return lines
