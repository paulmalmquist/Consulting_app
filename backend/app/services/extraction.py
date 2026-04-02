from __future__ import annotations

import hashlib
import json
from uuid import UUID

import httpx
from jsonschema import ValidationError, validate

from app.config import AI_GATEWAY_ENABLED, OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.db import get_cursor
from app.services.documents import _storage
from app.services.extraction_profiles import get_profile_schema
from app.services.pdf_processing import PDFProcessor

ENGINE_VERSION = "extractor_v1"


class ExtractionService:
    def __init__(self, pdf_processor: PDFProcessor | None = None):
        self.pdf_processor = pdf_processor or PDFProcessor()

    def init_extraction(self, document_id: UUID, version_id: UUID, extraction_profile: str) -> dict:
        schema = get_profile_schema(extraction_profile)
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO app.extracted_document (document_id, document_version_id, doc_type, status)
                   VALUES (%s, %s, %s, 'pending') RETURNING id, document_id, document_version_id, doc_type, status, created_at""",
                (str(document_id), str(version_id), extraction_profile),
            )
            row = cur.fetchone()
        _ = schema
        return row

    def run_extraction(self, extracted_document_id: UUID) -> dict:
        with get_cursor() as cur:
            cur.execute(
                """SELECT ed.id, ed.document_id, ed.document_version_id, ed.doc_type, dv.bucket, dv.object_key
                   FROM app.extracted_document ed
                   JOIN app.document_versions dv ON dv.version_id = ed.document_version_id
                   WHERE ed.id = %s""",
                (str(extracted_document_id),),
            )
            base = cur.fetchone()
            if not base:
                raise LookupError("Extracted document not found")

        pdf_bytes = self._download_document(base["bucket"], base["object_key"])
        pages = self.pdf_processor.extract_pages(pdf_bytes)

        run_hash = hashlib.sha256("\n".join(f"{p.page}:{p.text}" for p in pages).encode()).hexdigest()
        run_id = self._create_run(str(extracted_document_id), run_hash)
        schema = get_profile_schema(base["doc_type"])

        prompt = self._build_prompt(pages, schema)
        result = self._ask_ai(prompt)
        extracted = self._parse_and_validate(result, schema)
        if extracted is None:
            fix_prompt = (
                "Return valid JSON only that conforms to the provided schema. "
                "Do not include markdown. Here is your previous output:\n" + result
            )
            fixed = self._ask_ai(fix_prompt)
            extracted = self._parse_and_validate(fixed, schema)
            if extracted is None:
                self._finish_run(run_id, "failed", "Invalid JSON after retry")
                raise ValueError("AI response could not be validated against schema")

        self._store_fields(str(extracted_document_id), extracted)
        with get_cursor() as cur:
            cur.execute("UPDATE app.extracted_document SET status = 'completed' WHERE id = %s", (str(extracted_document_id),))
        self._finish_run(run_id, "completed", None)
        return self.get_extracted_document(extracted_document_id)

    def get_extracted_document(self, extracted_document_id: UUID) -> dict:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM app.extracted_document WHERE id = %s", (str(extracted_document_id),))
            doc = cur.fetchone()
            if not doc:
                raise LookupError("Extracted document not found")
            cur.execute(
                "SELECT * FROM app.extraction_run WHERE extracted_document_id = %s ORDER BY started_at DESC LIMIT 1",
                (str(extracted_document_id),),
            )
            run = cur.fetchone()
            cur.execute(
                "SELECT * FROM app.extracted_field WHERE extracted_document_id = %s ORDER BY created_at ASC",
                (str(extracted_document_id),),
            )
            fields = cur.fetchall()
        return {"extracted_document": doc, "latest_run": run, "fields": fields}

    def get_fields(self, extracted_document_id: UUID) -> list[dict]:
        with get_cursor() as cur:
            cur.execute(
                "SELECT * FROM app.extracted_field WHERE extracted_document_id = %s ORDER BY created_at ASC",
                (str(extracted_document_id),),
            )
            return cur.fetchall()

    def get_evidence(self, extracted_document_id: UUID, page: int | None = None) -> list[dict]:
        rows = self.get_fields(extracted_document_id)
        out: list[dict] = []
        for row in rows:
            ev = row.get("evidence_json") or {}
            ev_page = ev.get("page")
            if page is None or ev_page == page:
                out.append({"field_key": row["field_key"], "evidence": ev})
        return out

    def _build_prompt(self, pages, schema: dict) -> str:
        page_block = "\n\n".join([f"[PAGE {p.page}]\n{p.text[:4000]}" for p in pages])
        return (
            "Extract loan/real-estate/legal terms from document text. "
            "Return STRICT JSON object only (no markdown) that validates against this schema. "
            "Every field must have evidence references in evidence object keyed by field path.\n"
            f"SCHEMA:\n{json.dumps(schema)}\n"
            f"DOCUMENT PAGES:\n{page_block}"
        )

    def _ask_ai(self, prompt: str) -> str:
        if not AI_GATEWAY_ENABLED:
            raise RuntimeError("AI Gateway disabled: set OPENAI_API_KEY")

        import openai
        from app.services.gateway_audit import log_ai_call

        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        with log_ai_call(service="extraction", model=OPENAI_CHAT_MODEL_STANDARD) as audit:
            response = client.chat.completions.create(
                model=OPENAI_CHAT_MODEL_STANDARD,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You extract structured document data. "
                            "Return valid JSON only with no markdown or commentary."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_tokens=2_000,
                response_format={"type": "json_object"},
            )
            if response.usage:
                audit.record(
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                )
        return response.choices[0].message.content or "{}"

    def _parse_and_validate(self, raw: str, schema: dict) -> dict | None:
        try:
            parsed = json.loads(raw)
            validate(instance=parsed, schema=schema)
            return parsed
        except (json.JSONDecodeError, ValidationError):
            return None

    def _download_document(self, bucket: str, object_key: str) -> bytes:
        signed = _storage.generate_signed_download_url(bucket, object_key)
        resp = httpx.get(signed, timeout=60)
        resp.raise_for_status()
        return resp.content

    def _create_run(self, extracted_document_id: str, run_hash: str) -> str:
        with get_cursor() as cur:
            cur.execute(
                """INSERT INTO app.extraction_run (extracted_document_id, run_hash, engine_version, status)
                   VALUES (%s, %s, %s, 'running') RETURNING id""",
                (extracted_document_id, run_hash, ENGINE_VERSION),
            )
            row = cur.fetchone()
            return str(row["id"])

    def _finish_run(self, run_id: str, status: str, error: str | None):
        with get_cursor() as cur:
            cur.execute(
                "UPDATE app.extraction_run SET status = %s, error = %s, completed_at = now() WHERE id = %s",
                (status, error, run_id),
            )

    def _store_fields(self, extracted_document_id: str, extracted: dict):
        evidence = extracted.get("evidence", {})
        flat = {
            "parties.borrower": extracted.get("parties", {}).get("borrower"),
            "parties.lender": extracted.get("parties", {}).get("lender"),
            "parties.guarantor": extracted.get("parties", {}).get("guarantor"),
            "property.address_or_name": extracted.get("property", {}).get("address_or_name"),
            "loan_terms.loan_amount": extracted.get("loan_terms", {}).get("loan_amount"),
            "loan_terms.interest_terms": extracted.get("loan_terms", {}).get("interest_terms"),
            "loan_terms.maturity_date": extracted.get("loan_terms", {}).get("maturity_date"),
            "loan_terms.amortization_io": extracted.get("loan_terms", {}).get("amortization_io"),
            "fees": extracted.get("fees"),
            "covenants.dscr_ltv": extracted.get("covenants", {}).get("dscr_ltv"),
            "covenants.cash_sweep_triggers": extracted.get("covenants", {}).get("cash_sweep_triggers"),
            "default_rate": extracted.get("default_rate"),
            "events_of_default": extracted.get("events_of_default"),
            "governing_law": extracted.get("governing_law"),
        }
        with get_cursor() as cur:
            cur.execute("DELETE FROM app.extracted_field WHERE extracted_document_id = %s", (extracted_document_id,))
            for key, value in flat.items():
                ev_list = evidence.get(key, [])
                ev = ev_list[0] if ev_list else {"page": None, "snippet": ""}
                cur.execute(
                    """INSERT INTO app.extracted_field
                       (extracted_document_id, field_key, field_value_json, confidence, evidence_json)
                       VALUES (%s, %s, %s::jsonb, %s, %s::jsonb)""",
                    (extracted_document_id, key, json.dumps(value), 0.8, json.dumps(ev)),
                )


service = ExtractionService()
