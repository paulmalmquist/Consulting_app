"""Consulting Revenue OS – Deterministic Metrics Engine.

Every metric has an explicit SQL formula. No ML. Snapshots stored with
input_hash for auditability. This is the core revenue intelligence layer.
"""
from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.observability.logger import emit_log


def compute_weighted_pipeline(cur, business_id: UUID) -> dict:
    """SUM(amount * win_probability) for open opportunities."""
    cur.execute(
        """
        SELECT
            COALESCE(SUM(o.amount * s.win_probability), 0) AS weighted,
            COALESCE(SUM(o.amount), 0) AS unweighted,
            COUNT(*) AS open_count
        FROM crm_opportunity o
        JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
        WHERE o.business_id = %s AND o.status = 'open'
        """,
        (str(business_id),),
    )
    return cur.fetchone()


def compute_close_rate_90d(cur, business_id: UUID) -> dict:
    """won / (won + lost) for last 90 days."""
    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE status = 'won') AS won_count,
            COUNT(*) FILTER (WHERE status = 'lost') AS lost_count
        FROM crm_opportunity
        WHERE business_id = %s
          AND status IN ('won', 'lost')
          AND updated_at >= now() - interval '90 days'
        """,
        (str(business_id),),
    )
    row = cur.fetchone()
    won = row["won_count"]
    lost = row["lost_count"]
    total = won + lost
    rate = round(Decimal(won) / Decimal(total), 4) if total > 0 else None
    return {"won_count_90d": won, "lost_count_90d": lost, "close_rate_90d": rate}


def compute_outreach_30d(cur, env_id: str, business_id: UUID) -> dict:
    """Rolling 30-day outreach stats."""
    cur.execute(
        """
        SELECT
            COUNT(*) AS outreach_count,
            COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied_count,
            COUNT(*) FILTER (WHERE meeting_booked = true) AS meetings
        FROM cro_outreach_log
        WHERE env_id = %s AND business_id = %s
          AND sent_at >= now() - interval '30 days'
        """,
        (env_id, str(business_id)),
    )
    row = cur.fetchone()
    total = row["outreach_count"]
    replied = row["replied_count"]
    rate = round(Decimal(replied) / Decimal(total), 4) if total > 0 else None
    return {
        "outreach_count_30d": total,
        "response_rate_30d": rate,
        "meetings_30d": row["meetings"],
    }


def compute_revenue_mtd_qtd(cur, env_id: str, business_id: UUID) -> dict:
    """Revenue MTD and QTD from paid entries."""
    cur.execute(
        """
        SELECT
            COALESCE(SUM(amount) FILTER (
                WHERE paid_at >= date_trunc('month', CURRENT_DATE)
            ), 0) AS revenue_mtd,
            COALESCE(SUM(amount) FILTER (
                WHERE paid_at >= date_trunc('quarter', CURRENT_DATE)
            ), 0) AS revenue_qtd
        FROM cro_revenue_schedule
        WHERE env_id = %s AND business_id = %s AND invoice_status = 'paid'
        """,
        (env_id, str(business_id)),
    )
    return cur.fetchone()


def compute_forecast_90d(
    weighted_pipeline: Decimal,
    close_rate: Decimal | None,
    scheduled_revenue: Decimal,
) -> Decimal:
    """Deterministic forecast: weighted_pipeline * close_rate + scheduled_revenue.

    If close_rate is None (no closed deals), use conservative 0.20.
    """
    rate = close_rate if close_rate is not None else Decimal("0.20")
    return round(weighted_pipeline * rate + scheduled_revenue, 2)


def compute_avg_deal_size(cur, business_id: UUID) -> Decimal | None:
    """AVG(amount) for won opportunities in the last 12 months."""
    cur.execute(
        """
        SELECT AVG(amount) AS avg_deal
        FROM crm_opportunity
        WHERE business_id = %s AND status = 'won'
          AND updated_at >= now() - interval '12 months'
        """,
        (str(business_id),),
    )
    row = cur.fetchone()
    val = row["avg_deal"] if row else None
    return round(Decimal(str(val)), 2) if val is not None else None


def compute_engagement_stats(cur, env_id: str, business_id: UUID) -> dict:
    """Active engagements, active clients, average margin."""
    cur.execute(
        """
        SELECT
            COUNT(*) FILTER (WHERE status = 'active') AS active_engagements,
            AVG(margin_pct) FILTER (WHERE margin_pct IS NOT NULL) AS avg_margin
        FROM cro_engagement
        WHERE env_id = %s AND business_id = %s
        """,
        (env_id, str(business_id)),
    )
    eng_row = cur.fetchone()

    cur.execute(
        """
        SELECT COUNT(*) AS active_clients
        FROM cro_client
        WHERE env_id = %s AND business_id = %s AND client_status = 'active'
        """,
        (env_id, str(business_id)),
    )
    client_row = cur.fetchone()

    avg_margin = eng_row["avg_margin"]
    return {
        "active_engagements": eng_row["active_engagements"],
        "avg_margin_pct": round(Decimal(str(avg_margin)), 4) if avg_margin is not None else None,
        "active_clients": client_row["active_clients"],
    }


def compute_all_metrics(*, env_id: str, business_id: UUID) -> dict:
    """Orchestrate all metric computations and create a snapshot."""
    with get_cursor() as cur:
        pipeline = compute_weighted_pipeline(cur, business_id)
        close_rate = compute_close_rate_90d(cur, business_id)
        outreach = compute_outreach_30d(cur, env_id, business_id)
        revenue = compute_revenue_mtd_qtd(cur, env_id, business_id)
        avg_deal = compute_avg_deal_size(cur, business_id)
        eng_stats = compute_engagement_stats(cur, env_id, business_id)

        # Scheduled revenue for next 90d (for forecast)
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS scheduled
            FROM cro_revenue_schedule
            WHERE env_id = %s AND business_id = %s
              AND invoice_status = 'scheduled'
              AND period_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '90 days'
            """,
            (env_id, str(business_id)),
        )
        sched_row = cur.fetchone()
        scheduled = Decimal(str(sched_row["scheduled"]))

        weighted = Decimal(str(pipeline["weighted"]))
        forecast = compute_forecast_90d(weighted, close_rate["close_rate_90d"], scheduled)

        # Build input hash for deduplication
        input_data = {
            "pipeline": str(pipeline),
            "close_rate": str(close_rate),
            "outreach": str(outreach),
            "revenue": str(revenue),
            "eng_stats": str(eng_stats),
        }
        input_hash = hashlib.sha256(json.dumps(input_data, sort_keys=True).encode()).hexdigest()[:16]

        # Insert snapshot
        now = datetime.now(timezone.utc)
        cur.execute(
            """
            INSERT INTO cro_revenue_metrics_snapshot
              (env_id, business_id, snapshot_date,
               weighted_pipeline, unweighted_pipeline, open_opportunities,
               close_rate_90d, won_count_90d, lost_count_90d,
               outreach_count_30d, response_rate_30d, meetings_30d,
               revenue_mtd, revenue_qtd, forecast_90d,
               avg_deal_size, avg_margin_pct,
               active_engagements, active_clients,
               computed_at, input_hash)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, env_id, business_id, snapshot_date,
                      weighted_pipeline, unweighted_pipeline, open_opportunities,
                      close_rate_90d, won_count_90d, lost_count_90d,
                      outreach_count_30d, response_rate_30d, meetings_30d,
                      revenue_mtd, revenue_qtd, forecast_90d,
                      avg_deal_size, avg_margin_pct,
                      active_engagements, active_clients,
                      computed_at, input_hash, created_at
            """,
            (
                env_id, str(business_id), date.today(),
                str(weighted), str(pipeline["unweighted"]), pipeline["open_count"],
                str(close_rate["close_rate_90d"]) if close_rate["close_rate_90d"] is not None else None,
                close_rate["won_count_90d"], close_rate["lost_count_90d"],
                outreach["outreach_count_30d"],
                str(outreach["response_rate_30d"]) if outreach["response_rate_30d"] is not None else None,
                outreach["meetings_30d"],
                str(revenue["revenue_mtd"]), str(revenue["revenue_qtd"]),
                str(forecast), str(avg_deal) if avg_deal is not None else None,
                str(eng_stats["avg_margin_pct"]) if eng_stats["avg_margin_pct"] is not None else None,
                eng_stats["active_engagements"], eng_stats["active_clients"],
                now, input_hash,
            ),
        )
        snapshot = cur.fetchone()

    emit_log(
        level="info",
        service="backend",
        action="cro.metrics.snapshot_created",
        message=f"Metrics snapshot created for {date.today()}",
        context={"input_hash": input_hash, "forecast_90d": str(forecast)},
    )
    return snapshot


