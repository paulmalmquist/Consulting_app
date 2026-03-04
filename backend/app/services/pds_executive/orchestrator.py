from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db import get_cursor
from app.services.pds_executive import connectors, decision_engine


def _upsert_kpi_daily(*, env_id: UUID, business_id: UUID) -> dict:
    today = date.today()

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE status IN ('open', 'in_review', 'deferred')) AS open_queue,
              COUNT(*) FILTER (WHERE status IN ('approved', 'delegated', 'escalated', 'closed')) AS resolved_queue
            FROM pds_exec_queue_item
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        q = cur.fetchone() or {}
        open_queue = int(q.get("open_queue") or 0)
        resolved_queue = int(q.get("resolved_queue") or 0)

        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE severity IN ('high', 'critical')) AS high_signals,
              COUNT(*) AS total_signals
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND signal_time::date = %s
            """,
            (str(env_id), str(business_id), today),
        )
        s = cur.fetchone() or {}
        high_signals = int(s.get("high_signals") or 0)
        total_signals = int(s.get("total_signals") or 0)

        queue_sla = Decimal("0")
        if open_queue + resolved_queue > 0:
            queue_sla = Decimal(resolved_queue) / Decimal(open_queue + resolved_queue)

        recommendation_alignment = Decimal("0")
        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE action_type IN ('approve', 'delegate', 'escalate')) AS aligned,
              COUNT(*) AS total
            FROM pds_exec_queue_action
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND created_at::date = %s
            """,
            (str(env_id), str(business_id), today),
        )
        a = cur.fetchone() or {}
        aligned = int(a.get("aligned") or 0)
        action_total = int(a.get("total") or 0)
        if action_total > 0:
            recommendation_alignment = Decimal(aligned) / Decimal(action_total)

        # Proxy KPIs in v1 until true baselines are wired.
        admin_workload_delta = Decimal(high_signals) * Decimal("0.5")
        risk_detection_lead_hours = Decimal(high_signals) * Decimal("0.4")
        decision_latency_hours = Decimal(max(open_queue, 0)) * Decimal("0.3")
        delivery_reliability_delta = Decimal("0.10") if high_signals > 0 else Decimal("0")
        pipeline_visibility_delta = Decimal("0.15") if total_signals > 0 else Decimal("0")

        cur.execute(
            """
            INSERT INTO pds_exec_kpi_daily
            (env_id, business_id, kpi_date, decision_latency_hours, risk_detection_lead_hours,
             delivery_reliability_delta, pipeline_visibility_delta, admin_workload_delta,
             queue_sla_compliance, recommendation_alignment)
            VALUES
            (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (env_id, business_id, kpi_date) DO UPDATE
              SET decision_latency_hours = EXCLUDED.decision_latency_hours,
                  risk_detection_lead_hours = EXCLUDED.risk_detection_lead_hours,
                  delivery_reliability_delta = EXCLUDED.delivery_reliability_delta,
                  pipeline_visibility_delta = EXCLUDED.pipeline_visibility_delta,
                  admin_workload_delta = EXCLUDED.admin_workload_delta,
                  queue_sla_compliance = EXCLUDED.queue_sla_compliance,
                  recommendation_alignment = EXCLUDED.recommendation_alignment
            RETURNING *
            """,
            (
                str(env_id),
                str(business_id),
                today,
                decision_latency_hours,
                risk_detection_lead_hours,
                delivery_reliability_delta,
                pipeline_visibility_delta,
                admin_workload_delta,
                queue_sla,
                recommendation_alignment,
            ),
        )
        return cur.fetchone()


def run_decision_cycle(
    *,
    env_id: UUID,
    business_id: UUID,
    actor: str | None = None,
    include_non_triggered: bool = False,
) -> dict:
    result = decision_engine.run_decision_engine(
        env_id=env_id,
        business_id=business_id,
        actor=actor,
        include_non_triggered=include_non_triggered,
    )
    kpi_row = _upsert_kpi_daily(env_id=env_id, business_id=business_id)
    return {"decision_engine": result, "kpi_daily": kpi_row}


def run_full_cycle(
    *,
    env_id: UUID,
    business_id: UUID,
    actor: str | None = None,
    connector_keys: list[str] | None = None,
    force_refresh: bool = False,
) -> dict:
    connector_runs = connectors.run_connectors(
        env_id=env_id,
        business_id=business_id,
        connector_keys=connector_keys,
        run_mode="live",
        force_refresh=force_refresh,
        actor=actor,
    )
    decision_result = decision_engine.run_decision_engine(env_id=env_id, business_id=business_id, actor=actor)
    kpi_row = _upsert_kpi_daily(env_id=env_id, business_id=business_id)

    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "connectors": connector_runs,
        "decision_engine": decision_result,
        "kpi_daily": kpi_row,
    }


def get_overview(*, env_id: UUID, business_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE status IN ('open', 'in_review', 'deferred')) AS open_queue,
              COUNT(*) FILTER (WHERE priority = 'critical' AND status IN ('open', 'in_review', 'deferred')) AS critical_queue,
              COUNT(*) FILTER (WHERE priority = 'high' AND status IN ('open', 'in_review', 'deferred')) AS high_queue
            FROM pds_exec_queue_item
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        queue_counts = cur.fetchone() or {}

        cur.execute(
            """
            SELECT
              COUNT(*) FILTER (WHERE status IN ('open', 'acknowledged')) AS open_signals,
              COUNT(*) FILTER (WHERE severity IN ('high', 'critical') AND status IN ('open', 'acknowledged')) AS high_signals
            FROM pds_exec_signal_event
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            """,
            (str(env_id), str(business_id)),
        )
        signal_counts = cur.fetchone() or {}

        cur.execute(
            """
            SELECT *
            FROM pds_exec_kpi_daily
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
            ORDER BY kpi_date DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id)),
        )
        latest_kpi = cur.fetchone()

    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "decisions_total": 20,
        "open_queue": int(queue_counts.get("open_queue") or 0),
        "critical_queue": int(queue_counts.get("critical_queue") or 0),
        "high_queue": int(queue_counts.get("high_queue") or 0),
        "open_signals": int(signal_counts.get("open_signals") or 0),
        "high_signals": int(signal_counts.get("high_signals") or 0),
        "latest_kpi": latest_kpi,
    }
