"""Hybrid REPE search — exact + metadata + semantic lanes with ranked merge.

Rules (per the product brief):
  - Exact / prefix matches on fund, investment, asset names outrank semantic
    guesses. Structured truth beats fuzzy similarity.
  - Every result resolves to a real route (no hallucinated entities).
  - Every result carries an entity-type badge.
  - Debug mode returns the winning lane per result and the raw scores.

The semantic lane reuses the existing `rag_chunks` infrastructure
(`app.services.rag_indexer.semantic_search`) — we don't rebuild embeddings.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.db import get_cursor

logger = logging.getLogger(__name__)


# Lane priorities: lower number = stronger lane when ranking ties arise.
LANE_EXACT = "exact"
LANE_PREFIX = "prefix"
LANE_METADATA = "metadata"
LANE_SEMANTIC = "semantic"
LANE_PRIORITY = {LANE_EXACT: 0, LANE_PREFIX: 1, LANE_METADATA: 2, LANE_SEMANTIC: 3}


@dataclass
class SearchHit:
    entity_type: str  # "fund" | "investment" | "asset"
    entity_id: str
    name: str
    route: str  # e.g. /lab/env/<env_id>/re/funds/<fund_id>
    lane: str
    score: float
    snippet: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


def _route_for(entity_type: str, entity_id: str, env_id: str) -> str:
    if entity_type == "fund":
        return f"/lab/env/{env_id}/re/funds/{entity_id}"
    if entity_type == "investment":
        return f"/lab/env/{env_id}/re/investments/{entity_id}"
    if entity_type == "asset":
        return f"/lab/env/{env_id}/re/assets/{entity_id}"
    return f"/lab/env/{env_id}/re"


# ---------------------------------------------------------------------------
# Exact / prefix lane
# ---------------------------------------------------------------------------


def _exact_and_prefix_lane(
    cur, *, business_id: str, env_id: str, query: str, limit: int
) -> list[SearchHit]:
    """Exact-match and prefix-match over fund / investment / asset names.

    Exact = case-insensitive full match (score 1.0, lane=exact).
    Prefix = case-insensitive starts-with (score 0.8, lane=prefix).
    """
    q = query.strip()
    if not q:
        return []
    like = q.replace("%", "%%").replace("_", "\\_")
    # Funds
    hits: list[SearchHit] = []
    cur.execute(
        """
        SELECT fund_id::text AS id, name
        FROM repe_fund
        WHERE business_id = %s
          AND (lower(name) = lower(%s) OR lower(name) LIKE lower(%s) || '%%')
        ORDER BY (lower(name) = lower(%s)) DESC, name
        LIMIT %s
        """,
        (business_id, q, like, q, limit),
    )
    for r in cur.fetchall() or []:
        is_exact = r["name"].strip().lower() == q.lower()
        hits.append(
            SearchHit(
                entity_type="fund",
                entity_id=r["id"],
                name=r["name"],
                route=_route_for("fund", r["id"], env_id),
                lane=LANE_EXACT if is_exact else LANE_PREFIX,
                score=1.0 if is_exact else 0.8,
            )
        )

    # Investments (repe_deal)
    cur.execute(
        """
        SELECT d.deal_id::text AS id, d.name, d.fund_id::text AS fund_id
        FROM repe_deal d
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE f.business_id = %s
          AND (lower(d.name) = lower(%s) OR lower(d.name) LIKE lower(%s) || '%%')
        ORDER BY (lower(d.name) = lower(%s)) DESC, d.name
        LIMIT %s
        """,
        (business_id, q, like, q, limit),
    )
    for r in cur.fetchall() or []:
        is_exact = r["name"].strip().lower() == q.lower()
        hits.append(
            SearchHit(
                entity_type="investment",
                entity_id=r["id"],
                name=r["name"],
                route=_route_for("investment", r["id"], env_id),
                lane=LANE_EXACT if is_exact else LANE_PREFIX,
                score=1.0 if is_exact else 0.8,
                meta={"fund_id": r["fund_id"]},
            )
        )

    # Assets
    cur.execute(
        """
        SELECT a.asset_id::text AS id, a.name, d.fund_id::text AS fund_id,
               d.deal_id::text AS investment_id
        FROM repe_asset a
        JOIN repe_deal d ON d.deal_id = a.deal_id
        JOIN repe_fund f ON f.fund_id = d.fund_id
        WHERE f.business_id = %s
          AND (lower(a.name) = lower(%s) OR lower(a.name) LIKE lower(%s) || '%%')
        ORDER BY (lower(a.name) = lower(%s)) DESC, a.name
        LIMIT %s
        """,
        (business_id, q, like, q, limit),
    )
    for r in cur.fetchall() or []:
        is_exact = r["name"].strip().lower() == q.lower()
        hits.append(
            SearchHit(
                entity_type="asset",
                entity_id=r["id"],
                name=r["name"],
                route=_route_for("asset", r["id"], env_id),
                lane=LANE_EXACT if is_exact else LANE_PREFIX,
                score=1.0 if is_exact else 0.8,
                meta={"fund_id": r["fund_id"], "investment_id": r["investment_id"]},
            )
        )

    return hits


# ---------------------------------------------------------------------------
# Metadata lane — structured filters parsed from the query
# ---------------------------------------------------------------------------


# Simple keyword → column mapping. Intentionally small and predictable; more
# sophisticated NLQ parsing can layer on top later.
SECTOR_KEYWORDS = {
    "multifamily": "multifamily",
    "apartments": "multifamily",
    "office": "office",
    "industrial": "industrial",
    "logistics": "industrial",
    "retail": "retail",
    "hospitality": "hospitality",
    "hotel": "hospitality",
}

# City / market heuristic — any token in the query that's 3+ chars gets tried
# against market columns. Cheap filter; safe because results still get ranked.
MARKET_TOKENS = {
    "dallas", "atlanta", "charlotte", "houston", "austin", "phoenix", "denver",
    "seattle", "nyc", "boston", "chicago", "miami", "tampa", "orlando",
    "san antonio", "san diego", "los angeles", "new york",
}


def _metadata_lane(
    cur, *, business_id: str, env_id: str, query: str, limit: int
) -> list[SearchHit]:
    q = query.lower()
    hits: list[SearchHit] = []

    # Detect sector keyword.
    sector: str | None = None
    for k, v in SECTOR_KEYWORDS.items():
        if k in q:
            sector = v
            break

    # Detect market token.
    market_match: str | None = None
    for m in MARKET_TOKENS:
        if m in q:
            market_match = m
            break

    # Metric hints: "highest DPI", "highest IRR", "negative NAV".
    sort_field: str | None = None
    if "dpi" in q:
        sort_field = "dpi"
    elif "tvpi" in q:
        sort_field = "tvpi"
    elif "irr" in q:
        sort_field = "gross_irr"
    elif "nav" in q and ("negative" in q or "loss" in q):
        sort_field = "portfolio_nav_asc"

    # Assets by sector / market.
    if sector or market_match:
        conditions: list[str] = ["f.business_id = %s"]
        params: list[Any] = [business_id]
        if sector:
            conditions.append("lower(pa.property_type) = %s")
            params.append(sector)
        if market_match:
            conditions.append("lower(pa.market) LIKE %s")
            params.append(f"%{market_match}%")
        cur.execute(
            f"""
            SELECT a.asset_id::text AS id, a.name,
                   pa.property_type, pa.market,
                   d.fund_id::text AS fund_id,
                   d.deal_id::text AS investment_id
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            LEFT JOIN repe_property_asset pa ON pa.asset_id = a.asset_id
            WHERE {" AND ".join(conditions)}
            ORDER BY a.name
            LIMIT %s
            """,
            params + [limit],
        )
        for r in cur.fetchall() or []:
            hits.append(
                SearchHit(
                    entity_type="asset",
                    entity_id=r["id"],
                    name=r["name"],
                    route=_route_for("asset", r["id"], env_id),
                    lane=LANE_METADATA,
                    score=0.6,
                    snippet=f"{r.get('property_type') or '—'} · {r.get('market') or '—'}",
                    meta={
                        "fund_id": r["fund_id"],
                        "investment_id": r["investment_id"],
                        "property_type": r.get("property_type"),
                        "market": r.get("market"),
                    },
                )
            )

    # Funds ranked by DPI / TVPI / gross_irr.
    if sort_field in {"dpi", "tvpi", "gross_irr"}:
        cur.execute(
            f"""
            SELECT f.fund_id::text AS id, f.name,
                   (
                     SELECT q.{sort_field}
                     FROM re_fund_quarter_state q
                     WHERE q.fund_id = f.fund_id
                     ORDER BY q.quarter DESC
                     LIMIT 1
                   ) AS metric_value
            FROM repe_fund f
            WHERE f.business_id = %s
            ORDER BY metric_value DESC NULLS LAST
            LIMIT %s
            """,
            (business_id, limit),
        )
        for r in cur.fetchall() or []:
            hits.append(
                SearchHit(
                    entity_type="fund",
                    entity_id=r["id"],
                    name=r["name"],
                    route=_route_for("fund", r["id"], env_id),
                    lane=LANE_METADATA,
                    score=0.6,
                    snippet=f"{sort_field}: {r.get('metric_value')}",
                    meta={sort_field: r.get("metric_value")},
                )
            )

    # Funds with negative NAV.
    if sort_field == "portfolio_nav_asc":
        cur.execute(
            """
            SELECT f.fund_id::text AS id, f.name,
                   (
                     SELECT q.portfolio_nav
                     FROM re_fund_quarter_state q
                     WHERE q.fund_id = f.fund_id
                     ORDER BY q.quarter DESC
                     LIMIT 1
                   ) AS nav
            FROM repe_fund f
            WHERE f.business_id = %s
            ORDER BY nav ASC NULLS LAST
            LIMIT %s
            """,
            (business_id, limit),
        )
        for r in cur.fetchall() or []:
            nav = r.get("nav")
            if nav is not None and float(nav) < 0:
                hits.append(
                    SearchHit(
                        entity_type="fund",
                        entity_id=r["id"],
                        name=r["name"],
                        route=_route_for("fund", r["id"], env_id),
                        lane=LANE_METADATA,
                        score=0.6,
                        snippet=f"NAV: {nav}",
                        meta={"portfolio_nav": float(nav)},
                    )
                )

    return hits


# ---------------------------------------------------------------------------
# Semantic lane — reuses rag_chunks via semantic_search
# ---------------------------------------------------------------------------


def _semantic_lane(
    *, business_id: str, env_id: str, query: str, limit: int
) -> list[SearchHit]:
    """Query rag_chunks via the existing semantic_search() helper.

    Only returns chunks whose `entity_type` is fund/investment/asset — we don't
    promote narrative docs unmoored from a canonical entity to search hits.
    Every hit's `entity_id` must resolve to a real row for the result to be
    kept; otherwise we discard (no hallucinated entities).
    """
    try:
        from app.services.rag_indexer import semantic_search
    except Exception as exc:
        logger.warning("rag_indexer unavailable: %s", exc)
        return []

    try:
        chunks = semantic_search(
            query,
            business_id=UUID(business_id),
            env_id=UUID(env_id) if env_id else None,
            top_k=limit,
            use_hybrid=True,
        )
    except Exception as exc:
        logger.warning("semantic_search failed: %s", exc)
        return []

    hits: list[SearchHit] = []
    for c in chunks:
        et = getattr(c, "entity_type", None) or c.__dict__.get("entity_type")
        eid = getattr(c, "entity_id", None) or c.__dict__.get("entity_id")
        if not et or not eid:
            continue
        if et not in ("fund", "investment", "asset"):
            continue
        score = float(getattr(c, "score", 0.0) or 0.0)
        snippet = getattr(c, "text", None) or getattr(c, "chunk_text", None)
        hits.append(
            SearchHit(
                entity_type=et,
                entity_id=str(eid),
                name="",  # filled by the resolver pass below
                route=_route_for(et, str(eid), env_id),
                lane=LANE_SEMANTIC,
                score=max(0.0, min(0.55, score * 0.55)),  # cap below prefix lane
                snippet=snippet,
            )
        )
    return hits


def _resolve_names_and_filter(
    cur, *, business_id: str, hits: list[SearchHit]
) -> list[SearchHit]:
    """Look up names for semantic hits. Drops any hit whose entity_id is not
    a real row in business_id's scope — fail-closed against hallucinations."""
    if not hits:
        return []
    by_type: dict[str, list[SearchHit]] = {"fund": [], "investment": [], "asset": []}
    for h in hits:
        if h.entity_type in by_type:
            by_type[h.entity_type].append(h)

    resolved: list[SearchHit] = []

    if by_type["fund"]:
        ids = [h.entity_id for h in by_type["fund"]]
        cur.execute(
            "SELECT fund_id::text AS id, name FROM repe_fund "
            "WHERE business_id = %s AND fund_id::text = ANY(%s)",
            (business_id, ids),
        )
        name_map = {r["id"]: r["name"] for r in cur.fetchall() or []}
        for h in by_type["fund"]:
            if h.entity_id in name_map:
                h.name = name_map[h.entity_id]
                resolved.append(h)

    if by_type["investment"]:
        ids = [h.entity_id for h in by_type["investment"]]
        cur.execute(
            """
            SELECT d.deal_id::text AS id, d.name
            FROM repe_deal d
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s AND d.deal_id::text = ANY(%s)
            """,
            (business_id, ids),
        )
        name_map = {r["id"]: r["name"] for r in cur.fetchall() or []}
        for h in by_type["investment"]:
            if h.entity_id in name_map:
                h.name = name_map[h.entity_id]
                resolved.append(h)

    if by_type["asset"]:
        ids = [h.entity_id for h in by_type["asset"]]
        cur.execute(
            """
            SELECT a.asset_id::text AS id, a.name
            FROM repe_asset a
            JOIN repe_deal d ON d.deal_id = a.deal_id
            JOIN repe_fund f ON f.fund_id = d.fund_id
            WHERE f.business_id = %s AND a.asset_id::text = ANY(%s)
            """,
            (business_id, ids),
        )
        name_map = {r["id"]: r["name"] for r in cur.fetchall() or []}
        for h in by_type["asset"]:
            if h.entity_id in name_map:
                h.name = name_map[h.entity_id]
                resolved.append(h)

    return resolved


