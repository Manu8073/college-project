"""
NETRA Currency Detection Service — BankNote-Net Engine
─────────────────────────────────────────────────────────────
The only file that talks to the currency models. Wraps Microsoft's
pretrained BankNote-Net encoder + a shallow classifier trained on top
of it (see setup/download_and_train.py).

Model source: https://github.com/microsoft/banknote-net
(CDLA-Permissive-2.0 license). 17 currencies, 112 denominations.
"""

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger("netra.currency")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


@dataclass(frozen=True)
class CurrencyPrediction:
    """One recognized banknote."""

    currency: str          # e.g. "INR", "USD"
    denomination: str      # e.g. "500", "20"
    confidence: float      # 0.0 – 1.0


class CurrencyNotReadyError(RuntimeError):
    """The currency model is not loaded (still starting, or failed to load)."""


class CurrencyInferenceError(RuntimeError):
    """The model failed while processing an image."""


class CurrencyEngine:
    """Owns the encoder + classifier for the whole life of the server."""

    def __init__(self, min_confidence: float = 0.3):
        self.min_confidence = min_confidence
        self.load_error: str | None = None  # set if the models could not be loaded

        self._encoder = None
        self._classifier = None
        self._label_classes: np.ndarray | None = None
        # Keras predict() is not documented as thread-safe, and FastAPI runs
        # blocking work in a thread pool — so requests take turns.
        self._lock = threading.Lock()

    # ── Loading ───────────────────────────────────────────────

    @property
    def ready(self) -> bool:
        return self._encoder is not None and self._classifier is not None

    @property
    def num_classes(self) -> int | None:
        return len(self._label_classes) if self._label_classes is not None else None

    def load(self) -> None:
        """
        Loads the pretrained encoder and the classifier trained by
        setup/download_and_train.py. Raises if those files are missing —
        run the setup script first.

        Compatibility note:
          banknote_net_encoder.h5 was exported with TF/Keras 2.x.
          Keras 3.x (standalone) cannot deserialise some legacy layer
          configs (e.g. DepthwiseConv2D with extra keys). We therefore
          load it through tensorflow.keras which ships its own legacy
          H5 loader and handles these differences transparently.
        """
        # Use tf_keras which perfectly replicates Keras 2 behavior
        # and correctly parses the old BankNote-Net encoder.
        import tf_keras as keras

        encoder_path = MODELS_DIR / "banknote_net_encoder.h5"
        classifier_path = MODELS_DIR / "currency_classifier.h5"
        labels_path = MODELS_DIR / "label_classes.npy"

        for path in (encoder_path, classifier_path, labels_path):
            if not path.exists():
                raise FileNotFoundError(
                    f"{path.name} not found in {MODELS_DIR}. "
                    "Run `python setup/download_and_train.py` first."
                )

        logger.info("Loading currency detection models …")
        
        self._encoder = keras.models.load_model(
            str(encoder_path), 
            compile=False,
        )

        self._classifier = keras.models.load_model(
            str(classifier_path), 
            compile=False,
        )

        self._label_classes = np.load(labels_path, allow_pickle=True)
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
            self._encoder = None
            self._classifier = None
            self._label_classes = None
            self.load_error = f"{type(exc).__name__}: {exc}"[:400]
            logger.exception("Could not load currency detection models")
            return False

        self._warm_up()
        logger.info("Currency detection models ready (%d classes)", self.num_classes)
        return True

    def _warm_up(self) -> None:
        """Runs inference once on a blank image so the first real request isn't slow."""
        try:
            import tensorflow as tf
            blank = np.full((1, 224, 224, 3), 1.0, dtype=np.float32)
            # Need to convert to Tensor first for warm up if we use direct call
            blank_tf = tf.convert_to_tensor(blank)
            with self._lock:
                embedding = self._encoder(blank_tf, training=False)
                self._classifier(embedding, training=False)
        except Exception:  # noqa: BLE001 — warm-up is only an optimisation
            logger.warning("Currency model warm-up failed (continuing anyway)", exc_info=True)

    # ── Inference ─────────────────────────────────────────────

    def detect(self, image_rgb: np.ndarray) -> CurrencyPrediction | None:
        """
        Runs detection on an RGB uint8 image array of shape (height, width, 3).

        Blocking and CPU-heavy: call it from a worker thread, not directly
        from the async event loop.

        Returns None when the top prediction scores below min_confidence
        (i.e. "not confident this is a recognizable banknote").

        Raises CurrencyNotReadyError or CurrencyInferenceError.
        """
        if not self.ready:
            raise CurrencyNotReadyError("Currency model is not loaded")

        try:
            from PIL import Image

            resized = np.asarray(
                Image.fromarray(image_rgb).resize((224, 224)), dtype=np.float32
            ) / 255.0
            batch = np.expand_dims(resized, axis=0)

            with self._lock:
                embedding = self._encoder(batch, training=False).numpy()
                probs = self._classifier(embedding, training=False).numpy()[0]
        except CurrencyInferenceError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise CurrencyInferenceError(f"{type(exc).__name__}: {exc}") from exc

        top_idx = int(np.argmax(probs))
        confidence = float(probs[top_idx])
        if confidence < self.min_confidence:
            return None

        label = str(self._label_classes[top_idx])  # e.g. "INR_500"
        currency, _, denomination = label.partition("_")
        return CurrencyPrediction(
            currency=currency,
            denomination=denomination,
            confidence=round(min(1.0, max(0.0, confidence)), 4),
        )
