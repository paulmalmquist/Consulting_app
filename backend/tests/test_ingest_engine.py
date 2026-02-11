"""Ingestion engine tests."""

from __future__ import annotations

from io import BytesIO

import openpyxl

from app.ingest.engine import compute_run_hash, profile_file, run_pipeline


def _vendor_recipe() -> dict:
    return {
        "target_table_key": "vendor",
        "mode": "upsert",
        "primary_key_fields": ["name"],
        "settings_json": {},
    }


def _vendor_mappings() -> list[dict]:
    return [
        {
            "source_column": "vendor_name",
            "target_column": "name",
            "required": True,
            "mapping_order": 1,
            "transform_json": {"trim": True},
        },
        {
            "source_column": "tax_id",
            "target_column": "tax_id",
            "required": False,
            "mapping_order": 2,
            "transform_json": {"trim": True},
        },
        {
            "source_column": "terms",
            "target_column": "payment_terms",
            "required": False,
            "mapping_order": 3,
            "transform_json": {"trim": True, "lowercase": True},
        },
    ]


def test_parse_csv_profile():
    raw = b"Vendor Name,Tax ID,Terms\nBlue Harbor,12-3456789,Net30\nSummit Services,98-7654321,Net45\n"

    profile = profile_file(raw, "csv", settings={})

    assert profile["file_type"] == "csv"
    assert len(profile["sheets"]) == 1

    sheet = profile["sheets"][0]
    assert sheet["sheet_name"] == "CSV"
    assert sheet["total_rows"] == 2
    assert any(col["name"] == "vendor_name" for col in sheet["columns"])


def test_parse_xlsx_profile():
    workbook = openpyxl.Workbook()
    ws = workbook.active
    ws.title = "Cashflows"
    ws.append(["Event Date", "Amount", "Event Type"])
    ws.append(["2025-01-01", "$1,250.00", "operating_cf"])
    ws.append(["2025-01-15", "(400.00)", "fee"])

    stream = BytesIO()
    workbook.save(stream)
    payload = stream.getvalue()

    profile = profile_file(payload, "xlsx", settings={})

    assert profile["file_type"] == "xlsx"
    assert len(profile["sheets"]) == 1
    sheet = profile["sheets"][0]
    assert sheet["sheet_name"] == "Cashflows"
    assert sheet["total_rows"] == 2
    assert any(col["name"] == "event_date" for col in sheet["columns"])


def test_validate_vendor_mapping():
    raw = (
        b"Vendor Name,Tax ID,Terms\n"
        b"Blue Harbor,12-3456789,Net30\n"
        b"Broken Tax,12-ABC,Net30\n"
        b"Bad Terms Vendor,98-7654321,Random45\n"
    )

    result = run_pipeline(
        raw_bytes=raw,
        file_type="csv",
        recipe=_vendor_recipe(),
        mappings=_vendor_mappings(),
        transform_steps=[],
        preview_rows=10,
    )

    assert result["rows_read"] == 3
    assert result["rows_valid"] == 1
    error_codes = {err["error_code"] for err in result["errors"]}
    assert "vendor_tax_id_invalid" in error_codes
    assert "vendor_payment_terms_invalid" in error_codes


def test_upsert_dedupe_keys():
    raw = (
        b"Vendor Name,Tax ID,Terms\n"
        b"Blue Harbor,12-3456789,Net30\n"
        b"Blue Harbor,12-3456789,Net30\n"
        b"Summit Services,98-7654321,Net45\n"
    )

    result = run_pipeline(
        raw_bytes=raw,
        file_type="csv",
        recipe=_vendor_recipe(),
        mappings=_vendor_mappings(),
        transform_steps=[],
        preview_rows=10,
    )

    assert result["rows_read"] == 3
    assert result["rows_valid"] == 2
    assert any(err["error_code"] == "duplicate_key" for err in result["errors"])


def test_run_hash_idempotent():
    recipe_payload = {
        "target_table_key": "vendor",
        "mode": "upsert",
        "primary_key_fields": ["name"],
        "settings_json": {"sheet_name": "Vendors"},
        "mappings": [
            {"source_column": "Vendor Name", "target_column": "name", "mapping_order": 1},
        ],
        "transform_steps": [],
    }

    h1 = compute_run_hash("source-version-1", recipe_payload, engine_version="ingest-v1")
    h2 = compute_run_hash("source-version-1", recipe_payload, engine_version="ingest-v1")
    h3 = compute_run_hash("source-version-2", recipe_payload, engine_version="ingest-v1")

    assert h1 == h2
    assert h1 != h3
