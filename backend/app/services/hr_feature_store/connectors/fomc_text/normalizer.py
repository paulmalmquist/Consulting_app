"""Pure FOMC text normalizer: doc dicts → shared silver readings.

Text rides in `provenance` (B1's jsonb carrier): silver.value is NULL for text
(quality_flag='text'); the body, title, url, date, and a sha256 live in
provenance. NO summarization, NO classification, NO embedding, NO LLM. Missing
body → null_reason='fomc_missing_text'; missing date → 'fomc_missing_date';
non-dict doc / non-list input → FomcTextShapeError.
"""

from __future__ import annotations

import hashlib
from typing import Any

from .client import FomcTextShapeError
from .series_registry import CONNECTOR, FOMC_TEXT_SERIES


def normalize_documents(
    series_key: str,
    docs: Any,
    *,
    source_quality: str = "live",
) -> list[dict[str, Any]]:
    meta = FOMC_TEXT_SERIES.get(series_key)
    if meta is None:
        raise ValueError(f"unknown fomc text series: {series_key}")
    if not meta.get("source_available", False):
        raise ValueError(f"{series_key} has no source; report unavailable, do not normalize")
    if not isinstance(docs, list):
        raise FomcTextShapeError("fomc documents must be a list of doc dicts")

    canonical = meta["canonical_name"]
    rows: list[dict[str, Any]] = []
    for doc in docs:
        if not isinstance(doc, dict):
            raise FomcTextShapeError("each fomc document must be a dict")
        date = doc.get("date")
        body = doc.get("body")
        ts_source = f"{date}T00:00:00+00:00" if date else None

        null_reason: str | None = None
        quality_flag = "text"
        if not date:
            null_reason, quality_flag = "fomc_missing_date", "missing"
        elif not body or not str(body).strip():
            null_reason, quality_flag = "fomc_missing_text", "missing"

        provenance: dict[str, Any] = {
            "text_type": doc.get("text_type") or meta["text_type"],
            "title": doc.get("title"),
            "url": doc.get("url"),
            "date": date,
            "source": meta["source"],
            "canonical_name": canonical,
            "unit": "text",
            # text payload (B1 has no body column; jsonb is the carrier)
            "text": body if body else None,
            "char_count": len(body) if body else 0,
            "text_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest() if body else None,
            # explicit: embedding is a separate, deferred step — not done here
            "embedding_status": "embedding_materializer_not_configured",
        }
        rows.append({
            "connector": CONNECTOR,
            "series_key": canonical,
            "ts_source": ts_source,
            "value": None,  # text series: numeric value is intentionally NULL (never 0)
            "quality_flag": quality_flag,
            "null_reason": null_reason,
            "source_quality": source_quality,
            "provenance": provenance,
        })
    return rows