# ---------------------------------------------------------------------------
# Ranked merge
# ---------------------------------------------------------------------------


def _merge_and_rank(all_hits: list[SearchHit], *, limit: int) -> list[SearchHit]:
    """Dedupe by (entity_type, entity_id). When the same entity wins via
    multiple lanes, keep the strongest lane (exact > prefix > metadata >
    semantic) and surface the winning lane + stacked score."""
    by_key: dict[tuple[str, str], SearchHit] = {}
    for h in all_hits:
        key = (h.entity_type, h.entity_id)
        if key not in by_key:
            by_key[key] = h
            continue
        existing = by_key[key]
        if LANE_PRIORITY[h.lane] < LANE_PRIORITY[existing.lane]:
            # Stronger lane wins. Merge the weaker score as provenance.
            h.meta = {**existing.meta, **h.meta, "also_from": existing.lane}
            by_key[key] = h
        else:
            existing.meta["also_from"] = h.lane

    ranked = sorted(
        by_key.values(),
        key=lambda h: (LANE_PRIORITY[h.lane], -h.score, h.name.lower()),
    )
    return ranked[:limit]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def hybrid_search(
    query: str,
    *,
    business_id: UUID | str,
    env_id: str,
    limit: int = 10,
    debug: bool = False,
) -> dict[str, Any]:
    """Run the exact / prefix / metadata / semantic lanes and merge.

    Returns:
      {
        "query": str,
        "results": [ { entity_type, entity_id, name, route, lane, score, snippet, meta } ],
        "debug"?: { lane_counts, lane_winners }  # only if debug=True
      }
    """
    business_id_s = str(business_id)
    q = (query or "").strip()
    if not q:
        return {"query": q, "results": []}

    with get_cursor() as cur:
        exact = _exact_and_prefix_lane(
            cur, business_id=business_id_s, env_id=env_id, query=q, limit=limit
        )
        metadata = _metadata_lane(
            cur, business_id=business_id_s, env_id=env_id, query=q, limit=limit
        )
        # Semantic runs with its own cursor scope inside rag_indexer.
        semantic = _semantic_lane(
            business_id=business_id_s, env_id=env_id, query=q, limit=limit
        )
        # Resolve names + drop hallucinations for semantic hits only.
        semantic = _resolve_names_and_filter(
            cur, business_id=business_id_s, hits=semantic
        )

    all_hits = exact + metadata + semantic
    ranked = _merge_and_rank(all_hits, limit=limit)

    out: dict[str, Any] = {
        "query": q,
        "results": [
            {
                "entity_type": h.entity_type,
                "entity_id": h.entity_id,
                "name": h.name,
                "route": h.route,
                "lane": h.lane,
                "score": h.score,
                "snippet": h.snippet,
                "meta": h.meta,
            }
            for h in ranked
        ],
    }

    if debug:
        lane_counts: dict[str, int] = {}
        for h in all_hits:
            lane_counts[h.lane] = lane_counts.get(h.lane, 0) + 1
        out["debug"] = {
            "lane_counts": lane_counts,
            "ranked_lanes": [h.lane for h in ranked],
            "total_candidates": len(all_hits),
        }

    return out
