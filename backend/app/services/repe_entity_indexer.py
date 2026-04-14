"""One-time / on-write REPE entity indexer.

Writes fund / investment / asset descriptive text into `rag_chunks` so the
semantic lane of `repe_hybrid_search.hybrid_search` can find entities by
thesis / strategy / sector / market narrative rather than just by name.

Each row becomes a chunk with:
  - entity_type ∈ {fund, investment, asset}
  - entity_id   = the canonical UUID
  - chunk_text  = compact narrative we assemble from metadata
  - metadata_json = structured hints the boost layer uses

Idempotent: re-indexing the same entity overwrites its chunks for that version.
Safe to run without an OpenAI key — rag_indexer falls back to zero-vectors
which still power exact / FTS lanes.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID, uuid4

from app.db import get_cursor

logger = logging.getLogger(__name__)


def _fund_narrative(row: dict[str, Any]) -> str:
    parts = [f"Fund: {row.get('name') or ''}"]
    if row.get("strategy"):
        parts.append(f"Strategy: {row['strategy']}")
    if row.get("fund_type"):
        parts.append(f"Type: {row['fund_type']}")
    if row.get("vintage_year"):
        parts.append(f"Vintage: {row['vintage_year']}")
    if row.get("target_size"):
        parts.append(f"Target size: ${row['target_size']}")
    if row.get("sub_strategy"):
        parts.append(f"Sub-strategy: {row['sub_strategy']}")
    return ". ".join(parts)


def _investment_narrative(row: dict[str, Any]) -> str:
    parts = [f"Investment: {row.get('name') or ''}"]
    if row.get("deal_type"):
        parts.append(f"Deal type: {row['deal_type']}")
    if row.get("stage"):
        parts.append(f"Stage: {row['stage']}")
    if row.get("sponsor"):
        parts.append(f"Sponsor: {row['sponsor']}")
    if row.get("fund_name"):
        parts.append(f"Parent fund: {row['fund_name']}")
    return ". ".join(parts)


def _asset_narrative(row: dict[str, Any]) -> str:
    parts = [f"Asset: {row.get('name') or ''}"]
    if row.get("asset_type"):
        parts.append(f"Type: {row['asset_type']}")
    if row.get("property_type"):
        parts.append(f"Property type: {row['property_type']}")
    if row.get("market"):
        parts.append(f"Market: {row['market']}")
    if row.get("units"):
        parts.append(f"Units: {row['units']}")
    if row.get("cost_basis"):
        parts.append(f"Cost basis: ${row['cost_basis']}")
    if row.get("fund_name"):
        parts.append(f"Parent fund: {row['fund_name']}")
    if row.get("deal_name"):
        parts.append(f"Parent investment: {row['deal_name']}")
    return ". ".join(parts)


def _write_chunk(
    cur,
    *,
    entity_type: str,
    entity_id: str,
    business_id: str,
    env_id: str | None,
    text: str,
    metadata: dict[str, Any],
) -> None:
    """Write a single self-describing chunk into rag_chunks.

    Skips the full OpenAI embedding path — we store the chunk with a
    zero-vector placeholder so it's reachable via FTS + metadata boost. A
    downstream nightly job can re-embed if needed."""
    # Idempotent: delete prior rows for this entity.
    cur.execute(
        """
        DELETE FROM rag_chunks
        WHERE business_id = %s
          AND entity_type = %s
          AND entity_id = %s
        """,
        (business_id, entity_type, entity_id),
    )
    cur.execute(
        """
        INSERT INTO rag_chunks (
          chunk_id, business_id, env_id, entity_type, entity_id,
          document_id, version_id, chunk_text, section_path, metadata_json
        ) VALUES (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        )
        """,
        (
            str(uuid4()),
            business_id,
            env_id,
            entity_type,
            entity_id,
            None,
            None,
            text,
            "entity_narrative",
            _json_dumps(metadata),
        ),
    )


def _json_dumps(v: Any) -> str:
    import json
    return json.dumps(v, default=str)


def reindex_business(business_id: UUID | str) -> dict[str, int]:
    """Reindex every fund / investment / asset under `business_id`.

    Returns counts. Safe to call during migrations or on-demand.
    """
    b_id = str(business_id)
    counts = {"funds": 0, "investments": 0, "assets": 0}
    with get_cursor() as cur:
        # Funds
        cur.execute(
            """
            SELECT fund_id::text AS id, name, strategy, fund_type, vintage_year,
                   target_size, sub_strategy
            FROM repe_fund
            WHERE business_id = %s
            """,
            (b_id,),
        )
        funds = cur.fetchall() or []
        fund_by_id: dict[str, str] = {}
        for f in funds:
            fund_by_id[f["id"]] = f["name"]
            _write_chunk(
                cur,
                entity_type="fund",
                entity_id=f["id"],
                business_id=b_id,
                env_id=None,
                text=_fund_narrative(f),
                metadata={
                    "strategy": f.get("strategy"),
                    "fund_type": f.get("fund_type"),
                    "vintage_year": f.get("vintage_year"),
                },
            )
            counts["funds"] += 1

        # Investments
        cur.execute(
            """
            SELECT d.deal_id::text AS id, d.name, d.deal_type, d.stage, d.sponsor,
                   d.fund_id::text AS fund_id
            FROM repe_deal d
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s
            """,
            (b_id,),
        )
        for d in cur.fetchall() or []:
            d_with_fund = {**d, "fund_name": fund_by_id.get(d["fund_id"])}
            _write_chunk(
                cur,
                entity_type="investment",
                entity_id=d["id"],
                business_id=b_id,
                env_id=None,
                text=_investment_narrative(d_with_fund),
                metadata={
                    "deal_type": d.get("deal_type"),
                    "stage": d.get("stage"),
                    "fund_id": d.get("fund_id"),
                },
            )
            counts["investments"] += 1

        # Assets
        cur.execute(
            """
            SELECT a.asset_id::text AS id, a.name, a.asset_type, a.cost_basis,
                   pa.property_type, pa.market, pa.units,
                   d.deal_id::text AS deal_id, d.name AS deal_name,
                   f.fund_id::text AS fund_id, f.name AS fund_name
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            WHERE f.business_id = %s
            """,
            (b_id,),
        )
        for a in cur.fetchall() or []:
            _write_chunk(
                cur,
                entity_type="asset",
                entity_id=a["id"],
                business_id=b_id,
                env_id=None,
                text=_asset_narrative(a),
                metadata={
                    "property_type": a.get("property_type"),
                    "market": a.get("market"),
                    "fund_id": a.get("fund_id"),
                    "investment_id": a.get("deal_id"),
                },
            )
            counts["assets"] += 1

    logger.info("reindex_business %s: %s", b_id, counts)
    return counts
