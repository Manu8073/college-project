"""
API tests — run the real FastAPI app with a FAKE OCR engine.

No PaddleOCR, no model download, no internet: these tests check everything
in the service EXCEPT the OCR model itself (request handling, validation,
error responses, CORS, response shape).

Run:  pytest -v      (from the ocr-service folder, venv active)
"""

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.ocr_engine import DetectedLine

ORIGIN = "http://localhost:5173"


class FakeEngine:
    """Stands in for OcrEngine. Records what it was given."""

    lang = "en"
    load_error = None

    def __init__(self, lines=None, ready=True, fail_with=None):
        self.lines = lines if lines is not None else []
        self.ready = ready
        self.fail_with = fail_with
        self.received = None

    def try_load(self):
        return self.ready

    def detect(self, image_bgr):
        self.received = image_bgr
        if self.fail_with:
            raise self.fail_with
        return self.lines


def make_settings(**overrides):
    values = dict(
        ocr_lang="en",
        min_confidence=0.5,
        cors_origins=[ORIGIN],
        max_upload_bytes=200_000,
        max_image_pixels=1_000_000,
        preload_model=False,
    )
    values.update(overrides)
    return Settings(**values)


def image_bytes(size=(64, 32), color=(255, 0, 0), fmt="PNG", mode="RGB", **save_kwargs):
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, fmt, **save_kwargs)
    return buffer.getvalue()


def make_client(engine=None, **settings_overrides):
    engine = engine or FakeEngine()
    return TestClient(create_app(make_settings(**settings_overrides), engine)), engine


def post_image(client, data, name="frame.jpg", mime="image/jpeg", headers=None):
    return client.post(
        "/api/text-detection", files={"image": (name, data, mime)}, headers=headers or {}
    )


SAMPLE_LINE = DetectedLine("EMERGENCY EXIT", 0.9871, [[10, 5], [120, 5], [120, 30], [10, 30]])


# ── Success ───────────────────────────────────────────────────

def test_success_matches_frontend_contract():
    client, _ = make_client(FakeEngine(lines=[SAMPLE_LINE]))
    response = post_image(client, image_bytes((200, 100)))

    assert response.status_code == 200
    body = response.json()
    assert body["language"] == "en"
    assert body["lines"] == [
        {
            "text": "EMERGENCY EXIT",
            "confidence": 0.9871,
            "box": [[10, 5], [120, 5], [120, 30], [10, 30]],
        }
    ]
    assert (body["image_width"], body["image_height"]) == (200, 100)
    assert isinstance(body["processing_ms"], int)


def test_no_text_is_200_with_empty_lines():
    client, _ = make_client(FakeEngine(lines=[]))
    response = post_image(client, image_bytes())
    assert response.status_code == 200
    assert response.json()["lines"] == []


def test_engine_receives_bgr_array():
    client, engine = make_client()
    post_image(client, image_bytes((40, 20), color=(255, 0, 0)))  # pure RED in RGB

    assert engine.received.shape == (20, 40, 3)
    assert engine.received.dtype == np.uint8
    assert engine.received[0, 0].tolist() == [0, 0, 255]  # …so BGR is [B=0, G=0, R=255]


def test_rgba_png_is_accepted():
    client, engine = make_client()
    response = post_image(client, image_bytes((30, 30), color=(0, 255, 0, 128), mode="RGBA"))
    assert response.status_code == 200
    assert engine.received.shape == (30, 30, 3)


def test_exif_rotation_is_applied():
    exif = Image.Exif()
    exif[0x0112] = 6  # "rotate 90° clockwise to display"
    client, engine = make_client()
    response = post_image(client, image_bytes((60, 20), fmt="JPEG", exif=exif.tobytes()))

    assert response.status_code == 200
    assert (response.json()["image_width"], response.json()["image_height"]) == (20, 60)
    assert engine.received.shape == (60, 20, 3)


# ── Bad requests ──────────────────────────────────────────────

