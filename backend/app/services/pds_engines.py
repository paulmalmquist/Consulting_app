from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _normalize(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        return format(obj.quantize(Decimal("0.000001")), "f")
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _normalize(v) for k, v in sorted(obj.items(), key=lambda it: it[0])}
    if isinstance(obj, (list, tuple)):
        return [_normalize(v) for v in obj]
    return obj


def _stable_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(_normalize(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class BudgetState:
    approved_budget: Decimal
    revisions_amount: Decimal
    committed: Decimal
    invoiced: Decimal
    paid: Decimal
    forecast_to_complete: Decimal
    eac: Decimal
    variance: Decimal
    contingency_remaining: Decimal
    pending_change_orders: Decimal
    open_change_order_count: int
    pending_approval_count: int
    snapshot_hash: str


def compute_budget_state(
    *,
    period: str,
    project_row: dict[str, Any],
    budget_versions: list[dict[str, Any]],
    revisions: list[dict[str, Any]],
    commitments: list[dict[str, Any]],
    invoices: list[dict[str, Any]],
    payments: list[dict[str, Any]],
    forecasts: list[dict[str, Any]],
    change_orders: list[dict[str, Any]],
) -> BudgetState:
    latest_budget = max(budget_versions, key=lambda row: int(row.get("version_no") or 0), default=None)
    approved_budget = _decimal(latest_budget.get("approved_budget") if latest_budget else project_row.get("approved_budget"))

    revisions_amount = sum(
        (_decimal(r.get("amount_delta")) for r in revisions if r.get("status") in (None, "approved")),
        Decimal("0"),
    )
    committed = sum((_decimal(r.get("amount")) for r in commitments), Decimal("0"))
    invoiced = sum((_decimal(r.get("amount")) for r in invoices), Decimal("0"))
    paid = sum((_decimal(r.get("amount")) for r in payments), Decimal("0"))

    latest_forecast = max(forecasts, key=lambda row: int(row.get("version_no") or 0), default=None)
    forecast_to_complete = _decimal(
        latest_forecast.get("forecast_to_complete") if latest_forecast else max(Decimal("0"), approved_budget + revisions_amount - committed)
    )
    eac = _decimal(latest_forecast.get("eac") if latest_forecast else committed + forecast_to_complete)
    variance = approved_budget + revisions_amount - eac

    contingency_budget = _decimal(project_row.get("contingency_budget"))
    approved_cos = sum(
        (_decimal(row.get("amount_impact")) for row in change_orders if row.get("status") == "approved"),
        Decimal("0"),
    )
    contingency_remaining = contingency_budget - approved_cos

    pending_cos = sum(
        (_decimal(row.get("amount_impact")) for row in change_orders if row.get("status") == "pending"),
        Decimal("0"),
    )
    open_count = sum(1 for row in change_orders if row.get("status") in {"pending", "approved"})
    pending_approvals = sum(1 for row in change_orders if row.get("status") == "pending")

    payload = {
        "period": period,
        "approved_budget": approved_budget,
        "revisions_amount": revisions_amount,
        "committed": committed,
        "invoiced": invoiced,
        "paid": paid,
        "forecast_to_complete": forecast_to_complete,
        "eac": eac,
        "variance": variance,
        "contingency_remaining": contingency_remaining,
        "pending_change_orders": pending_cos,
        "open_change_order_count": open_count,
        "pending_approval_count": pending_approvals,
    }
    return BudgetState(
        approved_budget=approved_budget,
        revisions_amount=revisions_amount,
        committed=committed,
        invoiced=invoiced,
        paid=paid,
        forecast_to_complete=forecast_to_complete,
        eac=eac,
        variance=variance,
        contingency_remaining=contingency_remaining,
        pending_change_orders=pending_cos,
        open_change_order_count=open_count,
        pending_approval_count=pending_approvals,
        snapshot_hash=_stable_hash(payload),
    )


@dataclass(frozen=True)
class ScheduleState:
    milestone_health: str
    total_slip_days: int
    critical_flags: int
    next_milestone_date: date | None
    snapshot_hash: str


def compute_schedule_state(*, period: str, milestones: list[dict[str, Any]]) -> ScheduleState:
    total_slip_days = 0
    critical_flags = 0
    next_milestone_date: date | None = None

    for row in milestones:
        baseline = row.get("baseline_date")
        current = row.get("current_date")
        actual = row.get("actual_date")

        target = actual or current
        if baseline and target:
            baseline_date = baseline if isinstance(baseline, date) else date.fromisoformat(str(baseline))
            target_date = target if isinstance(target, date) else date.fromisoformat(str(target))
            slip = (target_date - baseline_date).days
            if slip > 0:
                total_slip_days += slip

        if row.get("is_critical") and not actual:
            critical_flags += 1

        if current and not actual:
            current_date = current if isinstance(current, date) else date.fromisoformat(str(current))
            if next_milestone_date is None or current_date < next_milestone_date:
                next_milestone_date = current_date

    if total_slip_days <= 0 and critical_flags == 0:
        health = "on_track"
    elif total_slip_days <= 10 and critical_flags <= 1:
        health = "watch"
    else:
        health = "off_track"

    payload = {
        "period": period,
        "total_slip_days": total_slip_days,
        "critical_flags": critical_flags,
        "next_milestone_date": next_milestone_date,
        "health": health,
    }
    return ScheduleState(
        milestone_health=health,
        total_slip_days=total_slip_days,
        critical_flags=critical_flags,
        next_milestone_date=next_milestone_date,
        snapshot_hash=_stable_hash(payload),
    )


@dataclass(frozen=True)
class RiskState:
    expected_exposure: Decimal
    expected_impact_days: Decimal
    top_risk_count: int
    snapshot_hash: str


def compute_risk_state(*, period: str, risks: list[dict[str, Any]]) -> RiskState:
    expected_exposure = Decimal("0")
    expected_days = Decimal("0")
    top_risk_count = 0

    for row in risks:
        if row.get("status") not in (None, "open", "mitigating"):
            continue
        probability = _decimal(row.get("probability"))
        impact_amount = _decimal(row.get("impact_amount"))
        impact_days = _decimal(row.get("impact_days"))
        expected_exposure += probability * impact_amount
        expected_days += probability * impact_days
        if impact_amount >= Decimal("100000") or impact_days >= Decimal("30"):
            top_risk_count += 1

    payload = {
        "period": period,
        "expected_exposure": expected_exposure,
        "expected_impact_days": expected_days,
        "top_risk_count": top_risk_count,
    }
    return RiskState(
        expected_exposure=expected_exposure,
        expected_impact_days=expected_days,
        top_risk_count=top_risk_count,
        snapshot_hash=_stable_hash(payload),
    )


@dataclass(frozen=True)
class VendorScoreState:
    vendor_name: str
    vendor_score: Decimal
    on_time_rate: Decimal
    punch_speed_score: Decimal
    dispute_count: int
    snapshot_hash: str


def compute_vendor_scores(
    *,
    period: str,
    survey_responses: list[dict[str, Any]],
    punch_items: list[dict[str, Any]],
    disputes: list[dict[str, Any]] | None = None,
) -> list[VendorScoreState]:
    by_vendor: dict[str, dict[str, Any]] = {}

    for row in survey_responses:
        vendor = (row.get("vendor_name") or "Unknown Vendor").strip() or "Unknown Vendor"
        payload = by_vendor.setdefault(vendor, {"scores": [], "on_time": [], "punch": []})
        if row.get("score") is not None:
            payload["scores"].append(_decimal(row.get("score")))

        raw_responses = row.get("responses_json") or {}
        if isinstance(raw_responses, dict):
            on_time_val = raw_responses.get("on_time")
            if on_time_val is not None:
                payload["on_time"].append(_decimal(on_time_val))
            punch_val = raw_responses.get("punch_speed")
            if punch_val is not None:
                payload["punch"].append(_decimal(punch_val))

    for row in punch_items:
        vendor = (row.get("metadata_json") or {}).get("vendor_name") if isinstance(row.get("metadata_json"), dict) else None
        if not vendor:
            continue
        payload = by_vendor.setdefault(vendor, {"scores": [], "on_time": [], "punch": []})
        if row.get("status") == "closed":
            payload["punch"].append(Decimal("1"))
        else:
            payload["punch"].append(Decimal("0.5"))

    dispute_counts: dict[str, int] = {}
    for row in disputes or []:
        vendor = (row.get("vendor_name") or "Unknown Vendor").strip() or "Unknown Vendor"
        dispute_counts[vendor] = dispute_counts.get(vendor, 0) + 1

    states: list[VendorScoreState] = []
    for vendor_name, metrics in sorted(by_vendor.items(), key=lambda item: item[0]):
        scores = metrics["scores"]
        on_time = metrics["on_time"]
        punch = metrics["punch"]

        avg_score = sum(scores, Decimal("0")) / Decimal(len(scores)) if scores else Decimal("3")
        on_time_rate = sum(on_time, Decimal("0")) / Decimal(len(on_time)) if on_time else Decimal("0.9")
        punch_speed = sum(punch, Decimal("0")) / Decimal(len(punch)) if punch else Decimal("0.75")
        disputes_count = dispute_counts.get(vendor_name, 0)

        vendor_score = (avg_score / Decimal("5")) * Decimal("0.5") + on_time_rate * Decimal("0.3") + punch_speed * Decimal("0.2")
        vendor_score = max(Decimal("0"), min(Decimal("1"), vendor_score))

        payload = {
            "period": period,
            "vendor_name": vendor_name,
            "vendor_score": vendor_score,
            "on_time_rate": on_time_rate,
            "punch_speed_score": punch_speed,
            "dispute_count": disputes_count,
        }

        states.append(
            VendorScoreState(
                vendor_name=vendor_name,
                vendor_score=vendor_score,
                on_time_rate=on_time_rate,
                punch_speed_score=punch_speed,
                dispute_count=disputes_count,
                snapshot_hash=_stable_hash(payload),
            )
        )

    return states


@dataclass(frozen=True)
class ReportingAssembly:
    deterministic_deltas: dict[str, Any]
    artifact_refs: list[dict[str, Any]]
    narrative: str
    snapshot_hash: str


def assemble_reporting_pack(
    *,
    period: str,
    portfolio_snapshot: dict[str, Any],
    schedule_snapshot: dict[str, Any],
    risk_snapshot: dict[str, Any],
    prior_portfolio_snapshot: dict[str, Any] | None = None,
) -> ReportingAssembly:
    current_eac = _decimal(portfolio_snapshot.get("eac"))
    prior_eac = _decimal(prior_portfolio_snapshot.get("eac") if prior_portfolio_snapshot else 0)
    eac_delta = current_eac - prior_eac

    current_variance = _decimal(portfolio_snapshot.get("variance"))
    prior_variance = _decimal(prior_portfolio_snapshot.get("variance") if prior_portfolio_snapshot else 0)
    variance_delta = current_variance - prior_variance

    deltas = {
        "period": period,
        "eac_delta": str(eac_delta),
        "variance_delta": str(variance_delta),
        "total_slip_days": int(schedule_snapshot.get("total_slip_days") or 0),
        "critical_flags": int(schedule_snapshot.get("critical_flags") or 0),
        "expected_exposure": str(_decimal(risk_snapshot.get("expected_exposure"))),
        "top_risk_count": int(risk_snapshot.get("top_risk_count") or 0),
    }

    narrative = (
        f"Period {period}: EAC moved by {eac_delta:.2f}, variance moved by {variance_delta:.2f}. "
        f"Schedule health={schedule_snapshot.get('milestone_health')}, slip_days={schedule_snapshot.get('total_slip_days')}. "
        f"Risk expected exposure={_decimal(risk_snapshot.get('expected_exposure')):.2f} across "
        f"{risk_snapshot.get('top_risk_count')} top risks."
    )

    artifact_refs = [
        {"artifact_type": "portfolio_snapshot", "period": period, "snapshot_hash": portfolio_snapshot.get("snapshot_hash")},
        {"artifact_type": "schedule_snapshot", "period": period, "snapshot_hash": schedule_snapshot.get("snapshot_hash")},
        {"artifact_type": "risk_snapshot", "period": period, "snapshot_hash": risk_snapshot.get("snapshot_hash")},
    ]

    snapshot_hash = _stable_hash(
        {
            "period": period,
            "deltas": deltas,
            "artifacts": artifact_refs,
            "narrative": narrative,
        }
    )
    return ReportingAssembly(
        deterministic_deltas=deltas,
        artifact_refs=artifact_refs,
        narrative=narrative,
        snapshot_hash=snapshot_hash,
    )
