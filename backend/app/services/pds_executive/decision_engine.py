from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg

from app.db import get_cursor
from app.services.pds_executive import catalog, queue, signals

DEFAULT_THRESHOLDS = {
    "D07": {"schedule_slip_pct": Decimal("0.10"), "budget_overrun_pct": Decimal("0.07")},
    "D08": {"pending_change_order_count": Decimal("3")},
    "D10": {"utilization_threshold": Decimal("1.10")},
    "D12": {"risk_project_threshold": Decimal("2")},
    "D18": {"claim_exposure_threshold": Decimal("250000")},
    "D19": {"interest_rate_threshold": Decimal("5.5")},
    "D16": {"nps_low_threshold": Decimal("3.0")},
}


@dataclass
class DecisionEvaluation:
    decision_code: str
    decision_title: str
    triggered: bool
    priority: str
    title: str
    summary: str
    recommended_action: str
    recommended_owner: str | None
    risk_score: Decimal
    signal_type: str
    severity: str
    correlation_key: str
    project_id: UUID | None
    due_at: datetime | None
    context_json: dict[str, Any]
    ai_analysis_json: dict[str, Any]
    input_snapshot_json: dict[str, Any]


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _threshold(
    policies: dict[str, dict[str, Any]],
    decision_code: str,
    key: str,
    default: Decimal,
) -> Decimal:
    decision_policy = policies.get(decision_code, {})
    if key not in decision_policy or decision_policy[key] is None:
        return default
    return _decimal(decision_policy[key])


