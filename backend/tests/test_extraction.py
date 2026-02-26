from pathlib import Path
from uuid import uuid4

from app.services.pdf_processing import PDFProcessor


def test_pdf_text_extraction_fixture():
    pdf_bytes = Path("tests/fixtures/sample_text.pdf").read_bytes()
    pages = PDFProcessor().extract_pages(pdf_bytes)
    assert len(pages) == 1
    assert pages[0].source == "text"
    assert "Loan Amount" in pages[0].text


def test_pdf_ocr_path_stub(monkeypatch):
    pdf_bytes = Path("tests/fixtures/sample_text.pdf").read_bytes()

    class StubProcessor(PDFProcessor):
        def _ocr_page(self, pdf_path, page_no):
            return "OCR fallback text"


    pages = StubProcessor().extract_pages(pdf_bytes)
    # if fixture text is present, at least no crash and page exists
    assert len(pages) == 1


def test_run_extraction_validates_json(client, fake_cursor, monkeypatch):
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

    class Resp:
        def __init__(self, content=None, json_data=None):
            self.content = content or b""
            self._json = json_data or {}

        def raise_for_status(self):
            return None

        def json(self):
            return self._json

    pdf_bytes = Path("tests/fixtures/sample_text.pdf").read_bytes()
    calls = {"n": 0}

    def fake_post(url, json, timeout):
        calls["n"] += 1
        if calls["n"] == 1:
            return Resp(json_data={"answer": "not-json"})
        return Resp(json_data={"answer": '{"parties":{"borrower":"A","lender":"B","guarantor":null},"property":{"address_or_name":"123 Main"},"loan_terms":{"loan_amount":"500000","interest_terms":"SOFR+3","maturity_date":"2030-01-01","amortization_io":"30yr am"},"fees":"1%","covenants":{"dscr_ltv":"1.25 / 65%","cash_sweep_triggers":"DSCR<1.1"},"default_rate":"5%","events_of_default":["non-payment"],"governing_law":"NY","evidence":{"loan_terms.loan_amount":[{"page":1,"snippet":"Loan Amount: 500000"}]}}'})

    monkeypatch.setattr("httpx.get", lambda *_, **__: Resp(content=pdf_bytes))
    monkeypatch.setattr("httpx.post", fake_post)

    resp = client.post("/api/extract/run", json={"extracted_document_id": extracted_id})
    assert resp.status_code == 200
    assert calls["n"] == 2
