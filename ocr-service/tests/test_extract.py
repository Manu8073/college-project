"""
Tests for extract_lines() — the code that converts PaddleOCR 3.x output
into the service's own DetectedLine objects.

The fake results below have exactly the structure PaddleOCR.predict()
returns (a list with one dict-like result per image; keys rec_texts,
rec_scores, rec_polys).
"""

import numpy as np
import pytest

from app.ocr_engine import OcrInferenceError, extract_lines


def quad(x1, y1, x2, y2):
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.int16)


def test_converts_texts_scores_and_polygons():
    results = [
        {
            "rec_texts": ["STOP", "Exit"],
            "rec_scores": [0.99123456, np.float32(0.75)],
            "rec_polys": [quad(10, 10, 100, 40), quad(10, 60, 80, 90)],
        }
    ]
    lines = extract_lines(results, min_confidence=0.5)

    assert [l.text for l in lines] == ["STOP", "Exit"]
    assert lines[0].confidence == 0.9912
    assert lines[1].confidence == 0.75
    assert lines[0].box == [[10, 10], [100, 10], [100, 40], [10, 40]]
    assert all(isinstance(v, int) for point in lines[0].box for v in point)  # JSON-safe


def test_drops_low_confidence_empty_and_nan_lines():
    results = [
        {
            "rec_texts": ["keep", "too unsure", "   ", "nan line"],
            "rec_scores": [0.9, 0.3, 0.99, float("nan")],
            "rec_polys": [quad(0, 0, 5, 5)] * 4,
        }
    ]
    assert [l.text for l in extract_lines(results, min_confidence=0.5)] == ["keep"]


def test_min_confidence_zero_keeps_everything_with_text():
    results = [{"rec_texts": ["a", "b"], "rec_scores": [0.01, 0.02], "rec_polys": [quad(0, 0, 1, 1)] * 2}]
    assert len(extract_lines(results, min_confidence=0.0)) == 2


def test_no_text_found_gives_empty_list():
    results = [{"rec_texts": [], "rec_scores": [], "rec_polys": []}]
    assert extract_lines(results, 0.5) == []


def test_no_results_at_all_gives_empty_list():
    assert extract_lines([], 0.5) == []


def test_polygon_with_more_than_four_points_is_kept():
    poly = np.array([[0, 0], [10, 0], [20, 5], [10, 10], [0, 10], [-2, 5]])
    lines = extract_lines([{"rec_texts": ["curved"], "rec_scores": [0.9], "rec_polys": [poly]}], 0.5)
    assert len(lines[0].box) == 6


def test_float_polygon_is_rounded_to_ints():
    poly = np.array([[0.4, 0.6], [10.5, 0.2], [10.4, 9.7], [0.1, 9.9]], dtype=np.float32)
    lines = extract_lines([{"rec_texts": ["x"], "rec_scores": [0.9], "rec_polys": [poly]}], 0.5)
    assert lines[0].box == [[0, 1], [10, 0], [10, 10], [0, 10]]


def test_error_result_raises():
    with pytest.raises(OcrInferenceError):
        extract_lines([{"error": "the input params for model settings are invalid!"}], 0.5)


def test_works_with_real_paddlex_result_class():
    """Same check using PaddleX's own OCRResult class (skipped if PaddleOCR isn't installed)."""
    ocr_result = pytest.importorskip("paddlex.inference.pipelines.ocr.result")
    result = ocr_result.OCRResult(
        {
            "input_path": None,
            "page_index": None,
            "rec_texts": ["HELLO"],
            "rec_scores": [0.95],
            "rec_polys": [quad(1, 2, 30, 20)],
            "rec_boxes": np.array([[1, 2, 30, 20]]),
        }
    )
    lines = extract_lines([result], 0.5)
    assert [l.text for l in lines] == ["HELLO"]
    assert lines[0].box == [[1, 2], [30, 2], [30, 20], [1, 20]]