def _load_metrics(*, env_id: UUID, business_id: UUID) -> dict[str, Any]:
    today = date.today()
    metrics: dict[str, Any] = {
        "projects": [],
        "change_orders_pending": [],
        "risks_open": [],
        "claims_open": [],
        "survey_low": [],
        "crm_open": [],
        "crm_pipeline_value_open": Decimal("0"),
        "comm_recent": [],
        "market_snapshot": None,
        "portfolio_snapshot": None,
    }

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT *
            FROM pds_projects
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status = 'active'
            ORDER BY updated_at DESC
            LIMIT 400
            """,
            (str(env_id), str(business_id)),
        )
        projects = cur.fetchall()
        metrics["projects"] = projects

        cur.execute(
            """
            SELECT *
            FROM pds_change_orders
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 400
            """,
            (str(env_id), str(business_id)),
        )
        metrics["change_orders_pending"] = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM pds_risks
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status IN ('open', 'mitigating')
            ORDER BY created_at DESC
            LIMIT 400
            """,
            (str(env_id), str(business_id)),
        )
        metrics["risks_open"] = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM pds_contractor_claims
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND status NOT IN ('closed', 'resolved', 'withdrawn')
            ORDER BY created_at DESC
            LIMIT 300
            """,
            (str(env_id), str(business_id)),
        )
        metrics["claims_open"] = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM pds_survey_responses
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND score IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 300
            """,
            (str(env_id), str(business_id)),
        )
        survey_rows = cur.fetchall()
        metrics["survey_low"] = [row for row in survey_rows if _decimal(row.get("score")) < Decimal("3")]

        try:
            cur.execute(
                """
                SELECT
                  o.crm_opportunity_id,
                  o.name,
                  o.amount,
                  o.expected_close_date,
                  o.status,
                  s.key AS stage_key,
                  s.label AS stage_label,
                  s.win_probability,
                  a.name AS account_name
                FROM crm_opportunity o
                LEFT JOIN crm_pipeline_stage s ON s.crm_pipeline_stage_id = o.crm_pipeline_stage_id
                LEFT JOIN crm_account a ON a.crm_account_id = o.crm_account_id
                WHERE o.business_id = %s::uuid
                ORDER BY o.created_at DESC
                LIMIT 500
                """,
                (str(business_id),),
            )
            crm_rows = cur.fetchall()
        except psycopg.errors.UndefinedTable:
            crm_rows = []
        metrics["crm_open"] = [row for row in crm_rows if str(row.get("status") or "").lower() == "open"]
        metrics["crm_pipeline_value_open"] = sum((_decimal(row.get("amount")) for row in metrics["crm_open"]), Decimal("0"))

        cur.execute(
            """
            SELECT *
            FROM pds_exec_comm_item
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND occurred_at >= %s
            ORDER BY occurred_at DESC
            LIMIT 400
            """,
            (str(env_id), str(business_id), today - timedelta(days=14)),
        )
        metrics["comm_recent"] = cur.fetchall()

        cur.execute(
            """
            SELECT *
            FROM pds_portfolio_snapshots
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND project_id IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(env_id), str(business_id)),
        )
        metrics["portfolio_snapshot"] = cur.fetchone()

        cur.execute(
            """
            SELECT config_json
            FROM pds_exec_integration_config
            WHERE env_id = %s::uuid
              AND business_id = %s::uuid
              AND provider_key = 'pds_market_external'
            LIMIT 1
            """,
            (str(env_id), str(business_id)),
        )
        market_cfg = cur.fetchone() or {}

    cfg_json = market_cfg.get("config_json") if isinstance(market_cfg.get("config_json"), dict) else {}
    snapshots = cfg_json.get("snapshots") if isinstance(cfg_json.get("snapshots"), list) else []
    metrics["market_snapshot"] = snapshots[-1] if snapshots else {
        "as_of_date": str(today),
        "interest_rate": "5.25",
        "steel_index": "118.4",
        "lumber_index": "107.2",
        "labor_tightness": "0.62",
    }

    return metrics


def evaluate_decisions(*, env_id: UUID, business_id: UUID) -> list[DecisionEvaluation]:
    catalog_map = catalog.get_decision_catalog_map(active_only=True)
    policies = catalog.get_threshold_policy_map(env_id=env_id, business_id=business_id)
    metrics = _load_metrics(env_id=env_id, business_id=business_id)
    today = date.today()
    quarter = ((today.month - 1) // 3) + 1

    projects = metrics["projects"]
    change_orders_pending = metrics["change_orders_pending"]
    risks_open = metrics["risks_open"]
    claims_open = metrics["claims_open"]
    survey_low = metrics["survey_low"]
    crm_open = metrics["crm_open"]
    comm_recent = metrics["comm_recent"]

    schedule_threshold = _threshold(policies, "D07", "schedule_slip_pct", DEFAULT_THRESHOLDS["D07"]["schedule_slip_pct"])
    budget_threshold = _threshold(policies, "D07", "budget_overrun_pct", DEFAULT_THRESHOLDS["D07"]["budget_overrun_pct"])
    pending_co_threshold = _threshold(policies, "D08", "pending_change_order_count", DEFAULT_THRESHOLDS["D08"]["pending_change_order_count"])
    utilization_threshold = _threshold(policies, "D10", "utilization_threshold", DEFAULT_THRESHOLDS["D10"]["utilization_threshold"])
    risk_project_threshold = _threshold(policies, "D12", "risk_project_threshold", DEFAULT_THRESHOLDS["D12"]["risk_project_threshold"])
    claim_threshold = _threshold(policies, "D18", "claim_exposure_threshold", DEFAULT_THRESHOLDS["D18"]["claim_exposure_threshold"])
    interest_rate_threshold = _threshold(policies, "D19", "interest_rate_threshold", DEFAULT_THRESHOLDS["D19"]["interest_rate_threshold"])
    nps_threshold = _threshold(policies, "D16", "nps_low_threshold", DEFAULT_THRESHOLDS["D16"]["nps_low_threshold"])

    # PM load proxy: active projects per manager / 4.
    pm_load: dict[str, int] = {}
    pm_high_risk: dict[str, int] = {}
    project_by_id = {str(row["project_id"]): row for row in projects if row.get("project_id")}
    for row in projects:
        pm = (row.get("project_manager") or "Unassigned").strip() or "Unassigned"
        pm_load[pm] = pm_load.get(pm, 0) + 1

        budget = _decimal(row.get("approved_budget"))
        eac = _decimal(row.get("forecast_at_completion"))
        overrun_ratio = (eac - budget) / budget if budget > 0 else Decimal("0")
        if _decimal(row.get("risk_score")) >= Decimal("75000") or overrun_ratio >= budget_threshold:
            pm_high_risk[pm] = pm_high_risk.get(pm, 0) + 1

    max_pm, max_pm_projects = (None, 0)
    min_pm_projects = 999999
    for pm, count in pm_load.items():
        if count > max_pm_projects:
            max_pm = pm
            max_pm_projects = count
        if count < min_pm_projects:
            min_pm_projects = count
    if min_pm_projects == 999999:
        min_pm_projects = 0

    total_claim_exposure = sum(
        (
            _decimal(row.get("exposure_amount")) if row.get("exposure_amount") is not None else _decimal(row.get("claimed_amount"))
            for row in claims_open
        ),
        Decimal("0"),
    )
    avg_survey = sum((_decimal(row.get("score")) for row in survey_low), Decimal("0")) / Decimal(len(survey_low)) if survey_low else Decimal("5")

    market_snapshot = metrics["market_snapshot"] or {}
    market_rate = _decimal(market_snapshot.get("interest_rate"))

    evaluations: list[DecisionEvaluation] = []

    def add_eval(
        decision_code: str,
        triggered: bool,
        priority: str,
        title: str,
        summary: str,
        recommended_action: str,
        *,
        risk_score: Decimal = Decimal("0"),
        signal_type: str = "threshold",
        severity: str = "medium",
        correlation_key: str,
        project_id: UUID | None = None,
        due_days: int | None = None,
        recommended_owner: str | None = None,
        context_json: dict[str, Any] | None = None,
        ai_analysis_json: dict[str, Any] | None = None,
        input_snapshot_json: dict[str, Any] | None = None,
    ) -> None:
        meta = catalog_map.get(decision_code, {"decision_title": decision_code})
        due_at = None
        if due_days is not None:
            due_at = datetime.utcnow() + timedelta(days=due_days)

        evaluations.append(
            DecisionEvaluation(
                decision_code=decision_code,
                decision_title=str(meta.get("decision_title") or decision_code),
                triggered=triggered,
                priority=priority,
                title=title,
                summary=summary,
                recommended_action=recommended_action,
                recommended_owner=recommended_owner,
                risk_score=risk_score,
                signal_type=signal_type,
                severity=severity,
                correlation_key=correlation_key,
                project_id=project_id,
                due_at=due_at,
                context_json=context_json or {},
                ai_analysis_json=ai_analysis_json or {},
                input_snapshot_json=input_snapshot_json or {},
            )
        )

    # D01..D03 strategy: monthly/quarterly cadences.
    add_eval(
        "D01",
        triggered=today.month in {1, 4, 7, 10} and today.day <= 7,
        priority="medium",
        title="Quarterly market expansion review",
        summary="Assess new geography/sector expansion candidates from pipeline and macro signals.",
        recommended_action="Run market expansion scenario review",
        signal_type="cadence",
        severity="medium",
        correlation_key=f"D01:{today.year}-Q{quarter}",
        due_days=5,
        input_snapshot_json={"pipeline_value_open": str(metrics["crm_pipeline_value_open"]), "market": market_snapshot},
    )

    add_eval(
        "D02",
        triggered=today.day <= 3,
        priority="medium",
        title="Sector allocation calibration",
        summary="Review sector mix and re-prioritize focus sectors for PDS pursuits.",
        recommended_action="Approve sector allocation plan",
        signal_type="cadence",
        severity="medium",
        correlation_key=f"D02:{today.strftime('%Y-%m')}",
        due_days=3,
        input_snapshot_json={"open_opportunities": len(crm_open), "pipeline_value_open": str(metrics["crm_pipeline_value_open"])},
    )

    add_eval(
        "D03",
        triggered=today.day in {1, 15},
        priority="low",
        title="Strategic partnership sync",
        summary="Refresh partnership priority list using active opportunity concentration.",
        recommended_action="Update partnership tier list",
        signal_type="cadence",
        severity="low",
        correlation_key=f"D03:{today.strftime('%Y-%m-%d')}",
        due_days=7,
    )

    # Pipeline loop.
    low_win_opps = [row for row in crm_open if _decimal(row.get("win_probability")) < Decimal("0.35")]
    add_eval(
        "D04",
        triggered=bool(crm_open),
        priority="high" if len(crm_open) >= 10 else "medium",
        title="Pursuit approval queue",
        summary=f"{len(crm_open)} open opportunities require pursue/decline decisions.",
        recommended_action="Review pursuit approvals",
        signal_type="new_opportunity",
        severity="high" if len(crm_open) >= 10 else "medium",
        correlation_key=f"D04:{today.strftime('%Y-%m-%d')}:{len(crm_open)}",
        due_days=2,
        input_snapshot_json={"open_opportunities": len(crm_open)},
    )

    add_eval(
        "D05",
        triggered=bool(low_win_opps),
        priority="high" if len(low_win_opps) >= 3 else "medium",
        title="Bid strategy optimization",
        summary=f"{len(low_win_opps)} opportunities are below win-probability threshold.",
        recommended_action="Adjust pricing/terms for low-probability bids",
        signal_type="proposal_window",
        severity="high" if len(low_win_opps) >= 3 else "medium",
        correlation_key=f"D05:{today.strftime('%Y-%m-%d')}:{len(low_win_opps)}",
        due_days=1,
        input_snapshot_json={"low_win_opportunities": len(low_win_opps)},
    )

    add_eval(
        "D06",
        triggered=today.weekday() in {0, 1},
        priority="medium",
        title="Weekly pipeline prioritization",
        summary="Re-rank pipeline by strategic fit, win probability, and revenue.",
        recommended_action="Publish pipeline priority order",
        signal_type="cadence",
        severity="medium",
        correlation_key=f"D06:{today.strftime('%Y-%W')}",
        due_days=2,
    )

    # Portfolio/Delivery.
    escalated_projects: list[dict] = []
    for project in projects:
        budget = _decimal(project.get("approved_budget"))
        eac = _decimal(project.get("forecast_at_completion"))
        overrun_ratio = ((eac - budget) / budget) if budget > 0 else Decimal("0")
        milestone_date = project.get("next_milestone_date")
        overdue_milestone = bool(milestone_date and milestone_date < today)

        if overrun_ratio >= budget_threshold or _decimal(project.get("risk_score")) >= Decimal("80000") or overdue_milestone:
            escalated_projects.append(project)

    add_eval(
        "D07",
        triggered=bool(escalated_projects),
        priority="critical" if len(escalated_projects) >= 3 else "high",
        title="Project escalation required",
        summary=f"{len(escalated_projects)} projects breached cost/schedule/risk thresholds.",
        recommended_action="Escalate projects to executive intervention review",
        risk_score=Decimal(len(escalated_projects) * 10),
        signal_type="threshold_breach",
        severity="critical" if len(escalated_projects) >= 3 else "high",
        correlation_key=f"D07:{today.strftime('%Y-%m-%d')}:{len(escalated_projects)}",
        due_days=1,
        project_id=UUID(str(escalated_projects[0]["project_id"])) if escalated_projects else None,
        input_snapshot_json={"escalated_project_count": len(escalated_projects), "budget_threshold": str(budget_threshold), "schedule_threshold": str(schedule_threshold)},
    )

    pending_count = len(change_orders_pending)
    add_eval(
        "D08",
        triggered=pending_count >= int(pending_co_threshold),
        priority="high" if pending_count >= int(pending_co_threshold) else "low",
        title="Change order strategy review",
        summary=f"{pending_count} pending change orders currently awaiting strategy decision.",
        recommended_action="Approve, negotiate, or reject pending change orders",
        risk_score=Decimal(pending_count * 5),
        signal_type="queue_threshold",
        severity="high" if pending_count >= int(pending_co_threshold) else "low",
        correlation_key=f"D08:{today.strftime('%Y-%m-%d')}:{pending_count}",
        due_days=2,
        input_snapshot_json={"pending_change_orders": pending_count, "threshold": str(pending_co_threshold)},
    )

    vendor_issue_count = len(claims_open)
    add_eval(
        "D09",
        triggered=vendor_issue_count >= 2,
        priority="high" if vendor_issue_count >= 4 else "medium",
        title="Contractor performance intervention",
        summary=f"{vendor_issue_count} open contractor claims indicate potential replacement candidates.",
        recommended_action="Review contractor scorecards and replacement options",
        signal_type="vendor_risk",
        severity="high" if vendor_issue_count >= 4 else "medium",
        correlation_key=f"D09:{today.strftime('%Y-%m-%d')}:{vendor_issue_count}",
        due_days=3,
        input_snapshot_json={"open_claims": vendor_issue_count, "claim_exposure": str(total_claim_exposure)},
    )

    overloaded_pm = max_pm_projects / 4 if max_pm_projects else 0
    add_eval(
        "D10",
        triggered=Decimal(str(overloaded_pm)) >= utilization_threshold,
        priority="high" if Decimal(str(overloaded_pm)) >= utilization_threshold else "low",
        title="Project staffing rebalance",
        summary=f"Top PM workload is {max_pm_projects} active projects (utilization proxy {overloaded_pm:.2f}).",
        recommended_action="Reassign PM staffing to protect delivery quality",
        signal_type="capacity",
        severity="high" if Decimal(str(overloaded_pm)) >= utilization_threshold else "low",
        correlation_key=f"D10:{today.strftime('%Y-%m-%d')}:{max_pm}:{max_pm_projects}",
        recommended_owner=max_pm,
        due_days=3,
        input_snapshot_json={"pm_load": pm_load, "utilization_threshold": str(utilization_threshold)},
    )

    high_performing_pm = max(pm_load.items(), key=lambda item: item[1], default=(None, 0))[0]
    add_eval(
        "D11",
        triggered=today.day <= 5,
        priority="low",
        title="PM promotion slate review",
        summary="Review promotion-ready PM candidates from delivery and client metrics.",
        recommended_action="Approve PM promotion shortlist",
        signal_type="cadence",
        severity="low",
        correlation_key=f"D11:{today.strftime('%Y-%m')}",
        recommended_owner=high_performing_pm,
        due_days=7,
        input_snapshot_json={"pm_load": pm_load},
    )

    pm_intervention_candidates = [pm for pm, count in pm_high_risk.items() if Decimal(count) >= risk_project_threshold]
    add_eval(
        "D12",
        triggered=bool(pm_intervention_candidates),
        priority="high" if len(pm_intervention_candidates) >= 2 else "medium",
        title="PM intervention needed",
        summary=f"{len(pm_intervention_candidates)} PMs have consecutive high-risk project exposure.",
        recommended_action="Assign mentor and intervention plan",
        signal_type="performance_alert",
        severity="high" if len(pm_intervention_candidates) >= 2 else "medium",
        correlation_key=f"D12:{today.strftime('%Y-%m-%d')}:{len(pm_intervention_candidates)}",
        recommended_owner=pm_intervention_candidates[0] if pm_intervention_candidates else None,
        due_days=4,
        input_snapshot_json={"pm_high_risk": pm_high_risk, "risk_project_threshold": str(risk_project_threshold)},
    )

    add_eval(
        "D13",
        triggered=Decimal(str(overloaded_pm)) >= Decimal("0.90"),
        priority="medium" if Decimal(str(overloaded_pm)) >= Decimal("0.90") else "low",
        title="Hiring capacity decision",
        summary="Capacity trend indicates whether incremental hiring is needed.",
        recommended_action="Approve targeted hiring requisitions",
        signal_type="capacity",
        severity="medium" if Decimal(str(overloaded_pm)) >= Decimal("0.90") else "low",
        correlation_key=f"D13:{today.strftime('%Y-%m-%d')}:{overloaded_pm:.2f}",
        due_days=5,
        input_snapshot_json={"pm_load": pm_load, "utilization_proxy": overloaded_pm},
    )

    load_imbalance = max_pm_projects - min_pm_projects
    add_eval(
        "D14",
        triggered=load_imbalance >= 2,
        priority="medium" if load_imbalance >= 2 else "low",
        title="Workload allocation rebalance",
        summary=f"PM workload spread is {load_imbalance} projects between max and min loads.",
        recommended_action="Rebalance projects across PM roster",
        signal_type="capacity",
        severity="medium" if load_imbalance >= 2 else "low",
        correlation_key=f"D14:{today.strftime('%Y-%m-%d')}:{load_imbalance}",
        due_days=3,
        input_snapshot_json={"pm_load": pm_load, "load_imbalance": load_imbalance},
    )

    risk_alert_comms = [row for row in comm_recent if str(row.get("classification") or "") == "risk_alert"]
    add_eval(
        "D15",
        triggered=len(risk_alert_comms) > 0 or len(crm_open) >= 8,
        priority="high" if len(risk_alert_comms) > 0 else "medium",
        title="Executive client engagement plan",
        summary="Client events and account activity indicate need for executive engagement.",
        recommended_action="Schedule executive sponsor touchpoints",
        signal_type="client_event",
        severity="high" if len(risk_alert_comms) > 0 else "medium",
        correlation_key=f"D15:{today.strftime('%Y-%m-%d')}:{len(risk_alert_comms)}:{len(crm_open)}",
        due_days=2,
        input_snapshot_json={"risk_alert_comms": len(risk_alert_comms), "open_opportunities": len(crm_open)},
    )

    add_eval(
        "D16",
        triggered=bool(survey_low) or avg_survey < nps_threshold,
        priority="high" if bool(survey_low) else "low",
        title="Client recovery response",
        summary=f"{len(survey_low)} low-scoring client feedback entries require response planning.",
        recommended_action="Initiate executive client recovery plan",
        signal_type="satisfaction",
        severity="high" if bool(survey_low) else "low",
        correlation_key=f"D16:{today.strftime('%Y-%m-%d')}:{len(survey_low)}",
        due_days=1,
        input_snapshot_json={"low_feedback_count": len(survey_low), "average_low_score": str(avg_survey)},
    )

    add_eval(
        "D17",
        triggered=today.day <= 7,
        priority="medium",
        title="Strategic client investment review",
        summary="Monthly top-tier client investment allocation review.",
        recommended_action="Approve strategic client investment plan",
        signal_type="cadence",
        severity="medium",
        correlation_key=f"D17:{today.strftime('%Y-%m')}",
        due_days=7,
        input_snapshot_json={"pipeline_value_open": str(metrics["crm_pipeline_value_open"])},
    )

    add_eval(
        "D18",
        triggered=total_claim_exposure >= claim_threshold,
        priority="critical" if total_claim_exposure >= (claim_threshold * Decimal("2")) else "high",
        title="Litigation/insurance escalation",
        summary=f"Open claim exposure is ${total_claim_exposure:,.0f} against threshold ${claim_threshold:,.0f}.",
        recommended_action="Engage legal and insurance review",
        risk_score=total_claim_exposure / Decimal("100000"),
        signal_type="claim_exposure",
        severity="critical" if total_claim_exposure >= (claim_threshold * Decimal("2")) else "high",
        correlation_key=f"D18:{today.strftime('%Y-%m-%d')}:{int(total_claim_exposure)}",
        due_days=1,
        input_snapshot_json={"claim_exposure": str(total_claim_exposure), "threshold": str(claim_threshold)},
    )

    add_eval(
        "D19",
        triggered=market_rate >= interest_rate_threshold,
        priority="high" if market_rate >= interest_rate_threshold else "low",
        title="Market risk adjustment",
        summary=f"Interest rate signal is {market_rate} vs threshold {interest_rate_threshold}.",
        recommended_action="Adjust bid aggressiveness and investment pacing",
        signal_type="market",
        severity="high" if market_rate >= interest_rate_threshold else "low",
        correlation_key=f"D19:{today.strftime('%Y-%m-%d')}:{market_rate}",
        due_days=2,
        input_snapshot_json={"market_snapshot": market_snapshot, "interest_rate_threshold": str(interest_rate_threshold)},
    )

    reputation_comms = [
        row
        for row in comm_recent
        if "controvers" in str((row.get("subject") or "") + " " + (row.get("summary_text") or "")).lower()
        or "regulator" in str((row.get("subject") or "") + " " + (row.get("summary_text") or "")).lower()
        or "ethic" in str((row.get("subject") or "") + " " + (row.get("summary_text") or "")).lower()
    ]
    add_eval(
        "D20",
        triggered=bool(reputation_comms),
        priority="high" if reputation_comms else "low",
        title="Reputation risk screen",
        summary=f"{len(reputation_comms)} potential reputational risk communication signals detected.",
        recommended_action="Perform reputational risk review before pursuit",
        signal_type="reputation",
        severity="high" if reputation_comms else "low",
        correlation_key=f"D20:{today.strftime('%Y-%m-%d')}:{len(reputation_comms)}",
        due_days=2,
        input_snapshot_json={"reputation_signal_count": len(reputation_comms)},
    )

    return evaluations


def run_decision_engine(
    *,
    env_id: UUID,
    business_id: UUID,
    actor: str | None = None,
    include_non_triggered: bool = False,
) -> dict:
    evaluations = evaluate_decisions(env_id=env_id, business_id=business_id)

    queued_items: list[dict] = []
    signal_items: list[dict] = []
    triggered_count = 0

    for item in evaluations:
        if not item.triggered and not include_non_triggered:
            continue

        if item.triggered:
            triggered_count += 1

        signal_row = signals.create_or_update_signal(
            env_id=env_id,
            business_id=business_id,
            decision_code=item.decision_code,
            signal_type=item.signal_type,
            severity=item.severity,
            correlation_key=item.correlation_key,
            payload_json={
                "decision_title": item.decision_title,
                "summary": item.summary,
                "risk_score": str(item.risk_score),
                "context": item.context_json,
                "inputs": item.input_snapshot_json,
                "analysis": item.ai_analysis_json,
            },
            project_id=item.project_id,
            source_key="pds_decision_engine",
            actor=actor,
        )
        signal_items.append(signal_row)

        queue_row = queue.upsert_queue_item(
            env_id=env_id,
            business_id=business_id,
            decision_code=item.decision_code,
            title=item.title,
            summary=item.summary,
            priority=item.priority,
            recommended_action=item.recommended_action,
            recommended_owner=item.recommended_owner,
            due_at=item.due_at,
            risk_score=item.risk_score,
            project_id=item.project_id,
            signal_event_id=UUID(str(signal_row["signal_event_id"])) if signal_row and signal_row.get("signal_event_id") else None,
            context_json=item.context_json,
            ai_analysis_json=item.ai_analysis_json,
            input_snapshot_json=item.input_snapshot_json,
            actor=actor,
        )
        queued_items.append(queue_row)

    open_queue = queue.list_queue_items(env_id=env_id, business_id=business_id, status="open", limit=200)

    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "evaluated": len(evaluations),
        "triggered": triggered_count,
        "queue_items_upserted": len(queued_items),
        "signals_upserted": len(signal_items),
        "open_queue_count": len(open_queue),
        "evaluations": [
            {
                "decision_code": e.decision_code,
                "decision_title": e.decision_title,
                "triggered": e.triggered,
                "priority": e.priority,
                "summary": e.summary,
            }
            for e in evaluations
        ],
    }
