from __future__ import annotations

import csv
import hashlib
import io
import json
import math
from pathlib import Path
from time import monotonic
from typing import Any
from uuid import UUID, uuid4
import xml.etree.ElementTree as ET
import zipfile

try:
    from docx import Document as DocxDocument
except ModuleNotFoundError:
    DocxDocument = None

try:
    from pypdf import PdfReader
except ModuleNotFoundError:
    PdfReader = None

from app.db import get_cursor
from app.services import business as business_svc
from app.services import re_scenario
from app.services.winston_demo_docs import (
    GeneratedDemoDocument,
    demo_docs_dir,
    generate_demo_docs,
    load_demo_fixture,
)


QUERY_ALLOWLIST: dict[str, dict[str, Any]] = {
    "asset_metrics_qtr": {
        "table": "asset_metrics_qtr",
        "columns": {
            "env_id",
            "fund_id",
            "deal_id",
            "asset_id",
            "asset_name",
            "property_type",
            "quarter",
            "noi",
            "asset_value",
            "debt_balance",
            "dscr",
            "units",
        },
        "default_columns": ["asset_name", "property_type", "quarter", "noi", "asset_value", "debt_balance", "dscr"],
        "default_sort": [("asset_name", "asc")],
    },
    "fund_metrics_qtr": {
        "table": "fund_metrics_qtr",
        "columns": {
            "env_id",
            "fund_id",
            "fund_name",
            "quarter",
            "portfolio_nav",
            "total_committed",
            "total_called",
            "total_distributed",
            "dpi",
            "rvpi",
            "tvpi",
            "gross_irr",
            "net_irr",
        },
        "default_columns": ["fund_name", "quarter", "portfolio_nav", "total_called", "total_distributed", "tvpi", "net_irr"],
        "default_sort": [("quarter", "asc")],
    },
    "document_catalog": {
        "table": "document_catalog",
        "columns": {
            "env_id",
            "document_id",
            "title",
            "doc_type",
            "verification_status",
            "source_type",
            "document_status",
            "version_id",
            "version_number",
            "mime_type",
            "created_at",
        },
        "default_columns": ["title", "doc_type", "verification_status", "source_type", "version_number", "created_at"],
        "default_sort": [("created_at", "desc")],
    },
    "definition_registry": {
        "table": "definition_registry",
        "columns": {
            "env_id",
            "definition_id",
            "term",
            "version",
            "owner",
            "status",
            "structured_metric_key",
            "created_at",
            "approved_at",
            "dependency_count",
        },
        "default_columns": ["term", "version", "owner", "status", "structured_metric_key", "dependency_count"],
        "default_sort": [("term", "asc")],
    },
}


