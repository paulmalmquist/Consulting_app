"""g09 - approved document corpus, chunks, entity links, and revision history."""

from __future__ import annotations

import datetime as dt

from .. import ids
from ..context import BuildContext
from ..dataset import Dataset
from ..lineage import SourceSystem as SS

_SCN1 = "SCN-001-VEHICLE-TR003-READINESS-BLOCKED"
_SCN8 = "SCN-008-DAILY-FACTORY-HANDOFF"
_DOC_TYPES = ["procedure", "work_instruction", "test_report", "ncr_disposition", "shift_handoff"]


def run(ctx: BuildContext, ds: Dataset) -> None:
    documents = _documents(ctx, ds)
    _chunks(ctx, ds, documents)
    _entity_links(ctx, ds, documents)
    _revision_history(ctx, ds, documents)


def _documents(ctx: BuildContext, ds: Dataset) -> list[dict]:
    rows = []
    for i in range(ctx.n("docs_documents")):
        is_anchor = i == 0
        rows.append({
            "document_id": ids.document(i + 1),
            "title": "TR-003 pressure-test disposition and morning handoff" if is_anchor
            else f"Factory controlled document {i + 1}",
            "document_type": "ncr_disposition" if is_anchor else _DOC_TYPES[i % len(_DOC_TYPES)],
            "status": "approved" if i % 10 != 0 or is_anchor else "draft",
            "owner_team": ["Quality", "Test", "Manufacturing", "Engineering"][i % 4],
            "effective_date": (ctx.start + dt.timedelta(days=i % ctx.days_span())).isoformat(),
            "revision": 1 + (i % 4),
            "source_uri": f"docs://factory/{ids.document(i + 1)}",
            "scenario_id": _SCN1 if is_anchor else (_SCN8 if i < 12 else None),
        })
    ds.add("raw_docs_documents", rows, key=["document_id"], source_system=SS.DOCS)
    return rows


def _chunks(ctx: BuildContext, ds: Dataset, documents: list[dict]) -> None:
    rows = []
    for i in range(ctx.n("docs_chunks")):
        doc = documents[i % len(documents)]
        chunk_no = i // len(documents) + 1
        if i == 0:
            text = (
                "TR-003 remains yellow pending four open NCR dispositions, pressure-test anomaly "
                "review, and final inspection signoff for two flight-critical serialized items."
            )
        elif doc["scenario_id"] == _SCN8:
            text = (
                "Morning handoff: completed operations, open blockers, quality holds, material "
                "shortages, test anomalies, and named owner follow-ups."
            )
        else:
            text = f"{doc['title']} approved guidance section {chunk_no}."
        rows.append({
            "chunk_id": ids.document_chunk(i + 1),
            "document_id": doc["document_id"],
            "chunk_index": chunk_no,
            "text": text,
            "approved_for_rag": doc["status"] == "approved",
            "citation_uri": f"{doc['source_uri']}#chunk-{chunk_no}",
            "scenario_id": doc["scenario_id"],
        })
    ds.add("raw_docs_chunks", rows, key=["chunk_id"], source_system=SS.DOCS)


def _entity_links(ctx: BuildContext, ds: Dataset, documents: list[dict]) -> None:
    entities = [
        ("vehicle", ctx.scenario["anchors"]["blocked_vehicle"]),
        ("jira_issue", ctx.scenario["anchors"]["anchor_jira"]),
        ("test_run", ctx.scenario["anchors"]["hotfire_inconclusive_run"]),
    ]
    entities.extend(("ncr", r["ncr_id"]) for r in ds.get("raw_qms_ncrs").sorted_rows())
    entities.extend(("work_order", r["wo_id"]) for r in ds.get("raw_mes_work_orders").sorted_rows())
    rows = []
    for i in range(ctx.n("docs_entity_links")):
        kind, entity_id = entities[i % len(entities)]
        doc = documents[i % len(documents)]
        rows.append({
            "entity_link_id": ids.document_entity_link(i + 1),
            "document_id": doc["document_id"],
            "entity_type": kind,
            "entity_id": entity_id,
            "scenario_id": _SCN1 if i < 3 else doc["scenario_id"],
        })
    ds.add("raw_docs_entity_links", rows, key=["entity_link_id"], source_system=SS.DOCS)


def _revision_history(ctx: BuildContext, ds: Dataset, documents: list[dict]) -> None:
    rows = []
    for i in range(ctx.n("docs_revision_history")):
        doc = documents[i % len(documents)]
        rev = i // len(documents) + 1
        rows.append({
            "document_revision_id": ids.document_revision(i + 1),
            "document_id": doc["document_id"],
            "revision": rev,
            "status": "approved" if rev < doc["revision"] else doc["status"],
            "changed_date": (ctx.start + dt.timedelta(days=(i * 3) % ctx.days_span())).isoformat(),
            "scenario_id": doc["scenario_id"],
        })
    ds.add("raw_docs_revision_history", rows, key=["document_revision_id"], source_system=SS.DOCS)


__all__ = ["run"]
