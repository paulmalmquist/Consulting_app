"""Draw Variance Detection Engine.

Implements a 4-rule variance detection system for construction draw requests:
  1. Overbill Detection — flags when cumulative draws exceed scheduled value
  2. Burn Rate Check — flags when current period exceeds 120% of average
  3. Overbudget Detection — flags when total completed exceeds revised budget
  4. Percent Deviation — flags when financial % diverges from physical % by >15pp

Follows the exact pattern from pay_app_variance.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ── Types ─────────────────────────────────────────────────────────

class Severity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


@dataclass
class DrawVarianceFlag:
    rule: str
    severity: str
    amount_at_risk: Decimal
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class DrawVarianceResult:
    draw_request_id: str
    draw_number: int
    flags: list[DrawVarianceFlag]
    total_amount_at_risk: Decimal = Decimal("0")
    flag_count_critical: int = 0
    flag_count_warning: int = 0
    flag_count_info: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "draw_request_id": self.draw_request_id,
            "draw_number": self.draw_number,
            "flags": [asdict(f) for f in self.flags],
            "total_amount_at_risk": str(self.total_amount_at_risk),
            "flag_count_critical": self.flag_count_critical,
            "flag_count_warning": self.flag_count_warning,
            "flag_count_info": self.flag_count_info,
        }


# ── Helpers ───────────────────────────────────────────────────────

def _d(val: Any) -> Decimal:
    if val is None:
        return Decimal("0")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pct(part: Decimal, whole: Decimal) -> Decimal:
    if whole <= 0:
        return Decimal("0")
    return (part / whole * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── Rule 1: Overbill Detection ───────────────────────────────────

def _check_overbill(line: dict[str, Any]) -> DrawVarianceFlag | None:
    """Flag when total completed exceeds 90% of scheduled value and current draw
    pushes it further.

    Thresholds:
      90-100%  -> warning
      >100%    -> critical
    """
    scheduled = _d(line.get("scheduled_value"))
    total_completed = _d(line.get("total_completed"))

    if scheduled <= 0:
        return None

    pct = _pct(total_completed, scheduled)

    if pct <= Decimal("90"):
        return None

    overage = max(total_completed - scheduled, Decimal("0"))
    severity = Severity.CRITICAL if pct > Decimal("100") else Severity.WARNING

    return DrawVarianceFlag(
        rule="overbill_detection",
        severity=severity.value,
        amount_at_risk=overage if overage > 0 else _d(line.get("current_draw")),
        message=(
            f"Cost code {line.get('cost_code', '?')}: {pct}% of scheduled value "
            f"(${total_completed:,.2f} / ${scheduled:,.2f}). "
            + (f"Overage: ${overage:,.2f}." if overage > 0 else "Near budget ceiling.")
        ),
        details={
            "cost_code": line.get("cost_code", ""),
            "scheduled_value": str(scheduled),
            "total_completed": str(total_completed),
            "percent_complete": str(pct),
        },
    )


# ── Rule 2: Burn Rate Check ──────────────────────────────────────

def _check_burn_rate(
    line: dict[str, Any], avg_monthly_draw: Decimal,
) -> DrawVarianceFlag | None:
    """Flag when current period draw exceeds 120% of average monthly draw for that line."""
    current = _d(line.get("current_draw"))

    if avg_monthly_draw <= 0 or current <= 0:
        return None

    ratio = _pct(current, avg_monthly_draw)

    if ratio <= Decimal("120"):
        return None

    excess = current - (avg_monthly_draw * Decimal("1.2")).quantize(Decimal("0.01"))
    severity = Severity.CRITICAL if ratio > Decimal("200") else Severity.WARNING

    return DrawVarianceFlag(
        rule="burn_rate_check",
        severity=severity.value,
        amount_at_risk=excess,
        message=(
            f"Cost code {line.get('cost_code', '?')}: current draw ${current:,.2f} is "
            f"{ratio}% of average monthly draw ${avg_monthly_draw:,.2f}. "
            f"Excess above 120% threshold: ${excess:,.2f}."
        ),
        details={
            "cost_code": line.get("cost_code", ""),
            "current_draw": str(current),
            "avg_monthly_draw": str(avg_monthly_draw),
            "ratio_pct": str(ratio),
        },
    )


# ── Rule 3: Overbudget Detection ─────────────────────────────────

def _check_overbudget(line: dict[str, Any]) -> DrawVarianceFlag | None:
    """Flag when total completed (including current draw) exceeds scheduled value."""
    scheduled = _d(line.get("scheduled_value"))
    total_completed = _d(line.get("total_completed"))

    if scheduled <= 0:
        return None

    overrun = total_completed - scheduled
    if overrun <= 0:
        return None

    pct = _pct(overrun, scheduled)
    severity = Severity.CRITICAL if pct > Decimal("5") else Severity.WARNING

    return DrawVarianceFlag(
        rule="overbudget_detection",
        severity=severity.value,
        amount_at_risk=overrun,
        message=(
            f"Cost code {line.get('cost_code', '?')}: cumulative draws "
            f"${total_completed:,.2f} exceed scheduled value ${scheduled:,.2f} "
            f"by ${overrun:,.2f} ({pct}%)."
        ),
        details={
            "cost_code": line.get("cost_code", ""),
            "scheduled_value": str(scheduled),
            "total_completed": str(total_completed),
            "overrun": str(overrun),
            "overrun_pct": str(pct),
        },
    )


# ── Rule 4: Percent Deviation ────────────────────────────────────

def _check_percent_deviation(
    line: dict[str, Any], project_overall_pct: Decimal,
) -> DrawVarianceFlag | None:
    """Flag when a line item's percent complete diverges from the project
    overall percent complete by more than 15 percentage points."""
    line_pct = _d(line.get("percent_complete"))

    if project_overall_pct <= 0:
        return None

    divergence = line_pct - project_overall_pct

    if divergence <= Decimal("15"):
        return None

    severity = Severity.WARNING if divergence <= Decimal("25") else Severity.CRITICAL
    scheduled = _d(line.get("scheduled_value"))
    expected_at_project_pct = (scheduled * project_overall_pct / Decimal("100")).quantize(Decimal("0.01"))
    excess = _d(line.get("total_completed")) - expected_at_project_pct

    return DrawVarianceFlag(
        rule="percent_deviation",
        severity=severity.value,
        amount_at_risk=max(excess, Decimal("0")),
        message=(
            f"Cost code {line.get('cost_code', '?')}: line is {line_pct}% complete "
            f"but project overall is {project_overall_pct}%. "
            f"Divergence of {divergence}pp suggests billing ahead of progress."
        ),
        details={
            "cost_code": line.get("cost_code", ""),
            "line_pct": str(line_pct),
            "project_pct": str(project_overall_pct),
            "divergence_pp": str(divergence),
        },
    )


# ── Orchestrator ──────────────────────────────────────────────────

def analyze_draw_variances(
    *,
    draw_request_id: UUID,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    """Run all 4 variance rules against a draw request's line items."""
    with get_cursor() as cur:
        # Fetch draw request
        cur.execute(
            "SELECT * FROM cp_draw_request WHERE draw_request_id = %s::uuid AND env_id = %s::uuid AND business_id = %s::uuid",
            (str(draw_request_id), str(env_id), str(business_id)),
        )
        draw = cur.fetchone()
        if not draw:
            raise LookupError(f"Draw request {draw_request_id} not found")

        project_id = draw["project_id"]

        # Fetch line items
        cur.execute(
            "SELECT * FROM cp_draw_line_item WHERE draw_request_id = %s::uuid ORDER BY cost_code",
            (str(draw_request_id),),
        )
        line_items = cur.fetchall()

        # Compute average monthly draw per cost code from prior funded draws
        cur.execute(
            """
            SELECT dli.cost_code, AVG(dli.current_draw) AS avg_draw
            FROM cp_draw_line_item dli
            JOIN cp_draw_request dr ON dr.draw_request_id = dli.draw_request_id
            WHERE dr.project_id = %s::uuid AND dr.status = 'funded'
            GROUP BY dli.cost_code
            """,
            (str(project_id),),
        )
        avg_map = {r["cost_code"]: _d(r["avg_draw"]) for r in cur.fetchall()}

        # Project budget for overall pct
        cur.execute(
            "SELECT approved_budget, spent_amount FROM pds_projects WHERE project_id = %s::uuid",
            (str(project_id),),
        )
        proj = cur.fetchone()

    budget = _d(proj.get("approved_budget")) if proj else Decimal("0")
    spent = _d(proj.get("spent_amount")) if proj else Decimal("0")
    project_pct = _pct(spent, budget)

    all_flags: list[dict[str, Any]] = []
    total_at_risk = Decimal("0")
    total_critical = 0
    total_warning = 0
    total_info = 0
    flagged_lines: list[str] = []

    for line in line_items:
        line_flags: list[DrawVarianceFlag] = []

        # Rule 1
        f = _check_overbill(line)
        if f:
            line_flags.append(f)

        # Rule 2
        avg = avg_map.get(line["cost_code"], Decimal("0"))
        f = _check_burn_rate(line, avg)
        if f:
            line_flags.append(f)

        # Rule 3
        f = _check_overbudget(line)
        if f:
            line_flags.append(f)

        # Rule 4
        f = _check_percent_deviation(line, project_pct)
        if f:
            line_flags.append(f)

        if line_flags:
            flagged_lines.append(str(line["line_item_id"]))

        for flag in line_flags:
            total_at_risk += flag.amount_at_risk
            if flag.severity == Severity.CRITICAL.value:
                total_critical += 1
            elif flag.severity == Severity.WARNING.value:
                total_warning += 1
            else:
                total_info += 1

            all_flags.append({
                **asdict(flag),
                "line_item_id": str(line["line_item_id"]),
                "cost_code": line.get("cost_code"),
                "amount_at_risk": str(flag.amount_at_risk),
            })

    # Sort: critical first
    severity_order = {Severity.CRITICAL.value: 0, Severity.WARNING.value: 1, Severity.INFO.value: 2}
    all_flags.sort(key=lambda f: severity_order.get(f["severity"], 9))

    # Update variance flags on flagged line items
    if flagged_lines:
        with get_cursor() as cur:
            for line in line_items:
                lid = str(line["line_item_id"])
                is_flagged = lid in flagged_lines
                reasons = [f["message"] for f in all_flags if f.get("line_item_id") == lid]
                cur.execute(
                    "UPDATE cp_draw_line_item SET variance_flag = %s, variance_reason = %s WHERE line_item_id = %s::uuid",
                    (is_flagged, "; ".join(reasons) if reasons else None, lid),
                )

    return {
        "draw_request_id": str(draw_request_id),
        "draw_number": draw.get("draw_number", 0),
        "total_amount_at_risk": str(total_at_risk),
        "flag_count_critical": total_critical,
        "flag_count_warning": total_warning,
        "flag_count_info": total_info,
        "flags": all_flags,
        "flagged_line_count": len(flagged_lines),
        "total_line_count": len(line_items),
        "rules_applied": [
            "overbill_detection",
            "burn_rate_check",
            "overbudget_detection",
            "percent_deviation",
        ],
    }