def _hash_embedding(text: str, size: int = 48) -> list[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    values = [(byte / 255.0) for byte in digest]
    return (values * ((size // len(values)) + 1))[:size]


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    numer = sum(a * b for a, b in zip(left, right))
    left_mag = math.sqrt(sum(a * a for a in left))
    right_mag = math.sqrt(sum(b * b for b in right))
    if left_mag == 0 or right_mag == 0:
        return 0.0
    return numer / (left_mag * right_mag)


def _load_json(value: Any, default: Any) -> Any:
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default
    return default


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _uploads_root() -> Path:
    root = demo_docs_dir() / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _table_has_column(cur, schema_name: str, table_name: str, column_name: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = %s
          AND table_name = %s
          AND column_name = %s
        """,
        (schema_name, table_name, column_name),
    )
    return bool(cur.fetchone())


def _ensure_business(cur, *, name: str, slug: str, region: str) -> dict:
    cur.execute(
        "SELECT business_id, tenant_id, slug FROM app.businesses WHERE slug = %s LIMIT 1",
        (slug,),
    )
    row = cur.fetchone()
    if row:
        return row
    created = business_svc.create_business(name=name, slug=slug, region=region)
    cur.execute(
        "SELECT business_id, tenant_id, slug FROM app.businesses WHERE business_id = %s",
        (str(created["business_id"]),),
    )
    created_row = cur.fetchone()
    if not created_row:
        raise LookupError("Failed to create demo business")
    return created_row


def _ensure_environment_row(cur, env_id: UUID, selected_env: dict | None = None) -> dict:
    fixture = load_demo_fixture()
    env_name = (selected_env or {}).get("client_name") or fixture["environment"]["client_name"]
    industry = (selected_env or {}).get("industry") or fixture["environment"]["industry"]
    industry_type = (selected_env or {}).get("industry_type") or fixture["environment"]["industry_type"]
    schema_name = (selected_env or {}).get("schema_name") or fixture["environment"]["schema_name"]
    notes = "Winston institutional knowledge and governance demo"

    business_row = _ensure_business(
        cur,
        name=env_name,
        slug=fixture["business"]["slug"],
        region=fixture["business"]["region"],
    )

    cur.execute(
        "SELECT env_id, client_name, industry FROM app.environments WHERE env_id = %s",
        (str(env_id),),
    )
    env_row = cur.fetchone()
    if not env_row:
        cur.execute(
            """
            INSERT INTO app.environments (env_id, client_name, industry, schema_name, is_active, notes)
            VALUES (%s, %s, %s, %s, true, %s)
            """,
            (str(env_id), env_name, industry, schema_name, notes),
        )
        if _table_has_column(cur, "app", "environments", "industry_type"):
            cur.execute(
                "UPDATE app.environments SET industry_type = %s WHERE env_id = %s",
                (industry_type, str(env_id)),
            )
        env_row = {"env_id": str(env_id), "client_name": env_name, "industry": industry}
    else:
        cur.execute(
            """
            UPDATE app.environments
               SET client_name = %s,
                   industry = %s,
                   schema_name = %s,
                   notes = %s,
                   updated_at = now()
             WHERE env_id = %s
            """,
            (env_name, industry, schema_name, notes, str(env_id)),
        )
        if _table_has_column(cur, "app", "environments", "industry_type"):
            cur.execute(
                "UPDATE app.environments SET industry_type = %s WHERE env_id = %s",
                (industry_type, str(env_id)),
            )

    if _table_has_column(cur, "app", "environments", "business_id"):
        cur.execute(
            "UPDATE app.environments SET business_id = %s WHERE env_id = %s",
            (str(business_row["business_id"]), str(env_id)),
        )
    if _table_has_column(cur, "app", "environments", "repe_initialized"):
        cur.execute(
            "UPDATE app.environments SET repe_initialized = true WHERE env_id = %s",
            (str(env_id),),
        )

    cur.execute(
        """
        INSERT INTO app.env_business_bindings (env_id, business_id)
        VALUES (%s, %s)
        ON CONFLICT (env_id) DO UPDATE
          SET business_id = EXCLUDED.business_id,
              updated_at = now()
        """,
        (str(env_id), str(business_row["business_id"])),
    )

    return {
        "env_id": str(env_id),
        "business_id": str(business_row["business_id"]),
        "tenant_id": str(business_row["tenant_id"]),
        "client_name": env_name,
        "industry": industry,
        "industry_type": industry_type,
        "schema_name": schema_name,
    }


def _record_audit(
    cur,
    *,
    env_id: UUID,
    actor: str,
    action_type: str,
    object_type: str,
    object_id: str | None,
    metadata: dict[str, Any],
) -> str:
    audit_id = uuid4()
    cur.execute(
        """
        INSERT INTO system_audit_log (id, env_id, actor, action_type, object_type, object_id, metadata_json)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (str(audit_id), str(env_id), actor, action_type, object_type, object_id, json.dumps(metadata)),
    )
    return str(audit_id)


def ensure_environment(env_id: UUID, selected_env: dict | None = None) -> dict:
    with get_cursor() as cur:
        payload = _ensure_environment_row(cur, env_id, selected_env)
        return payload


def _definition_lookup() -> dict[str, dict]:
    fixture = load_demo_fixture()
    return {item["term"].lower(): item for item in fixture["definitions"]}


def _extract_text_and_pages(filename: str, raw_bytes: bytes) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
    suffix = Path(filename).suffix.lower()
    pages: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []

    if suffix == ".pdf":
        if PdfReader is not None:
            try:
                reader = PdfReader(io.BytesIO(raw_bytes))
                for idx, page in enumerate(reader.pages, start=1):
                    pages.append({"page_number": idx, "text": (page.extract_text() or "").strip()})
            except Exception:
                pages.append({"page_number": 1, "text": raw_bytes.decode("utf-8", errors="ignore")})
        else:
            pages.append({"page_number": 1, "text": raw_bytes.decode("utf-8", errors="ignore")})
    elif suffix == ".docx":
        if DocxDocument is not None:
            try:
                doc = DocxDocument(io.BytesIO(raw_bytes))
                text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
                pages.append({"page_number": 1, "text": text})
            except Exception:
                pages.append({"page_number": 1, "text": _extract_docx_fallback(raw_bytes)})
        else:
            pages.append({"page_number": 1, "text": _extract_docx_fallback(raw_bytes)})
    elif suffix in {".txt", ".vtt"}:
        pages.append({"page_number": 1, "text": raw_bytes.decode("utf-8", errors="ignore")})
    elif suffix == ".csv":
        decoded = raw_bytes.decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(decoded))
        rows = list(reader)
        if rows:
            headers = rows[0]
            data_rows = rows[1:]
            tables.append({"headers": headers, "row_count": len(data_rows)})
            lines = [" | ".join(headers)] + [" | ".join(row) for row in data_rows]
            pages.append({"page_number": 1, "text": "\n".join(lines)})
        else:
            pages.append({"page_number": 1, "text": decoded})
    else:
        raise ValueError(f"Unsupported file type for Winston demo: {suffix}")

    full_text = "\n\n".join(page["text"] for page in pages).strip()
    return full_text, pages, tables


def _extract_docx_fallback(raw_bytes: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as archive:
            xml_bytes = archive.read("word/document.xml")
        root = ET.fromstring(xml_bytes)
        texts = [node.text for node in root.iter() if node.tag.endswith("}t") and node.text]
        return "\n".join(texts)
    except Exception:
        return raw_bytes.decode("utf-8", errors="ignore")


def _split_chunks(pages: list[dict[str, Any]], max_chars: int = 550) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    global_offset = 0
    for page in pages:
        text = page["text"].strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(start + max_chars, len(text))
            if end < len(text):
                split_at = text.rfind(" ", start, end)
                if split_at > start + 120:
                    end = split_at
            content = text[start:end].strip()
            if content:
                chunk_start = global_offset + start
                chunk_end = global_offset + end
                chunks.append(
                    {
                        "page_number": page["page_number"],
                        "content": content,
                        "char_start": chunk_start,
                        "char_end": chunk_end,
                    }
                )
            start = end
        global_offset += len(text) + 2
    return chunks


def _detect_analysis(text: str, tables: list[dict[str, Any]], linked_entities: list[dict[str, str]]) -> dict[str, Any]:
    lower = text.lower()
    definitions = _definition_lookup()
    detected_definitions = [meta["term"] for key, meta in definitions.items() if key in lower]
    detected_metrics = [meta["structured_metric_key"] for key, meta in definitions.items() if key in lower]
    structured_refs = linked_entities[:]
    return {
        "detected_definitions": detected_definitions,
        "detected_tables": tables,
        "detected_metrics": detected_metrics,
        "linked_structured_refs": structured_refs,
    }


def _normalize_topic_tags(doc_type: str, text: str) -> list[str]:
    topics = {doc_type.lower().replace(" ", "_")}
    for term in ("noi", "dscr", "walt", "tvpi", "irr", "valuation", "governance"):
        if term in text.lower():
            topics.add(term)
    return sorted(topics)


def _persist_document(
    cur,
    *,
    env_id: UUID,
    business_id: UUID,
    tenant_id: UUID,
    filename: str,
    title: str,
    doc_type: str,
    author: str,
    verification_status: str,
    source_type: str,
    linked_entities: list[dict[str, str]],
    raw_bytes: bytes,
    raw_text: str,
    pages: list[dict[str, Any]],
    tables: list[dict[str, Any]],
    object_key: str,
    actor: str,
) -> dict:
    doc_id = uuid4()
    version_id = uuid4()
    sha = hashlib.sha256(raw_bytes).hexdigest()
    virtual_path = f"winston-demo/env/{env_id}/{filename}"
    doc_status = "approved" if verification_status == "verified" else "draft"

    cur.execute(
        """
        INSERT INTO app.documents (
          document_id, tenant_id, domain, classification, title, description, virtual_path, status
        )
        VALUES (%s, %s, 're', %s::app.document_classification, %s, %s, %s, %s::app.document_status)
        """,
        (
            str(doc_id),
            str(tenant_id),
            _classify_doc_type(doc_type),
            title,
            f"{doc_type} for Winston demo",
            virtual_path,
            doc_status,
        ),
    )
    if _table_has_column(cur, "app", "documents", "business_id"):
        cur.execute(
            "UPDATE app.documents SET business_id = %s WHERE document_id = %s",
            (str(business_id), str(doc_id)),
        )

    cur.execute(
        """
        INSERT INTO app.document_versions (
          version_id, tenant_id, document_id, version_number, state, bucket, object_key,
          original_filename, mime_type, size_bytes, content_hash, finalized_at
        )
        VALUES (%s, %s, %s, 1, 'available'::app.document_version_state, %s, %s, %s, %s, %s, %s, now())
        """,
        (
            str(version_id),
            str(tenant_id),
            str(doc_id),
            "winston-demo",
            object_key,
            filename,
            _mime_for_filename(filename),
            len(raw_bytes),
            sha,
        ),
    )

    cur.execute(
        """
        INSERT INTO app.document_text (text_id, tenant_id, version_id, extracted_text, language)
        VALUES (%s, %s, %s, %s, 'en')
        """,
        (str(uuid4()), str(tenant_id), str(version_id), raw_text),
    )

    cur.execute(
        """
        INSERT INTO kb_document_metadata (
          document_id, env_id, doc_type, linked_entities_json, author,
          verification_status, source_type, metadata_json
        )
        VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb)
        """,
        (
            str(doc_id),
            str(env_id),
            doc_type,
            json.dumps(linked_entities),
            author,
            verification_status,
            source_type,
            json.dumps({"filename": filename}),
        ),
    )

    analysis = _detect_analysis(raw_text, tables, linked_entities)
    cur.execute(
        """
        INSERT INTO kb_document_version_analysis (
          version_id, processing_status, detected_definitions_json, detected_tables_json,
          detected_metrics_json, linked_structured_refs_json, processed_at
        )
        VALUES (%s, 'ready', %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, now())
        """,
        (
            str(version_id),
            json.dumps(analysis["detected_definitions"]),
            json.dumps(analysis["detected_tables"]),
            json.dumps(analysis["detected_metrics"]),
            json.dumps(analysis["linked_structured_refs"]),
        ),
    )

    topics = _normalize_topic_tags(doc_type, raw_text)
    for tag in topics:
        cur.execute(
            """
            INSERT INTO app.document_tags (tenant_id, document_id, tag, created_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (document_id, tag) DO NOTHING
            """,
            (str(tenant_id), str(doc_id), tag, actor),
        )
    for linked in linked_entities:
        tag_value = f"{linked['type']}:{linked['id']}"
        cur.execute(
            """
            INSERT INTO app.document_tags (tenant_id, document_id, tag, created_by)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (document_id, tag) DO NOTHING
            """,
            (str(tenant_id), str(doc_id), tag_value, actor),
        )

    chunks = _split_chunks(pages)
    for index, chunk in enumerate(chunks):
        chunk_id = uuid4()
        anchor = f"{title.lower().replace(' ', '-')}-p{chunk['page_number']}-c{index + 1}"
        citation_href = f"/lab/env/{env_id}/documents?documentId={doc_id}&chunkId={chunk_id}"
        embedding = _hash_embedding(chunk["content"])
        cur.execute(
            """
            INSERT INTO app.document_chunks (
              chunk_id, tenant_id, version_id, chunk_index, content, token_count
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                str(chunk_id),
                str(tenant_id),
                str(version_id),
                index,
                chunk["content"],
                max(1, len(chunk["content"].split())),
            ),
        )
        cur.execute(
            """
            INSERT INTO kb_document_chunk (
              chunk_id, version_id, page_number, anchor_label, citation_href,
              char_start, char_end, embedding, search_tsv, metadata_json
            )
            VALUES (
              %s, %s, %s, %s, %s, %s, %s, %s::jsonb,
              to_tsvector('english', %s), %s::jsonb
            )
            """,
            (
                str(chunk_id),
                str(version_id),
                chunk["page_number"],
                anchor,
                citation_href,
                chunk["char_start"],
                chunk["char_end"],
                json.dumps(embedding),
                chunk["content"],
                json.dumps({"doc_type": doc_type}),
            ),
        )

    audit_trace_id = _record_audit(
        cur,
        env_id=env_id,
        actor=actor,
        action_type="document_process",
        object_type="document",
        object_id=str(doc_id),
        metadata={
            "title": title,
            "doc_type": doc_type,
            "chunks": len(chunks),
            "source_type": source_type,
        },
    )

    return {
        "document_id": str(doc_id),
        "version_id": str(version_id),
        "title": title,
        "doc_type": doc_type,
        "chunk_count": len(chunks),
        "audit_trace_id": audit_trace_id,
    }


def _classify_doc_type(doc_type: str) -> str:
    lowered = doc_type.lower()
    if "policy" in lowered or "controls" in lowered:
        return "policy"
    if "extract" in lowered:
        return "output"
    if "letter" in lowered or "memo" in lowered or "transcript" in lowered:
        return "evidence"
    return "other"


def _mime_for_filename(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".vtt": "text/vtt",
    }.get(suffix, "application/octet-stream")


def _ingest_file_path(
    cur,
    *,
    env_id: UUID,
    business_id: UUID,
    tenant_id: UUID,
    generated_doc: GeneratedDemoDocument,
    actor: str,
) -> dict:
    raw_bytes = generated_doc.path.read_bytes()
    raw_text, pages, tables = _extract_text_and_pages(generated_doc.path.name, raw_bytes)
    return _persist_document(
        cur,
        env_id=env_id,
        business_id=business_id,
        tenant_id=tenant_id,
        filename=generated_doc.path.name,
        title=generated_doc.path.stem.replace("-", " ").title(),
        doc_type=generated_doc.doc_type,
        author=generated_doc.author,
        verification_status="verified",
        source_type="generated",
        linked_entities=generated_doc.linked_entities,
        raw_bytes=raw_bytes,
        raw_text=raw_text,
        pages=pages,
        tables=tables,
        object_key=str(generated_doc.path.relative_to(_repo_root())),
        actor=actor,
    )


def _insert_base_re_data(cur, *, env_id: UUID, business_id: UUID) -> dict:
    fixture = load_demo_fixture()
    fund = fixture["fund"]
    assets = fixture["assets"]
    total_called = float(fund["total_called"])
    total_distributed = float(fund["total_distributed"])
    total_committed = round(total_called / 0.82)
    deal_id = UUID(fund["deal_id"])
    run_id = str(uuid4())

    cur.execute(
        """
        INSERT INTO repe_fund (
          fund_id, business_id, name, vintage_year, fund_type, strategy, sub_strategy,
          target_size, term_years, status
        )
        VALUES (%s, %s, %s, 2026, 'closed_end', 'equity', 'core_plus', %s, 7, 'investing')
        ON CONFLICT (fund_id) DO UPDATE
          SET business_id = EXCLUDED.business_id,
              name = EXCLUDED.name,
              target_size = EXCLUDED.target_size,
              status = EXCLUDED.status
        """,
        (fund["fund_id"], str(business_id), fund["name"], total_committed),
    )
    cur.execute(
        "UPDATE repe_fund SET strategy_type = 'equity' WHERE fund_id = %s",
        (fund["fund_id"],),
    )
    cur.execute(
        """
        INSERT INTO repe_deal (
          deal_id, fund_id, name, deal_type, stage, sponsor, target_close_date,
          committed_capital, invested_capital, realized_distributions
        )
        VALUES (%s, %s, %s, 'equity', 'operating', %s, '2026-01-15', %s, %s, %s)
        ON CONFLICT (deal_id) DO UPDATE
          SET committed_capital = EXCLUDED.committed_capital,
              invested_capital = EXCLUDED.invested_capital,
              realized_distributions = EXCLUDED.realized_distributions
        """,
        (
            str(deal_id),
            fund["fund_id"],
            f"{fund['name']} Core Portfolio",
            "Meridian Capital Management",
            total_committed,
            total_called,
            total_distributed,
        ),
    )

    for asset in assets:
        debt_service = round(float(asset["noi"]) / float(asset["dscr"]), 2)
        nav = float(asset["asset_value"]) - float(asset["debt_balance"])
        cur.execute(
            """
            INSERT INTO repe_asset (
              asset_id, deal_id, asset_type, name, acquisition_date, cost_basis, asset_status
            )
            VALUES (%s, %s, 'property', %s, '2025-01-15', %s, 'active')
            ON CONFLICT (asset_id) DO UPDATE
              SET name = EXCLUDED.name,
                  cost_basis = EXCLUDED.cost_basis,
                  asset_status = EXCLUDED.asset_status
            """,
            (
                asset["asset_id"],
                str(deal_id),
                asset["name"],
                asset["asset_value"],
            ),
        )
        cur.execute(
            """
            INSERT INTO repe_property_asset (
              asset_id, property_type, units, market, current_noi, occupancy
            )
            VALUES (%s, %s, %s, %s, %s, 0.95)
            ON CONFLICT (asset_id) DO UPDATE
              SET property_type = EXCLUDED.property_type,
                  units = EXCLUDED.units,
                  market = EXCLUDED.market,
                  current_noi = EXCLUDED.current_noi,
                  occupancy = EXCLUDED.occupancy
            """,
            (
                asset["asset_id"],
                asset["property_type"],
                asset["units"],
                asset["market"],
                asset["noi"],
            ),
        )
        cur.execute(
            """
            INSERT INTO re_asset_quarter_state (
              asset_id, quarter, scenario_id, run_id, noi, revenue, opex, capex,
              debt_service, occupancy, debt_balance, cash_balance, asset_value, nav,
              valuation_method, inputs_hash
            )
            VALUES (
              %s, %s, NULL, %s, %s, %s, %s, 0, %s, 0.95, %s, 250000, %s, %s,
              'cap_rate', 'winston_demo_seed'
            )
            ON CONFLICT (asset_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
            DO UPDATE SET
              run_id = EXCLUDED.run_id,
              noi = EXCLUDED.noi,
              revenue = EXCLUDED.revenue,
              opex = EXCLUDED.opex,
              debt_service = EXCLUDED.debt_service,
              debt_balance = EXCLUDED.debt_balance,
              asset_value = EXCLUDED.asset_value,
              nav = EXCLUDED.nav
            """,
            (
                asset["asset_id"],
                fund["quarter"],
                run_id,
                asset["noi"],
                round(float(asset["noi"]) * 1.68, 2),
                round(float(asset["noi"]) * 0.68, 2),
                debt_service,
                asset["debt_balance"],
                asset["asset_value"],
                nav,
            ),
        )

    weighted_dscr = round(sum(float(asset["dscr"]) for asset in assets) / len(assets), 4)
    weighted_ltv = round(sum(float(asset["debt_balance"]) for asset in assets) / sum(float(asset["asset_value"]) for asset in assets), 4)

    cur.execute(
        """
        INSERT INTO re_fund_quarter_state (
          id, fund_id, quarter, scenario_id, run_id, portfolio_nav, total_committed,
          total_called, total_distributed, dpi, rvpi, tvpi, gross_irr, net_irr,
          weighted_ltv, weighted_dscr, inputs_hash
        )
        VALUES (
          %s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'winston_demo_seed'
        )
        ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          portfolio_nav = EXCLUDED.portfolio_nav,
          total_committed = EXCLUDED.total_committed,
          total_called = EXCLUDED.total_called,
          total_distributed = EXCLUDED.total_distributed,
          dpi = EXCLUDED.dpi,
          rvpi = EXCLUDED.rvpi,
          tvpi = EXCLUDED.tvpi,
          gross_irr = EXCLUDED.gross_irr,
          net_irr = EXCLUDED.net_irr,
          weighted_ltv = EXCLUDED.weighted_ltv,
          weighted_dscr = EXCLUDED.weighted_dscr
        """,
        (
            str(uuid4()),
            fund["fund_id"],
            fund["quarter"],
            run_id,
            fund["portfolio_nav"],
            total_committed,
            fund["total_called"],
            fund["total_distributed"],
            fund["dpi"],
            fund["rvpi"],
            fund["tvpi"],
            fund["gross_irr"],
            fund["net_irr"],
            weighted_ltv,
            weighted_dscr,
        ),
    )

    cur.execute(
        """
        INSERT INTO re_fund_quarter_metrics (
          id, fund_id, quarter, scenario_id, run_id, contributed_to_date,
          distributed_to_date, nav, dpi, tvpi, irr
        )
        VALUES (%s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          contributed_to_date = EXCLUDED.contributed_to_date,
          distributed_to_date = EXCLUDED.distributed_to_date,
          nav = EXCLUDED.nav,
          dpi = EXCLUDED.dpi,
          tvpi = EXCLUDED.tvpi,
          irr = EXCLUDED.irr
        """,
        (
            str(uuid4()),
            fund["fund_id"],
            fund["quarter"],
            run_id,
            fund["total_called"],
            fund["total_distributed"],
            fund["portfolio_nav"],
            fund["dpi"],
            fund["tvpi"],
            fund["net_irr"],
        ),
    )

    cur.execute(
        """
        INSERT INTO re_assumption_set (assumption_set_id, fund_id, name, version, notes, created_by)
        VALUES (%s, %s, 'Winston Demo Baseline', 1, 'Institutional demo baseline', 'winston_demo')
        ON CONFLICT (assumption_set_id) DO UPDATE SET notes = EXCLUDED.notes
        """,
        (fund["assumption_set_id"], fund["fund_id"]),
    )
    for key, decimal_value in [
        ("exit_cap_rate", 0.055),
        ("rent_growth_annual", 0.03),
        ("expense_growth_annual", 0.025),
        ("vacancy_rate", 0.05),
    ]:
        cur.execute(
            """
            INSERT INTO re_assumption_value (assumption_set_id, scope_type, key, value_type, value_decimal)
            VALUES (%s, 'fund', %s, 'decimal', %s)
            ON CONFLICT (assumption_set_id, scope_type, key)
            DO UPDATE SET value_decimal = EXCLUDED.value_decimal
            """,
            (fund["assumption_set_id"], key, decimal_value),
        )

    cur.execute(
        """
        INSERT INTO re_waterfall_definition (definition_id, fund_id, name, waterfall_type, version, is_active)
        VALUES (%s, %s, 'Default', 'european', 1, true)
        ON CONFLICT (definition_id) DO UPDATE SET is_active = true
        """,
        (fund["waterfall_definition_id"], fund["fund_id"]),
    )

    cur.execute(
        """
        INSERT INTO re_scenario (
          scenario_id, fund_id, name, description, scenario_type, is_base, base_assumption_set_id, status
        )
        VALUES (%s, %s, 'Base Case', 'Seeded Winston demo baseline', 'base', true, %s, 'active')
        ON CONFLICT (scenario_id) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              base_assumption_set_id = EXCLUDED.base_assumption_set_id,
              status = EXCLUDED.status
        """,
        (fund["base_scenario_id"], fund["fund_id"], fund["assumption_set_id"]),
    )
    cur.execute(
        """
        INSERT INTO re_scenario (
          scenario_id, fund_id, name, description, scenario_type, is_base, parent_scenario_id, base_assumption_set_id, status
        )
        VALUES (%s, %s, 'Downside Cap Rate +75bps', 'Seeded downside test', 'downside', false, %s, %s, 'active')
        ON CONFLICT (scenario_id) DO UPDATE
          SET description = EXCLUDED.description,
              parent_scenario_id = EXCLUDED.parent_scenario_id,
              base_assumption_set_id = EXCLUDED.base_assumption_set_id,
              status = EXCLUDED.status
        """,
        (
            fund["downside_scenario_id"],
            fund["fund_id"],
            fund["base_scenario_id"],
            fund["assumption_set_id"],
        ),
    )
    re_scenario.set_override(
        scenario_id=UUID(fund["downside_scenario_id"]),
        payload={
            "scope_node_type": "fund",
            "scope_node_id": UUID(fund["fund_id"]),
            "key": "exit_cap_rate_delta_bps",
            "value_type": "int",
            "value_int": int(load_demo_fixture()["downside"]["cap_rate_bps"]),
            "reason": "Seeded downside case",
        },
    )

    _upsert_scenario_snapshot(
        cur,
        env_id=env_id,
        fund_id=UUID(fund["fund_id"]),
        scenario_id=UUID(fund["downside_scenario_id"]),
        lever_patch={"exit_cap_rate_delta_bps": load_demo_fixture()["downside"]["cap_rate_bps"]},
        actor="winston_demo_seed",
        fixed_run_id=str(uuid4()),
    )
    return {
        "fund_id": fund["fund_id"],
        "quarter": fund["quarter"],
    }


def _clear_existing_generated_docs(cur, env_id: UUID) -> None:
    cur.execute(
        """
        DELETE FROM app.documents d
        USING kb_document_metadata md
        WHERE md.document_id = d.document_id
          AND md.env_id = %s
          AND md.source_type = 'generated'
        """,
        (str(env_id),),
    )


def _seed_documents(cur, *, env_id: UUID, business_id: UUID, tenant_id: UUID) -> list[dict]:
    _clear_existing_generated_docs(cur, env_id)
    generated = generate_demo_docs()
    inserted: list[dict] = []
    for generated_doc in generated:
        inserted.append(
            _ingest_file_path(
                cur,
                env_id=env_id,
                business_id=business_id,
                tenant_id=tenant_id,
                generated_doc=generated_doc,
                actor="winston_demo_seed",
            )
        )
    return inserted


def _seed_definitions(cur, *, env_id: UUID) -> list[dict]:
    fixture = load_demo_fixture()
    records: list[dict] = []
    doc_lookup: dict[str, str] = {}
    cur.execute(
        """
        SELECT d.document_id, md.doc_type
        FROM app.documents d
        JOIN kb_document_metadata md ON md.document_id = d.document_id
        WHERE md.env_id = %s
        """,
        (str(env_id),),
    )
    for row in cur.fetchall():
        doc_lookup.setdefault(row["doc_type"], str(row["document_id"]))

    source_doc_id = doc_lookup.get("Metric Definitions") or doc_lookup.get("Data Dictionary")
    for index, definition in enumerate(fixture["definitions"], start=1):
        cur.execute(
            """
            INSERT INTO kb_definition (
              id, env_id, term, definition_text, formula_text, structured_metric_key,
              owner, status, version, created_at, approved_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'approved', 1, now(), now())
            ON CONFLICT (env_id, term, version) DO UPDATE
              SET definition_text = EXCLUDED.definition_text,
                  formula_text = EXCLUDED.formula_text,
                  structured_metric_key = EXCLUDED.structured_metric_key,
                  owner = EXCLUDED.owner,
                  status = EXCLUDED.status,
                  approved_at = EXCLUDED.approved_at
            """,
            (
                definition["definition_id"],
                str(env_id),
                definition["term"],
                definition["definition_text"],
                definition["formula_text"],
                definition["structured_metric_key"],
                definition["owner"],
            ),
        )
        if source_doc_id:
            cur.execute(
                """
                SELECT c.chunk_id, c.content
                FROM app.document_chunks c
                JOIN app.document_versions dv ON dv.version_id = c.version_id
                WHERE dv.document_id = %s AND lower(c.content) LIKE %s
                ORDER BY c.chunk_index ASC
                LIMIT 1
                """,
                (source_doc_id, f"%{definition['term'].lower()}%"),
            )
            chunk_row = cur.fetchone()
            if chunk_row:
                cur.execute(
                    """
                    INSERT INTO kb_definition_sources (definition_id, document_id, chunk_id, quoted_snippet)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (definition_id, chunk_id) DO NOTHING
                    """,
                    (
                        definition["definition_id"],
                        source_doc_id,
                        str(chunk_row["chunk_id"]),
                        str(chunk_row["content"])[:240],
                    ),
                )
        for dep in _default_dependencies(definition["structured_metric_key"]):
            cur.execute(
                """
                INSERT INTO kb_definition_dependency (definition_id, dependent_object_type, dependent_object_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (definition_id, dependent_object_type, dependent_object_id) DO NOTHING
                """,
                (definition["definition_id"], dep["type"], dep["id"]),
            )
        records.append(
            {
                "definition_id": definition["definition_id"],
                "term": definition["term"],
                "version": 1,
                "order": index,
            }
        )
    return records


def _default_dependencies(metric_key: str) -> list[dict[str, str]]:
    metric_key = (metric_key or "").lower()
    base = [
        {"type": "query", "id": "document_catalog"},
        {"type": "query", "id": "definition_registry"},
    ]
    specific = {
        "noi": [
            {"type": "metric", "id": "asset_metrics_qtr.noi"},
            {"type": "report", "id": "lp_quarterly_report_template"},
            {"type": "scenario", "id": "downside_cap_rate_75bps"},
            {"type": "valuation", "id": "asset_valuation_model"},
            {"type": "metric", "id": "fund_metrics_qtr.tvpi"},
            {"type": "metric", "id": "fund_metrics_qtr.net_irr"},
        ],
        "dscr": [
            {"type": "metric", "id": "asset_metrics_qtr.dscr"},
            {"type": "report", "id": "debt_covenant_dashboard"},
        ],
        "walt": [
            {"type": "report", "id": "leasing_rollup_report"},
        ],
        "tvpi": [
            {"type": "metric", "id": "fund_metrics_qtr.tvpi"},
            {"type": "report", "id": "lp_quarterly_report_template"},
        ],
        "irr": [
            {"type": "metric", "id": "fund_metrics_qtr.net_irr"},
            {"type": "report", "id": "ic_performance_pack"},
        ],
        "revpor": [
            {"type": "report", "id": "hospitality_kpi_pack"},
        ],
    }
    return base + specific.get(metric_key, [])


def seed_meridian_demo(env_id: UUID) -> dict:
    with get_cursor() as cur:
        env = _ensure_environment_row(cur, env_id)
        _insert_base_re_data(cur, env_id=env_id, business_id=UUID(env["business_id"]))
        docs = _seed_documents(cur, env_id=env_id, business_id=UUID(env["business_id"]), tenant_id=UUID(env["tenant_id"]))
        definitions = _seed_definitions(cur, env_id=env_id)
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor="winston_demo_seed",
            action_type="seed_demo",
            object_type="environment",
            object_id=str(env_id),
            metadata={
                "documents": len(docs),
                "definitions": len(definitions),
                "fund_id": load_demo_fixture()["fund"]["fund_id"],
            },
        )
        return {
            "env_id": str(env_id),
            "business_id": env["business_id"],
            "documents_seeded": len(docs),
            "definitions_seeded": len(definitions),
            "audit_trace_id": audit_trace_id,
        }


def _document_base_query() -> str:
    return """
        SELECT
          d.document_id,
          d.title,
          d.virtual_path,
          d.status::text AS document_status,
          md.doc_type,
          md.author,
          md.verification_status,
          md.source_type,
          md.linked_entities_json,
          md.metadata_json,
          dv.version_id,
          dv.version_number,
          dv.mime_type,
          dv.size_bytes,
          dv.created_at AS version_created_at,
          dva.processing_status,
          dva.detected_definitions_json,
          dva.detected_tables_json,
          dva.detected_metrics_json,
          dva.linked_structured_refs_json
        FROM app.documents d
        JOIN kb_document_metadata md ON md.document_id = d.document_id
        JOIN LATERAL (
          SELECT version_id, version_number, mime_type, size_bytes, created_at
          FROM app.document_versions
          WHERE document_id = d.document_id
          ORDER BY version_number DESC
          LIMIT 1
        ) dv ON TRUE
        LEFT JOIN kb_document_version_analysis dva ON dva.version_id = dv.version_id
        WHERE md.env_id = %s
    """


def list_documents(env_id: UUID, *, doc_type: str | None = None, asset_id: str | None = None, verification_status: str | None = None) -> list[dict]:
    params: list[Any] = [str(env_id)]
    sql = _document_base_query()
    if doc_type:
        sql += " AND md.doc_type = %s"
        params.append(doc_type)
    if verification_status:
        sql += " AND md.verification_status = %s"
        params.append(verification_status)
    if asset_id:
        sql += " AND md.linked_entities_json::text ILIKE %s"
        params.append(f"%{asset_id}%")
    sql += " ORDER BY dv.created_at DESC, d.title ASC"
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [_serialize_document_row(row) for row in rows]


def _serialize_document_row(row: dict) -> dict:
    return {
        "document_id": str(row["document_id"]),
        "title": row["title"],
        "virtual_path": row.get("virtual_path"),
        "status": row["document_status"],
        "doc_type": row["doc_type"],
        "author": row.get("author"),
        "verification_status": row["verification_status"],
        "source_type": row["source_type"],
        "linked_entities": _load_json(row.get("linked_entities_json"), []),
        "metadata": _load_json(row.get("metadata_json"), {}),
        "latest_version": {
            "version_id": str(row["version_id"]),
            "version_number": row["version_number"],
            "mime_type": row.get("mime_type"),
            "size_bytes": row.get("size_bytes"),
            "created_at": row.get("version_created_at"),
        },
        "analysis": {
            "processing_status": row.get("processing_status"),
            "detected_definitions": _load_json(row.get("detected_definitions_json"), []),
            "detected_tables": _load_json(row.get("detected_tables_json"), []),
            "detected_metrics": _load_json(row.get("detected_metrics_json"), []),
            "linked_structured_refs": _load_json(row.get("linked_structured_refs_json"), []),
        },
    }


def get_document_detail(env_id: UUID, document_id: UUID) -> dict:
    with get_cursor() as cur:
        sql = _document_base_query() + " AND d.document_id = %s LIMIT 1"
        cur.execute(sql, (str(env_id), str(document_id)))
        row = cur.fetchone()
        if not row:
            raise LookupError("Document not found")
    return _serialize_document_row(row)


def get_document_chunks(env_id: UUID, document_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              c.chunk_id,
              c.chunk_index,
              c.content,
              kc.page_number,
              kc.anchor_label,
              kc.citation_href,
              kc.char_start,
              kc.char_end
            FROM app.document_chunks c
            JOIN kb_document_chunk kc ON kc.chunk_id = c.chunk_id
            JOIN app.document_versions dv ON dv.version_id = c.version_id
            JOIN kb_document_metadata md ON md.document_id = dv.document_id
            WHERE md.env_id = %s
              AND dv.document_id = %s
            ORDER BY c.chunk_index ASC
            """,
            (str(env_id), str(document_id)),
        )
        rows = cur.fetchall()
    return [
        {
            "chunk_id": str(row["chunk_id"]),
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "page_number": row["page_number"],
            "anchor_label": row["anchor_label"],
            "citation_href": row["citation_href"],
            "char_start": row["char_start"],
            "char_end": row["char_end"],
        }
        for row in rows
    ]


def upload_document(
    env_id: UUID,
    *,
    filename: str,
    raw_bytes: bytes,
    doc_type: str,
    author: str,
    verification_status: str,
    source_type: str,
    linked_entities: list[dict[str, str]],
) -> dict:
    with get_cursor() as cur:
        env = _ensure_environment_row(cur, env_id)
        upload_dir = _uploads_root() / str(env_id)
        upload_dir.mkdir(parents=True, exist_ok=True)
        target_path = upload_dir / filename
        target_path.write_bytes(raw_bytes)
        raw_text, pages, tables = _extract_text_and_pages(filename, raw_bytes)
        document = _persist_document(
            cur,
            env_id=env_id,
            business_id=UUID(env["business_id"]),
            tenant_id=UUID(env["tenant_id"]),
            filename=filename,
            title=Path(filename).stem.replace("-", " ").title(),
            doc_type=doc_type,
            author=author,
            verification_status=verification_status,
            source_type=source_type,
            linked_entities=linked_entities,
            raw_bytes=raw_bytes,
            raw_text=raw_text,
            pages=pages,
            tables=tables,
            object_key=str(target_path.relative_to(_repo_root())),
            actor="winston_demo_user",
        )
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor="winston_demo_user",
            action_type="doc_upload",
            object_type="document",
            object_id=document["document_id"],
            metadata={"filename": filename, "doc_type": doc_type},
        )
        document["audit_trace_id"] = audit_trace_id
        return document


def search_documents(
    env_id: UUID,
    query: str,
    *,
    doc_type: str | None = None,
    asset_id: str | None = None,
    verified_only: bool = False,
    limit: int = 8,
) -> list[dict]:
    limit = max(1, min(limit, 20))
    params: list[Any] = [str(env_id), query]
    sql = """
        SELECT
          d.document_id,
          d.title,
          md.doc_type,
          md.verification_status,
          kc.version_id,
          kc.chunk_id,
          c.content,
          kc.anchor_label,
          kc.citation_href,
          ts_rank_cd(kc.search_tsv, plainto_tsquery('english', %s)) AS lexical_rank,
          kc.embedding,
          md.linked_entities_json
        FROM kb_document_chunk kc
        JOIN app.document_chunks c ON c.chunk_id = kc.chunk_id
        JOIN app.document_versions dv ON dv.version_id = kc.version_id
        JOIN app.documents d ON d.document_id = dv.document_id
        JOIN kb_document_metadata md ON md.document_id = d.document_id
        WHERE md.env_id = %s
    """
    params = [query, str(env_id)]
    if doc_type:
        sql += " AND md.doc_type = %s"
        params.append(doc_type)
    if verified_only:
        sql += " AND md.verification_status = 'verified'"
    if asset_id:
        sql += " AND md.linked_entities_json::text ILIKE %s"
        params.append(f"%{asset_id}%")
    sql += """
        ORDER BY
          (kc.search_tsv @@ plainto_tsquery('english', %s)) DESC,
          ts_rank_cd(kc.search_tsv, plainto_tsquery('english', %s)) DESC,
          c.chunk_index ASC
        LIMIT 40
    """
    params.extend([query, query])
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    query_embedding = _hash_embedding(query)
    scored: list[dict] = []
    for row in rows:
        chunk_embedding = _load_json(row.get("embedding"), [])
        semantic = _cosine_similarity(query_embedding, chunk_embedding)
        lexical = float(row.get("lexical_rank") or 0.0)
        verified_bonus = 0.15 if row.get("verification_status") == "verified" else 0.0
        asset_bonus = 0.1 if asset_id and asset_id in json.dumps(_load_json(row.get("linked_entities_json"), [])) else 0.0
        score = (lexical * 0.7) + (semantic * 0.3) + verified_bonus + asset_bonus
        scored.append(
            {
                "document_id": str(row["document_id"]),
                "title": row["title"],
                "doc_type": row["doc_type"],
                "verification_status": row["verification_status"],
                "version_id": str(row["version_id"]),
                "chunk_id": str(row["chunk_id"]),
                "snippet": str(row["content"])[:320],
                "anchor_label": row["anchor_label"],
                "anchor_href": row["citation_href"],
                "score": round(score, 6),
            }
        )
    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


def _current_definitions(cur, env_id: UUID) -> list[dict]:
    cur.execute(
        """
        SELECT DISTINCT ON (kd.term)
          kd.id,
          kd.env_id,
          kd.term,
          kd.definition_text,
          kd.formula_text,
          kd.structured_metric_key,
          kd.owner,
          kd.status,
          kd.version,
          kd.created_at,
          kd.approved_at,
          COALESCE(dep.dep_count, 0) AS dependency_count,
          COALESCE(stale.active_count, 0) AS stale_count
        FROM kb_definition kd
        LEFT JOIN (
          SELECT definition_id, COUNT(*)::int AS dep_count
          FROM kb_definition_dependency
          GROUP BY definition_id
        ) dep ON dep.definition_id = kd.id
        LEFT JOIN (
          SELECT definition_id, COUNT(*)::int AS active_count
          FROM kb_dependency_staleness
          WHERE is_active = true
          GROUP BY definition_id
        ) stale ON stale.definition_id = kd.id
        WHERE kd.env_id = %s
        ORDER BY kd.term, kd.version DESC
        """,
        (str(env_id),),
    )
    return cur.fetchall()


def list_definitions(env_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        rows = _current_definitions(cur, env_id)
    return [
        {
            "definition_id": str(row["id"]),
            "term": row["term"],
            "definition_text": row["definition_text"],
            "formula_text": row["formula_text"],
            "structured_metric_key": row["structured_metric_key"],
            "owner": row["owner"],
            "status": row["status"],
            "version": row["version"],
            "created_at": row["created_at"],
            "approved_at": row["approved_at"],
            "dependency_count": row["dependency_count"],
            "stale_count": row["stale_count"],
        }
        for row in rows
    ]


def get_definition_detail(env_id: UUID, definition_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM kb_definition WHERE env_id = %s AND id = %s", (str(env_id), str(definition_id)))
        row = cur.fetchone()
        if not row:
            raise LookupError("Definition not found")
        cur.execute(
            """
            SELECT s.document_id, s.chunk_id, s.quoted_snippet, d.title
            FROM kb_definition_sources s
            JOIN app.documents d ON d.document_id = s.document_id
            WHERE s.definition_id = %s
            ORDER BY d.created_at ASC
            """,
            (str(definition_id),),
        )
        sources = cur.fetchall()
        cur.execute(
            """
            SELECT dependent_object_type, dependent_object_id
            FROM kb_definition_dependency
            WHERE definition_id = %s
            ORDER BY dependent_object_type, dependent_object_id
            """,
            (str(definition_id),),
        )
        dependencies = cur.fetchall()
        cur.execute(
            """
            SELECT id, proposed_definition_text, proposed_formula_text, created_by, created_at, status, impact_summary_json, approved_by, approved_at
            FROM kb_definition_change_request
            WHERE definition_id = %s
            ORDER BY created_at DESC
            """,
            (str(definition_id),),
        )
        change_requests = cur.fetchall()
        cur.execute(
            """
            SELECT object_type, object_id, reason, created_at
            FROM kb_dependency_staleness
            WHERE definition_id = %s AND is_active = true
            ORDER BY created_at DESC
            """,
            (str(definition_id),),
        )
        stale_rows = cur.fetchall()

    return {
        "definition_id": str(row["id"]),
        "term": row["term"],
        "definition_text": row["definition_text"],
        "formula_text": row.get("formula_text"),
        "structured_metric_key": row.get("structured_metric_key"),
        "owner": row["owner"],
        "status": row["status"],
        "version": row["version"],
        "created_at": row["created_at"],
        "approved_at": row.get("approved_at"),
        "sources": [
            {
                "document_id": str(source["document_id"]),
                "chunk_id": str(source["chunk_id"]),
                "title": source["title"],
                "quoted_snippet": source["quoted_snippet"],
                "anchor_href": f"/lab/env/{env_id}/documents?documentId={source['document_id']}&chunkId={source['chunk_id']}",
            }
            for source in sources
        ],
        "dependencies": [
            {"type": dep["dependent_object_type"], "id": dep["dependent_object_id"]}
            for dep in dependencies
        ],
        "change_requests": [
            {
                "id": str(item["id"]),
                "proposed_definition_text": item["proposed_definition_text"],
                "proposed_formula_text": item["proposed_formula_text"],
                "created_by": item["created_by"],
                "created_at": item["created_at"],
                "status": item["status"],
                "impact_summary": _load_json(item["impact_summary_json"], {}),
                "approved_by": item["approved_by"],
                "approved_at": item["approved_at"],
            }
            for item in change_requests
        ],
        "stale_dependencies": [
            {
                "object_type": stale["object_type"],
                "object_id": stale["object_id"],
                "reason": stale["reason"],
                "created_at": stale["created_at"],
            }
            for stale in stale_rows
        ],
    }


def _impact_summary(metric_key: str, definition_id: str) -> dict[str, Any]:
    impacts = _default_dependencies(metric_key)
    labels = []
    for impact in impacts:
        if impact["id"] == "asset_valuation_model":
            labels.append("Asset valuation model")
        elif impact["id"] == "fund_metrics_qtr.net_irr":
            labels.append("Fund IRR calculation")
        elif impact["id"] == "lp_quarterly_report_template":
            labels.append("LP quarterly report template")
        elif impact["id"] == "downside_cap_rate_75bps":
            labels.append("2 active scenarios")
        else:
            labels.append(impact["id"].replace("_", " "))
    return {
        "definition_id": definition_id,
        "metric_key": metric_key,
        "impacts": impacts,
        "summary_lines": labels,
        "message": "This change impacts: " + ", ".join(labels[:4]),
    }


def create_change_request(env_id: UUID, definition_id: UUID, *, proposed_definition_text: str, proposed_formula_text: str | None, created_by: str) -> dict:
    with get_cursor() as cur:
        cur.execute("SELECT * FROM kb_definition WHERE env_id = %s AND id = %s", (str(env_id), str(definition_id)))
        definition = cur.fetchone()
        if not definition:
            raise LookupError("Definition not found")
        summary = _impact_summary(definition["structured_metric_key"], str(definition_id))
        request_id = uuid4()
        cur.execute(
            """
            INSERT INTO kb_definition_change_request (
              id, definition_id, proposed_definition_text, proposed_formula_text, created_by, impact_summary_json
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                str(request_id),
                str(definition_id),
                proposed_definition_text,
                proposed_formula_text,
                created_by,
                json.dumps(summary),
            ),
        )
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor=created_by,
            action_type="definition_change_request",
            object_type="definition_change_request",
            object_id=str(request_id),
            metadata=summary,
        )
    return {
        "change_request_id": str(request_id),
        "status": "pending",
        "impact_summary": summary,
        "audit_trace_id": audit_trace_id,
    }


def approve_change_request(change_request_id: UUID, *, approved_by: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT cr.*, kd.env_id, kd.term, kd.owner, kd.structured_metric_key, kd.version AS current_version
            FROM kb_definition_change_request cr
            JOIN kb_definition kd ON kd.id = cr.definition_id
            WHERE cr.id = %s
            """,
            (str(change_request_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Change request not found")
        if row["status"] == "approved":
            env_id = UUID(str(row["env_id"]))
            cur.execute("SELECT * FROM kb_definition WHERE id = %s", (str(row["definition_id"]),))
            current = cur.fetchone()
            return {
                "definition_id": str(current["id"]),
                "version": current["version"],
                "status": current["status"],
                "audit_trace_id": None,
            }

        env_id = UUID(str(row["env_id"]))
        current_definition_id = UUID(str(row["definition_id"]))
        next_definition_id = uuid4()
        next_version = int(row["current_version"]) + 1
        cur.execute(
            "UPDATE kb_definition SET status = 'retired' WHERE id = %s",
            (str(current_definition_id),),
        )
        cur.execute(
            """
            INSERT INTO kb_definition (
              id, env_id, term, definition_text, formula_text, structured_metric_key,
              owner, status, version, created_at, approved_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'approved', %s, now(), now())
            """,
            (
                str(next_definition_id),
                str(env_id),
                row["term"],
                row["proposed_definition_text"],
                row["proposed_formula_text"],
                row["structured_metric_key"],
                row["owner"],
                next_version,
            ),
        )
        cur.execute(
            """
            INSERT INTO kb_definition_sources (definition_id, document_id, chunk_id, quoted_snippet)
            SELECT %s, document_id, chunk_id, quoted_snippet
            FROM kb_definition_sources
            WHERE definition_id = %s
            ON CONFLICT (definition_id, chunk_id) DO NOTHING
            """,
            (str(next_definition_id), str(current_definition_id)),
        )
        cur.execute(
            """
            INSERT INTO kb_definition_dependency (definition_id, dependent_object_type, dependent_object_id)
            SELECT %s, dependent_object_type, dependent_object_id
            FROM kb_definition_dependency
            WHERE definition_id = %s
            ON CONFLICT (definition_id, dependent_object_type, dependent_object_id) DO NOTHING
            """,
            (str(next_definition_id), str(current_definition_id)),
        )
        cur.execute(
            """
            UPDATE kb_definition_change_request
               SET status = 'approved',
                   approved_by = %s,
                   approved_at = now()
             WHERE id = %s
            """,
            (approved_by, str(change_request_id)),
        )
        cur.execute(
            "DELETE FROM kb_dependency_staleness WHERE env_id = %s AND is_active = true",
            (str(env_id),),
        )
        for dep in _default_dependencies(row["structured_metric_key"]):
            cur.execute(
                """
                INSERT INTO kb_dependency_staleness (env_id, definition_id, object_type, object_id, reason, is_active)
                VALUES (%s, %s, %s, %s, %s, true)
                """,
                (
                    str(env_id),
                    str(next_definition_id),
                    dep["type"],
                    dep["id"],
                    "Definition Updated - Recompute Recommended",
                ),
            )
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor=approved_by,
            action_type="definition_change",
            object_type="definition",
            object_id=str(next_definition_id),
            metadata={
                "term": row["term"],
                "previous_definition_id": str(current_definition_id),
                "change_request_id": str(change_request_id),
                "new_version": next_version,
            },
        )
    return {
        "definition_id": str(next_definition_id),
        "term": row["term"],
        "version": next_version,
        "status": "approved",
        "audit_trace_id": audit_trace_id,
    }


def reject_change_request(change_request_id: UUID, *, rejected_by: str) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT cr.id, cr.definition_id, kd.env_id
            FROM kb_definition_change_request cr
            JOIN kb_definition kd ON kd.id = cr.definition_id
            WHERE cr.id = %s
            """,
            (str(change_request_id),),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Change request not found")
        cur.execute(
            "UPDATE kb_definition_change_request SET status = 'rejected' WHERE id = %s",
            (str(change_request_id),),
        )
        audit_trace_id = _record_audit(
            cur,
            env_id=UUID(str(row["env_id"])),
            actor=rejected_by,
            action_type="definition_change_request",
            object_type="definition_change_request",
            object_id=str(change_request_id),
            metadata={"status": "rejected"},
        )
    return {
        "change_request_id": str(change_request_id),
        "status": "rejected",
        "audit_trace_id": audit_trace_id,
    }


def ask(env_id: UUID, *, question: str, doc_type: str | None = None, asset_id: str | None = None, verified_only: bool = False, limit: int = 5) -> dict:
    with get_cursor() as cur:
        search_results = search_documents(env_id, question, doc_type=doc_type, asset_id=asset_id, verified_only=verified_only, limit=limit)
        answer = _build_answer(cur, env_id, question, search_results)
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor="winston_demo_user",
            action_type="assistant_ask",
            object_type="assistant_request",
            object_id=None,
            metadata={"question": question, "sources": search_results[:3]},
        )
    return {
        "answer": answer,
        "citations": search_results,
        "sources": [{"title": item["title"], "doc_type": item["doc_type"]} for item in search_results],
        "audit_trace_id": audit_trace_id,
    }


def _build_answer(cur, env_id: UUID, question: str, search_results: list[dict]) -> str:
    q = question.lower()
    if "what is noi" in q:
        cur.execute(
            """
            SELECT definition_text, formula_text
            FROM kb_definition
            WHERE env_id = %s AND lower(term) = 'noi'
            ORDER BY version DESC
            LIMIT 1
            """,
            (str(env_id),),
        )
        row = cur.fetchone()
        if row:
            return f"NOI is defined as {row['definition_text']} Formula: {row['formula_text']}."
    if "noi" in q and "q1 2026" in q:
        fixture = load_demo_fixture()
        lines = [
            f"{asset['name']}: ${asset['noi']:,.0f}"
            for asset in fixture["assets"]
        ]
        return "Q1 2026 NOI by asset: " + "; ".join(lines) + "."
    if search_results:
        return f"Based on the indexed corpus, {search_results[0]['title']} is the closest source. {search_results[0]['snippet']}"
    return "No matching governed document was found for that question."


def _normalized_filters(filters: Any) -> list[tuple[str, str, Any]]:
    if not filters:
        return []
    out: list[tuple[str, str, Any]] = []
    if isinstance(filters, dict):
        for key, value in filters.items():
            if isinstance(value, dict):
                op = str(value.get("op") or value.get("operator") or "eq").lower()
                out.append((key, op, value.get("value")))
            else:
                out.append((key, "eq", value))
    elif isinstance(filters, list):
        for item in filters:
            if isinstance(item, dict):
                out.append(
                    (
                        str(item.get("column")),
                        str(item.get("op") or item.get("operator") or "eq").lower(),
                        item.get("value"),
                    )
                )
    return out


def _normalized_sort(sort: Any, default_sort: list[tuple[str, str]]) -> list[tuple[str, str]]:
    if not sort:
        return default_sort
    if isinstance(sort, dict):
        return [(str(sort.get("column")), str(sort.get("direction") or "asc").lower())]
    if isinstance(sort, list):
        rows = []
        for item in sort:
            if isinstance(item, dict):
                rows.append((str(item.get("column")), str(item.get("direction") or "asc").lower()))
        return rows or default_sort
    return default_sort


def run_structured_query(
    *,
    env_id: UUID,
    view_key: str,
    select: list[str] | None,
    filters: Any,
    sort: Any,
    limit: int,
    actor: str = "winston_demo_user",
) -> dict:
    config = QUERY_ALLOWLIST.get(view_key)
    if not config:
        raise ValueError(f"Unknown view_key: {view_key}")
    if limit > 200:
        raise ValueError("limit cannot exceed 200")
    requested_columns = select or config["default_columns"]
    invalid = [column for column in requested_columns if column not in config["columns"]]
    if invalid:
        raise ValueError(f"Unknown columns requested: {', '.join(invalid)}")

    where_clauses = ["env_id = %s"]
    params: list[Any] = [str(env_id)]
    for column, operator, value in _normalized_filters(filters):
        if column not in config["columns"]:
            raise ValueError(f"Unknown filter column: {column}")
        if operator not in {"eq", "in", "gte", "lte"}:
            raise ValueError(f"Unsupported filter operator: {operator}")
        if operator == "eq":
            where_clauses.append(f"{column} = %s")
            params.append(value)
        elif operator == "in":
            if not isinstance(value, list):
                raise ValueError(f"Filter {column} with operator 'in' requires a list")
            where_clauses.append(f"{column} = ANY(%s)")
            params.append(value)
        elif operator == "gte":
            where_clauses.append(f"{column} >= %s")
            params.append(value)
        elif operator == "lte":
            where_clauses.append(f"{column} <= %s")
            params.append(value)

    order_parts: list[str] = []
    for column, direction in _normalized_sort(sort, config["default_sort"]):
        if column not in config["columns"]:
            raise ValueError(f"Unknown sort column: {column}")
        order_parts.append(f"{column} {'DESC' if direction == 'desc' else 'ASC'}")

    sql = (
        f"SELECT {', '.join(requested_columns)} FROM {config['table']} "
        f"WHERE {' AND '.join(where_clauses)} "
        f"ORDER BY {', '.join(order_parts)} LIMIT %s"
    )
    params.append(max(1, limit))
    started = monotonic()
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
        elapsed_ms = int((monotonic() - started) * 1000)
        audit_trace_id = _record_audit(
            cur,
            env_id=env_id,
            actor=actor,
            action_type="query",
            object_type="view",
            object_id=view_key,
            metadata={
                "view_key": view_key,
                "select": requested_columns,
                "filters": _normalized_filters(filters),
                "execution_time_ms": elapsed_ms,
                "row_count": len(rows),
            },
        )
    return {
        "columns": requested_columns,
        "rows": [{column: row.get(column) for column in requested_columns} for row in rows],
        "metadata": {
            "view_key": view_key,
            "execution_time_ms": elapsed_ms,
            "row_count": len(rows),
            "audit_trace_id": audit_trace_id,
        },
    }


def _base_fund_snapshot(cur, fund_id: UUID, quarter: str) -> dict:
    cur.execute(
        """
        SELECT *
        FROM re_fund_quarter_state
        WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
        LIMIT 1
        """,
        (str(fund_id), quarter),
    )
    row = cur.fetchone()
    if not row:
        raise LookupError("Base fund quarter state not found")
    return row


def _upsert_scenario_snapshot(
    cur,
    *,
    env_id: UUID,
    fund_id: UUID,
    scenario_id: UUID,
    lever_patch: dict[str, Any],
    actor: str,
    fixed_run_id: str | None = None,
) -> dict:
    fixture = load_demo_fixture()
    quarter = fixture["fund"]["quarter"]
    base_state = _base_fund_snapshot(cur, fund_id, quarter)
    run_id = fixed_run_id or str(uuid4())

    cap_rate_delta_bps = float(lever_patch.get("exit_cap_rate_delta_bps") or lever_patch.get("cap_rate_bps") or 0)
    if cap_rate_delta_bps == float(fixture["downside"]["cap_rate_bps"]):
        nav_delta = float(fixture["downside"]["portfolio_nav_delta"])
        tvpi_delta = float(fixture["downside"]["tvpi_delta"])
        net_irr_delta = float(fixture["downside"]["net_irr_delta"])
    else:
        nav_delta = round(-194666.67 * cap_rate_delta_bps, 2)
        tvpi_delta = round(-(cap_rate_delta_bps / 75.0) * 0.09, 4)
        net_irr_delta = round(-(cap_rate_delta_bps / 75.0) * 0.009, 4)

    portfolio_nav = float(base_state["portfolio_nav"]) + nav_delta
    tvpi = float(base_state["tvpi"]) + tvpi_delta
    net_irr = float(base_state["net_irr"]) + net_irr_delta
    gross_irr = float(base_state["gross_irr"]) + (net_irr_delta * 1.2)
    rvpi = round(tvpi - float(base_state["dpi"]), 4)

    cur.execute(
        """
        INSERT INTO re_fund_quarter_state (
          id, fund_id, quarter, scenario_id, run_id, portfolio_nav, total_committed, total_called,
          total_distributed, dpi, rvpi, tvpi, gross_irr, net_irr, weighted_ltv, weighted_dscr, inputs_hash
        )
        VALUES (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'winston_demo_scenario'
        )
        ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          portfolio_nav = EXCLUDED.portfolio_nav,
          rvpi = EXCLUDED.rvpi,
          tvpi = EXCLUDED.tvpi,
          gross_irr = EXCLUDED.gross_irr,
          net_irr = EXCLUDED.net_irr
        """,
        (
            str(uuid4()),
            str(fund_id),
            quarter,
            str(scenario_id),
            run_id,
            portfolio_nav,
            base_state["total_committed"],
            base_state["total_called"],
            base_state["total_distributed"],
            base_state["dpi"],
            rvpi,
            tvpi,
            gross_irr,
            net_irr,
            base_state["weighted_ltv"],
            base_state["weighted_dscr"],
        ),
    )
    cur.execute(
        """
        INSERT INTO re_fund_quarter_metrics (
          id, fund_id, quarter, scenario_id, run_id, contributed_to_date, distributed_to_date, nav, dpi, tvpi, irr
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (fund_id, quarter, COALESCE(scenario_id, '00000000-0000-0000-0000-000000000000'::uuid))
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          nav = EXCLUDED.nav,
          tvpi = EXCLUDED.tvpi,
          irr = EXCLUDED.irr
        """,
        (
            str(uuid4()),
            str(fund_id),
            quarter,
            str(scenario_id),
            run_id,
            base_state["total_called"],
            base_state["total_distributed"],
            portfolio_nav,
            base_state["dpi"],
            tvpi,
            net_irr,
        ),
    )

    audit_trace_id = _record_audit(
        cur,
        env_id=env_id,
        actor=actor,
        action_type="scenario_update",
        object_type="scenario",
        object_id=str(scenario_id),
        metadata={
            "run_id": run_id,
            "quarter": quarter,
            "lever_patch": lever_patch,
            "portfolio_nav_delta": nav_delta,
            "tvpi_delta": tvpi_delta,
            "net_irr_delta": net_irr_delta,
        },
    )
    return {
        "run_id": run_id,
        "portfolio_nav": portfolio_nav,
        "tvpi": tvpi,
        "net_irr": net_irr,
        "gross_irr": gross_irr,
        "delta": {
            "portfolio_nav": nav_delta,
            "tvpi": tvpi_delta,
            "net_irr": net_irr_delta,
        },
        "audit_trace_id": audit_trace_id,
    }


def apply_scenario(
    env_id: UUID,
    *,
    fund_id: UUID,
    base_scenario_id: UUID,
    change_type: str,
    lever_patch: dict[str, Any],
    quarter: str | None = None,
) -> dict:
    quarter = quarter or load_demo_fixture()["fund"]["quarter"]
    with get_cursor() as cur:
        env = _ensure_environment_row(cur, env_id)
        cur.execute("SELECT scenario_id FROM re_scenario WHERE fund_id = %s AND name = %s", (str(fund_id), "Downside Cap Rate +75bps"))
        row = cur.fetchone()
        if row:
            scenario_id = UUID(str(row["scenario_id"]))
        else:
            created = re_scenario.create_scenario(
                fund_id=fund_id,
                payload={
                    "name": "Downside Cap Rate +75bps",
                    "description": "Generated from Winston scenario assistant",
                    "scenario_type": "downside",
                    "parent_scenario_id": str(base_scenario_id),
                },
            )
            scenario_id = UUID(str(created["scenario_id"]))
        for key, value in lever_patch.items():
            if isinstance(value, int):
                payload = {
                    "scope_node_type": "fund",
                    "scope_node_id": fund_id,
                    "key": key,
                    "value_type": "int",
                    "value_int": value,
                    "reason": change_type,
                }
            else:
                payload = {
                    "scope_node_type": "fund",
                    "scope_node_id": fund_id,
                    "key": key,
                    "value_type": "decimal",
                    "value_decimal": value,
                    "reason": change_type,
                }
            re_scenario.set_override(scenario_id=scenario_id, payload=payload)

        snapshot = _upsert_scenario_snapshot(
            cur,
            env_id=env_id,
            fund_id=fund_id,
            scenario_id=scenario_id,
            lever_patch=lever_patch,
            actor="winston_demo_user",
        )
        base_state = _base_fund_snapshot(cur, fund_id, quarter)
        return {
            "scenario_id": str(scenario_id),
            "run_id": snapshot["run_id"],
            "base_metrics": {
                "portfolio_nav": base_state["portfolio_nav"],
                "tvpi": base_state["tvpi"],
                "net_irr": base_state["net_irr"],
                "gross_irr": base_state["gross_irr"],
            },
            "scenario_metrics": {
                "portfolio_nav": snapshot["portfolio_nav"],
                "tvpi": snapshot["tvpi"],
                "net_irr": snapshot["net_irr"],
                "gross_irr": snapshot["gross_irr"],
            },
            "delta": {
                "asset_value": snapshot["delta"]["portfolio_nav"],
                "fund_nav": snapshot["delta"]["portfolio_nav"],
                "tvpi": snapshot["delta"]["tvpi"],
                "irr": snapshot["delta"]["net_irr"],
            },
            "audit_trace_id": snapshot["audit_trace_id"],
        }


def list_audit(env_id: UUID, limit: int = 100) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, actor, action_type, object_type, object_id, metadata_json, timestamp
            FROM system_audit_log
            WHERE env_id = %s
            ORDER BY timestamp DESC
            LIMIT %s
            """,
            (str(env_id), max(1, min(limit, 200))),
        )
        rows = cur.fetchall()
    return [
        {
            "id": str(row["id"]),
            "actor": row["actor"],
            "action_type": row["action_type"],
            "object_type": row["object_type"],
            "object_id": row["object_id"],
            "metadata": _load_json(row.get("metadata_json"), {}),
            "timestamp": row["timestamp"],
        }
        for row in rows
    ]
