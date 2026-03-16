"""CRE Portfolio KPI Aggregation Service.

Computes portfolio-level KPIs: NOI rollup, weighted occupancy, LTV,
property counts, and risk distribution.
"""
from __future__ import annotations

import logging
from datetime import date
from uuid import UUID

from app.db import get_cursor

log = logging.getLogger(__name__)


def compute_portfolio_kpis(
    *,
    env_id: UUID,
    business_id: UUID,
    period: date | None = None,
) -> dict:
    """Compute aggregate portfolio KPIs across all properties in an environment."""
    env = str(env_id)
    biz = str(business_id)

    with get_cursor() as cur:
        # Property counts and total sqft
        cur.execute(
            """
            SELECT COUNT(*) AS property_count,
                   COALESCE(SUM(db.sqft), 0) AS total_sqft,
                   ROUND(AVG(db.year_built)) AS avg_year_built
            FROM dim_property dp
            LEFT JOIN dim_building db ON db.property_id = dp.property_id
            WHERE dp.env_id = %s AND dp.business_id = %s
            """,
            (env, biz),
        )
        counts = cur.fetchone()

        # NOI rollup from fact_property_timeseries
        cur.execute(
            """
            SELECT COALESCE(SUM(value), 0) AS total_noi
            FROM fact_property_timeseries fpt
            JOIN dim_property dp ON dp.property_id = fpt.property_id
            WHERE dp.env_id = %s AND dp.business_id = %s
              AND fpt.metric_key = 'noi_actual'
            """,
            (env, biz),
        )
        noi = cur.fetchone()

        # Occupancy from feature_store
        cur.execute(
            """
            SELECT AVG(CAST(value AS numeric)) AS avg_occupancy
            FROM feature_store
            WHERE env_id = %s AND business_id = %s AND feature_key = 'occupancy_rate'
            """,
            (env, biz),
        )
        occ = cur.fetchone()

        # Risk distribution from forecast_registry
        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE prediction < 0.2) AS low_risk,
              COUNT(*) FILTER (WHERE prediction >= 0.2 AND prediction < 0.5) AS medium_risk,
              COUNT(*) FILTER (WHERE prediction >= 0.5) AS high_risk
            FROM forecast_registry
            WHERE env_id = %s AND business_id = %s AND target_metric = 'distress_probability'
            """,
            (env, biz),
        )
        risk = cur.fetchone()

        # Entity counts
        cur.execute(
            "SELECT entity_type, COUNT(*) AS cnt FROM dim_entity WHERE env_id = %s AND business_id = %s GROUP BY entity_type",
            (env, biz),
        )
        entity_counts = {row["entity_type"]: row["cnt"] for row in cur.fetchall()}

    return {
        "property_count": counts["property_count"] if counts else 0,
        "total_sqft": float(counts["total_sqft"]) if counts else 0,
        "avg_year_built": int(counts["avg_year_built"]) if counts and counts["avg_year_built"] else None,
        "total_noi": float(noi["total_noi"]) if noi else 0,
        "avg_occupancy": round(float(occ["avg_occupancy"]), 4) if occ and occ["avg_occupancy"] else None,
        "risk_distribution": {
            "low": risk["low_risk"] if risk else 0,
            "medium": risk["medium_risk"] if risk else 0,
            "high": risk["high_risk"] if risk else 0,
        },
        "entity_counts": entity_counts,
        "as_of": (period or date.today()).isoformat(),
    }