def get_latest_snapshot(*, env_id: str, business_id: UUID) -> dict | None:
    """Get the most recent metrics snapshot."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, business_id, snapshot_date,
                   weighted_pipeline, unweighted_pipeline, open_opportunities,
                   close_rate_90d, won_count_90d, lost_count_90d,
                   outreach_count_30d, response_rate_30d, meetings_30d,
                   revenue_mtd, revenue_qtd, forecast_90d,
                   avg_deal_size, avg_margin_pct,
                   active_engagements, active_clients,
                   computed_at, input_hash, created_at
            FROM cro_revenue_metrics_snapshot
            WHERE env_id = %s AND business_id = %s
            ORDER BY snapshot_date DESC, computed_at DESC
            LIMIT 1
            """,
            (env_id, str(business_id)),
        )
        return cur.fetchone()


def get_stale_records(*, env_id: str, business_id: UUID, stale_days: int = 14) -> dict:
    """Return accounts with no recent activity and open opportunities missing next actions."""
    with get_cursor() as cur:
        # Stale accounts: last activity > stale_days ago
        cur.execute(
            """
            SELECT a.crm_account_id, a.name, a.industry,
                   MAX(act.activity_date) AS last_activity_date,
                   EXTRACT(DAY FROM now() - MAX(act.activity_date))::int AS days_stale
              FROM crm_account a
              LEFT JOIN crm_activity act ON act.crm_account_id = a.crm_account_id
             WHERE a.business_id = %s
               AND a.account_type NOT IN ('archived', 'cold_hold')
             GROUP BY a.crm_account_id, a.name, a.industry
            HAVING MAX(act.activity_date) IS NULL
                OR MAX(act.activity_date) < now() - interval '%s days'
             ORDER BY days_stale DESC NULLS FIRST
             LIMIT 20
            """,
            (str(business_id), stale_days),
        )
        stale_accounts = [dict(r) for r in cur.fetchall()]

        # Orphan opportunities: open with no pending next action
        cur.execute(
            """
            SELECT o.crm_opportunity_id, o.name, a.name AS account_name,
                   s.key AS stage_key, o.amount
              FROM crm_opportunity o
              LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
              LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
             WHERE o.business_id = %s
               AND o.status = 'open'
               AND NOT EXISTS (
                   SELECT 1 FROM cro_next_action na
                    WHERE na.entity_type = 'opportunity'
                      AND na.entity_id = o.crm_opportunity_id
                      AND na.status = 'pending'
               )
             ORDER BY o.amount DESC NULLS LAST
             LIMIT 20
            """,
            (str(business_id),),
        )
        orphan_opps = [dict(r) for r in cur.fetchall()]

    return {
        "stale_accounts": stale_accounts,
        "orphan_opportunities": orphan_opps,
    }
