"""Duplicate upload detection — second upload returns existing intake row."""
from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.services import receipt_intake


def test_second_upload_returns_duplicate(fake_cursor):
    existing_id = uuid4()
    # Existing hash found → return duplicate.
    fake_cursor.push_result([{"id": existing_id, "ingest_status": "parsed"}])

    with patch.object(receipt_intake, "_upload_to_storage", return_value=None):
        result = receipt_intake.ingest_file(
            env_id="env-1",
            business_id=str(uuid4()),
            file_bytes=b"same-bytes",
            filename="apple_one.pdf",
            mime_type="application/pdf",
        )

    assert result["duplicate"] is True
    assert result["intake_id"] == str(existing_id)
    assert result["ingest_status"] == "parsed"


def test_new_upload_creates_row(fake_cursor):
    # First fetchone: no existing hash.
    fake_cursor.push_result([])
    # After INSERT: new intake id.
    new_id = uuid4()
    fake_cursor.push_result([{"id": new_id}])
    # Subsequent calls used by parse_intake — return empty so parse short-circuits.
    # We stub extraction to avoid pytesseract.
    with patch.object(receipt_intake, "_upload_to_storage", return_value=None), \
         patch.object(receipt_intake, "parse_intake", return_value="parse-1"):
        result = receipt_intake.ingest_file(
            env_id="env-1",
            business_id=str(uuid4()),
            file_bytes=b"new-bytes",
            filename="new.pdf",
            mime_type="application/pdf",
        )

    assert result["duplicate"] is False
    assert result["intake_id"] == str(new_id)
    assert result["parse_result_id"] == "parse-1"
