"""Pay Application Variance Detection Engine.

Implements a 4-rule variance detection system for construction pay applications:
  1. Overbill Detection — flags when billed amount exceeds scheduled value
  2. Retainage Calculation Audit — validates retainage math
  3. Percent-Complete Cross-Check — compares billed % to reported physical progress
  4. Cumulative Overrun Detection — flags when cumulative billings exceed budget line

Each rule returns typed flags with severity (critical / warning / info),
the dollar amount at risk, and a plain-English explanation suitable
for display in the Pay App review UI.
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
class VarianceFlag:
    rule: str
    severity: str
    amount_at_risk: Decimal
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class PayAppVarianceResult:
    pay_app_id: str
    pay_app_number: int
    vendor_name: str | None
    contract_number: str | None
    flags: list[VarianceFlag]
    total_amount_at_risk: Decimal = Decimal("0")
    flag_count_critical: int = 0
    flag_count_warning: int = 0
    flag_count_info: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "pay_app_id": self.pay_app_id,
            "pay_app_number": self.pay_app_number,
            "vendor_name": self.vendor_name,
            "contract_number": self.contract_number,
            "flags": [asdict(f) for f in self.flags],
            "total_amount_at_risk": str(self.total_amount_at_risk),
            "flag_count_critical": self.flag_count_critical,
            "flag_count_warning": self.flag_count_warning,
            "flag_count_info": self.flag_count_info,
        }


# ── Helpers ───────────────────────────────────────────────────────

def _d(val: Any) -> Decimal:
    """Safely coerce to Decimal."""
    if val is None:
        return Decimal("0")
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pct(part: Decimal, whole: Decimal) -> Decimal:
    """Percentage as 0–100 value, safe against zero division."""
    if whole <= 0:
        return Decimal("0")
    return (part / whole * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# ── Rule 1: Overbill Detection ───────────────────────────────────

def _check_overbill(pa: dict[str, Any]) -> VarianceFlag | None:
    """Flag when total completed + stored exceeds scheduled (contract) value.

    Thresholds:
      ≤ 100%          → no flag
      100.01% – 105%  → warning (minor overbill, may be rounding)
      > 105%          → critical (significant overbill)
    """
    scheduled = _d(pa.get("scheduled_value"))
    total_completed = _d(pa.get("total_completed_stored"))

    if scheduled <= 0:
        return None

    billed_pct = _pct(total_completed, scheduled)
    overage = total_completed - scheduled

    if overage <= 0:
        return None

    severity = Severity.CRITICAL if billed_pct > Decimal("105") else Severity.WARNING
    return VarianceFlag(
        rule="overbill_detection",
        severity=severity.value,
        amount_at_risk=overage,
        message=(
            f"Pay App #{pa.get('pay_app_number', '?')} billed {billed_pct}% of scheduled value "
            f"(${total_completed:,.2f} vs ${scheduled:,.2f}). "
            f"Overage: ${overage:,.2f}."
        ),
        details={
            "scheduled_value": str(scheduled),
            "total_completed_stored": str(total_completed),
            "billed_pct": str(billed_pct),
            "overage": str(overage),
        },
    )


# ── Rule 2: Retainage Calculation Audit ──────────────────────────

def _check_retainage(pa: dict[str, Any]) -> VarianceFlag | None:
    """Validate retainage amount matches retainage_pct × total_completed_stored.

    Tolerance: $0.02 (rounding).
    """
    total_completed = _d(pa.get("total_completed_stored"))
    ret_pct = _d(pa.get("retainage_pct"))
    ret_amount = _d(pa.get("retainage_amount"))

    if total_completed <= 0 and ret_amount <= 0:
        return None

    expected_ret = (total_completed * ret_pct / Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    discrepancy = abs(ret_amount - expected_ret)

    if discrepancy <= Decimal("0.02"):
        return None

    severity = Severity.CRITICAL if discrepancy > Decimal("1000") else Severity.WARNING
    return VarianceFlag(
        rule="retainage_audit",
        severity=severity.value,
        amount_at_risk=discrepancy,
        message=(
            f"Pay App #{pa.get('pay_app_number', '?')} retainage discrepancy: "
            f"expected ${expected_ret:,.2f} ({ret_pct}% of ${total_completed:,.2f}) "
            f"but recorded ${ret_amount:,.2f}. Difference: ${discrepancy:,.2f}."
        ),
        details={
            "expected_retainage": str(expected_ret),
            "actual_retainage": str(ret_amount),
            "retainage_pct": str(ret_pct),
            "discrepancy": str(discrepancy),
        },
    )


# ── Rule 3: Percent-Complete Cross-Check ─────────────────────────

def _check_percent_complete(
    pa: dict[str, Any],
    budget_spent: Decimal | None = None,
    budget_approved: Decimal | None = None,
) -> VarianceFlag | None:
    """Compare billed % of contract vs % of project budget consumed.

    If the pay app's billed-to-scheduled ratio diverges from the
    project's spent-to-budget ratio by >15pp, flag it. This catches
    vendors billing ahead of actual project progress.
    """
    scheduled = _d(pa.get("scheduled_value"))
    total_completed = _d(pa.get("total_completed_stored"))

    if scheduled <= 0 or budget_approved is None or budget_approved <= 0:
        return None

    billed_pct = _pct(total_completed, scheduled)
    project_pct = _pct(budget_spent or Decimal("0"), budget_approved)

    divergence = billed_pct - project_pct

    if divergence <= Decimal("15"):
        return None

    severity = Severity.WARNING if divergence <= Decimal("25") else Severity.CRITICAL
    amount = total_completed - (scheduled * project_pct / Decimal("100"))
    amount = max(amount, Decimal("0"))

    return VarianceFlag(
        rule="percent_complete_crosscheck",
        severity=severity.value,
        amount_at_risk=amount.quantize(Decimal("0.01")),
        message=(
            f"Pay App #{pa.get('pay_app_number', '?')} billed {billed_pct}% of contract value "
            f"but project is only {project_pct}% spent overall. "
            f"Divergence of {divergence}pp suggests billing ahead of progress."
        ),
        details={
            "billed_pct": str(billed_pct),
            "project_spent_pct": str(project_pct),
            "divergence_pp": str(divergence),
        },
    )


# ── Rule 4: Cumulative Overrun Detection ─────────────────────────

def _check_cumulative_overrun(
    pay_apps: list[dict[str, Any]],
    budget_approved: Decimal | None = None,
) -> VarianceFlag | None:
    """Flag when total cumulative billings across all pay apps for a
    vendor/contract exceed the project's approved budget.

    This catches slow-drip overbilling that individual pay apps don't reveal.
    """
    if not pay_apps or budget_approved is None or budget_approved <= 0:
        return None

    total_billed = sum(_d(pa.get("current_payment_due")) for pa in pay_apps)
    total_billed += sum(_d(pa.get("retainage_amount")) for pa in pay_apps)

    overrun = total_billed - budget_approved

    if overrun <= 0:
        return None

    overrun_pct = _pct(overrun, budget_approved)
    severity = Severity.CRITICAL if overrun_pct > Decimal("5") else Severity.WARNING

    return VarianceFlag(
        rule="cumulative_overrun",
        severity=severity.value,
        amount_at_risk=overrun,
        message=(
            f"Cumulative billings (${total_billed:,.2f}) exceed approved budget "
            f"(${budget_approved:,.2f}) by ${overrun:,.2f} ({overrun_pct}%). "
            f"Review across {len(pay_apps)} pay application(s)."
        ),
        details={
            "cumulative_billed": str(total_billed),
            "approved_budget": str(budget_approved),
            "overrun": str(overrun),
            "overrun_pct": str(overrun_pct),
            "pay_app_count": len(pay_apps),
        },
    )


# ── Orchestrator ──────────────────────────────────────────────────

def analyze_pay_app_variances(
    *,
    project_id: UUID,
    env_id: UUID,
    business_id: UUID,
) -> dict[str, Any]:
    """Run all 4 variance rules against every pay app for a project.

    Returns a summary dict with per-pay-app results, portfolio-level
    totals, and a sorted list of all flags by severity.
    """
    with get_cursor() as cur:
        # Fetch all pay apps for the project with vendor/contract info
        cur.execute(
            """
            SELECT pa.*, v.vendor_name, c.contract_number
            FROM cp_pay_app pa
            LEFT JOIN pds_vendors v ON pa.vendor_id = v.vendor_id
            LEFT JOIN pds_contracts c ON pa.contract_id = c.contract_id
            WHERE pa.project_id = %s::uuid
              AND pa.env_id = %s::uuid
              AND pa.business_id = %s::uuid
            ORDER BY pa.pay_app_number
            """,
            (str(project_id), str(env_id), str(business_id)),
        )
        pay_apps = cur.fetchall()

        # Fetch project budget context
        cur.execute(
            "SELECT approved_budget, spent_amount FROM pds_projects WHERE project_id = %s::uuid",
            (str(project_id),),
        )
        project = cur.fetchone()

    budget_approved = _d(project.get("approved_budget")) if project else None
    budget_spent = _d(project.get("spent_amount")) if project else None

    results: list[PayAppVarianceResult] = []
    all_flags: list[dict[str, Any]] = []
    total_at_risk = Decimal("0")
    total_critical = 0
    total_warning = 0
    total_info = 0

    for pa in pay_apps:
        flags: list[VarianceFlag] = []

        # Rule 1: Overbill
        f = _check_overbill(pa)
        if f:
            flags.append(f)

        # Rule 2: Retainage audit
        f = _check_retainage(pa)
        if f:
            flags.append(f)

        # Rule 3: Percent-complete cross-check
        f = _check_percent_complete(pa, budget_spent=budget_spent, budget_approved=budget_approved)
        if f:
            flags.append(f)

        pa_at_risk = sum(f.amount_at_risk for f in flags)
        pa_critical = sum(1 for f in flags if f.severity == Severity.CRITICAL.value)
        pa_warning = sum(1 for f in flags if f.severity == Severity.WARNING.value)
        pa_info = sum(1 for f in flags if f.severity == Severity.INFO.value)

        result = PayAppVarianceResult(
            pay_app_id=str(pa["pay_app_id"]),
            pay_app_number=pa.get("pay_app_number", 0),
            vendor_name=pa.get("vendor_name"),
            contract_number=pa.get("contract_number"),
            flags=flags,
            total_amount_at_risk=pa_at_risk,
            flag_count_critical=pa_critical,
            flag_count_warning=pa_warning,
            flag_count_info=pa_info,
        )
        results.append(result)

        total_at_risk += pa_at_risk
        total_critical += pa_critical
        total_warning += pa_warning
        total_info += pa_info

        for f in flags:
            all_flags.append({
                **asdict(f),
                "pay_app_id": str(pa["pay_app_id"]),
                "pay_app_number": pa.get("pay_app_number", 0),
                "vendor_name": pa.get("vendor_name"),
                "amount_at_risk": str(f.amount_at_risk),
            })

    # Rule 4: Cumulative overrun (project-level)
    cumulative_flag = _check_cumulative_overrun(pay_apps, budget_approved)
    if cumulative_flag:
        total_at_risk += cumulative_flag.amount_at_risk
        if cumulative_flag.severity == Severity.CRITICAL.value:
            total_critical += 1
        elif cumulative_flag.severity == Severity.WARNING.value:
            total_warning += 1
        else:
            total_info += 1
        all_flags.append({
            **asdict(cumulative_flag),
            "pay_app_id": None,
            "pay_app_number": None,
            "vendor_name": None,
            "amount_at_risk": str(cumulative_flag.amount_at_risk),
        })

    # Sort flags: critical first, then warning, then info
    severity_order = {Severity.CRITICAL.value: 0, Severity.WARNING.value: 1, Severity.INFO.value: 2}
    all_flags.sort(key=lambda f: severity_order.get(f["severity"], 9))

    return {
        "project_id": str(project_id),
        "pay_app_count": len(pay_apps),
        "total_amount_at_risk": str(total_at_risk),
        "flag_count_critical": total_critical,
        "flag_count_warning": total_warning,
        "flag_count_info": total_info,
        "flags": all_flags,
        "pay_apps": [r.to_dict() for r in results],
        "cumulative_overrun": asdict(cumulative_flag) if cumulative_flag else None,
        "rules_applied": [
            "overbill_detection",
            "retainage_audit",
            "percent_complete_crosscheck",
            "cumulative_overrun",
        ],
    }