def test_missing_image_field_is_400():
    client, _ = make_client()
    response = client.post("/api/text-detection", files={"wrong_name": ("a.jpg", image_bytes(), "image/jpeg")})
    assert response.status_code == 400
    assert response.json()["success"] is False
    assert response.json()["code"] == "INVALID_REQUEST"


def test_non_multipart_request_is_400():
    client, _ = make_client()
    response = client.post("/api/text-detection", json={"image": "not a file"})
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"


def test_empty_file_is_400():
    client, _ = make_client()
    response = post_image(client, b"")
    assert response.status_code == 400
    assert response.json()["code"] == "EMPTY_IMAGE"


def test_non_image_file_is_400():
    client, _ = make_client()
    response = post_image(client, b"this is definitely not an image", name="frame.jpg")
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_IMAGE"


def test_truncated_image_is_400():
    client, _ = make_client()
    response = post_image(client, image_bytes((300, 300), fmt="JPEG")[:200])
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_IMAGE"


def test_upload_far_over_limit_is_rejected_early_with_413():
    client, engine = make_client()  # limit 200 kB
    response = post_image(client, b"x" * 400_000)
    assert response.status_code == 413
    assert response.json()["code"] == "IMAGE_TOO_LARGE"
    assert engine.received is None


def test_upload_slightly_over_limit_is_413_from_handler():
    client, _ = make_client()  # limit 200 kB, header slack 64 kB
    response = post_image(client, b"x" * 210_000)
    assert response.status_code == 413
    assert response.json()["code"] == "IMAGE_TOO_LARGE"


def test_too_many_pixels_is_413():
    client, engine = make_client()  # limit 1,000,000 px
    response = post_image(client, image_bytes((1500, 1000)))  # 1.5 MP, tiny PNG file
    assert response.status_code == 413
    assert response.json()["code"] == "IMAGE_TOO_LARGE"
    assert engine.received is None


# ── Server-side failures ──────────────────────────────────────

def test_model_not_ready_is_503():
    client, _ = make_client(FakeEngine(ready=False))
    response = post_image(client, image_bytes())
    assert response.status_code == 503
    assert response.json()["code"] == "MODEL_NOT_READY"


def test_ocr_crash_is_500_without_leaking_details():
    client, _ = make_client(FakeEngine(fail_with=RuntimeError("secret /Users/x/model.pdiparams")))
    response = post_image(client, image_bytes())
    assert response.status_code == 500
    assert response.json()["code"] == "OCR_FAILED"
    assert "secret" not in response.text


# ── Health, unknown routes ────────────────────────────────────

def test_health_ready():
    client, _ = make_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["ready"] is True


def test_health_not_ready_is_503():
    engine = FakeEngine(ready=False)
    engine.load_error = "Exception: no model source"
    client, _ = make_client(engine)
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["ready"] is False
    assert response.json()["error"] == "Exception: no model source"


def test_unknown_route_is_json_404():
    client, _ = make_client()
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_get_on_detection_route_is_json_405():
    client, _ = make_client()
    response = client.get("/api/text-detection")
    assert response.status_code == 405
    assert response.json()["success"] is False


# ── CORS ──────────────────────────────────────────────────────

def test_cors_header_for_allowed_origin():
    client, _ = make_client()
    response = post_image(client, image_bytes(), headers={"Origin": ORIGIN})
    assert response.headers["access-control-allow-origin"] == ORIGIN


def test_cors_header_absent_for_unknown_origin():
    client, _ = make_client()
    response = post_image(client, image_bytes(), headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_cors_preflight():
    client, _ = make_client()
    response = client.options(
        "/api/text-detection",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert "POST" in response.headers["access-control-allow-methods"]


@pytest.mark.parametrize(
    "engine, data, expected_status",
    [
        (FakeEngine(ready=False), image_bytes(), 503),
        (FakeEngine(), b"", 400),
        (FakeEngine(), b"x" * 400_000, 413),
    ],
)
def test_error_responses_still_carry_cors_headers(engine, data, expected_status):
    client, _ = make_client(engine)
    response = post_image(client, data, headers={"Origin": ORIGIN})
    assert response.status_code == expected_status
    assert response.headers["access-control-allow-origin"] == ORIGIN
