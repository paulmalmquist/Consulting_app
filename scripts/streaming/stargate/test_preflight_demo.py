"""Unit tests for the demo preflight decision logic (no network).

Run: python -m pytest scripts/streaming/stargate/test_preflight_demo.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import preflight_demo as pf  # noqa: E402


def test_xlsx_valid_workbook_passes():
    level, _ = pf.classify_xlsx(200, pf.XLSX_CONTENT_TYPE, b"PK\x03\x04rest")
    assert level == "PASS"


def test_xlsx_non_200_fails():
    level, detail = pf.classify_xlsx(500, pf.XLSX_CONTENT_TYPE, b"PK")
    assert level == "FAIL" and "500" in detail


def test_xlsx_wrong_content_type_fails():
    level, _ = pf.classify_xlsx(200, "text/html", b"PK")
    assert level == "FAIL"


def test_xlsx_corrupt_binary_fails():
    # proxy mangled the body (no zip magic) -> caught
    level, detail = pf.classify_xlsx(200, pf.XLSX_CONTENT_TYPE, b"<html>")
    assert level == "FAIL" and "zip magic" in detail


def test_unknown_dataset_404_with_null_reason_passes():
    level, detail = pf.classify_unknown_dataset(404, {"null_reason": "export_dataset_not_allowed"})
    assert level == "PASS" and "export_dataset_not_allowed" in detail


def test_unknown_dataset_200_fails():
    # a silent success on an unknown dataset is a fail-closed violation
    level, _ = pf.classify_unknown_dataset(200, {"rows": []})
    assert level == "FAIL"


def test_stream_with_rows_is_safe_to_show():
    level, action, _ = pf.recommend_stream(3, True)
    assert level == "PASS" and "SAFE" in action


def test_stream_cold_is_warn_not_fail():
    level, action, detail = pf.recommend_stream(0, False)
    assert level == "WARN" and "COLD" in action
    assert "Start stream" in detail and "no Confluent cost" in detail


def test_stream_unreachable_is_fail():
    level, action, _ = pf.recommend_stream(None, None)
    assert level == "FAIL" and "AVOID" in action


def test_anomaly_export_recommendation_tracks_stream_state():
    assert "rows" in pf.recommend_anomaly_export(5)
    assert "header-only" in pf.recommend_anomaly_export(0)
    assert "header-only" in pf.recommend_anomaly_export(None)
