from pathlib import Path
from uuid import uuid4

import pytest

from app.services.pdf_processing import PDFProcessor

_FIXTURES = Path(__file__).resolve().parent / "fixtures"
_SAMPLE_PDF = _FIXTURES / "sample_text.pdf"


def test_pdf_text_extraction_fixture():
    if not _SAMPLE_PDF.exists():
        pytest.skip(f"Missing fixture: {_SAMPLE_PDF}")
    pdf_bytes = _SAMPLE_PDF.read_bytes()
    pages = PDFProcessor().extract_pages(pdf_bytes)
    assert len(pages) == 1
    assert pages[0].source == "text"
    assert "Loan Amount" in pages[0].text


def test_pdf_ocr_path_stub(monkeypatch):
    if not _SAMPLE_PDF.exists():
        pytest.skip(f"Missing fixture: {_SAMPLE_PDF}")
    pdf_bytes = _SAMPLE_PDF.read_bytes()

    class StubProcessor(PDFProcessor):
        def _ocr_page(self, pdf_path, page_no):
            return "OCR fallback text"


    pages = StubProcessor().extract_pages(pdf_bytes)
    # if fixture text is present, at least no crash and page exists
    assert len(pages) == 1


def test_run_extraction_validates_json(client, fake_cursor, monkeypatch):
    # Patch _ask_ai directly — the OpenAI SDK uses its own httpx client
    # internally, so patching bare httpx.post does not intercept it.
    monkeypatch.setattr("app.services.extraction.AI_GATEWAY_ENABLED", True)

    extracted_id = str(uuid4())
    doc_id = str(uuid4())
    ver_id = str(uuid4())

    fake_cursor.push_result([{"id": extracted_id, "document_id": doc_id, "document_version_id": ver_id, "doc_type": "loan_real_estate_v1", "bucket": "documents", "object_key": "k"}])
    fake_cursor.push_result([{"id": str(uuid4())}])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    fake_cursor.push_result([])
    fake_cursor.push_result([{"id": extracted_id, "document_id": doc_id, "document_version_id": ver_id, "doc_type": "loan_real_estate_v1", "status": "completed", "created_at": "2024-01-01T00:00:00"}])
    fake_cursor.push_result([{"id": str(uuid4()), "extracted_document_id": extracted_id, "run_hash": "h", "engine_version": "v", "status": "completed", "error": None, "started_at": "2024-01-01T00:00:00", "completed_at": "2024-01-01T00:00:01"}])
    fake_cursor.push_result([])

    monkeypatch.setattr("app.services.extraction._storage.generate_signed_download_url", lambda *_: "https://example.com/doc.pdf")

    monkeypatch.setattr("app.services.extraction.service._store_fields", lambda *_, **__: None)
    monkeypatch.setattr("app.services.extraction.service.get_extracted_document", lambda _id: {"extracted_document": {"id": extracted_id, "document_id": doc_id, "document_version_id": ver_id, "doc_type": "loan_real_estate_v1", "status": "completed", "created_at": "2024-01-01T00:00:00"}, "latest_run": None, "fields": []})

    pdf_bytes = _SAMPLE_PDF.read_bytes() if _SAMPLE_PDF.exists() else b"%PDF-1.0 stub"
    monkeypatch.setattr("httpx.get", lambda *_, **__: type("R", (), {"content": pdf_bytes, "raise_for_status": lambda self: None})())

    # Simulate two _ask_ai calls: first returns invalid JSON, second returns valid
    calls = {"n": 0}
    valid_json = '{"parties":{"borrower":"A","lender":"B","guarantor":null},"property":{"address_or_name":"123 Main"},"loan_terms":{"loan_amount":"500000","interest_terms":"SOFR+3","maturity_date":"2030-01-01","amortization_io":"30yr am"},"fees":"1%","covenants":{"dscr_ltv":"1.25 / 65%","cash_sweep_triggers":"DSCR<1.1"},"default_rate":"5%","events_of_default":["non-payment"],"governing_law":"NY","evidence":{"loan_terms.loan_amount":[{"page":1,"snippet":"Loan Amount: 500000"}]}}'

    def fake_ask_ai(self, prompt):
        calls["n"] += 1
        if calls["n"] == 1:
            return "not-json"
        return valid_json

    monkeypatch.setattr("app.services.extraction.ExtractionService._ask_ai", fake_ask_ai)

    resp = client.post("/api/extract/run", json={"extracted_document_id": extracted_id})
    assert resp.status_code == 200
    assert calls["n"] == 2
