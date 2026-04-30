"""Phase 4 — Fund expense layer.

Deterministic, audit-grade composition of fund-level expense cash flows.

Inputs (all read-only):
    - ``repe_fund_term`` — canonical management fee rate, basis, effective range.
    - ``re_fee_policy``  — supplemental policy with optional stepdown_rate.
    - ``re_partner_commitment`` — committed-capital basis source.
    - ``re_cash_event``  — called-capital basis source (event_type='CALL').
    - ``re_fund_quarter_state`` — NAV basis source.
    - ``re_fund_expense_qtr`` — manual / imported expense rows
      (admin, audit, legal, tax, financing, organizational, other).

Outputs:
    - ``FundExpenseLine``     — one structured line per ``(quarter, expense_type)``
      with full provenance: source_table, source_id, formula key, amount, basis,
      and an optional ``null_reason``. No silent zero substitutions.
    - ``FundExpenseSchedule`` — aggregate across the fund's lifetime up to
      as_of_quarter, with per-quarter ``CFPoint`` cash flows (signed negative
      because they reduce LP cash) and a top-level ``null_reasons`` dict that
      fails closed when any **required** input is missing.

Fail-closed contract:
    - Required inputs (always): an active ``repe_fund_term`` for every quarter
      in the fund's lifetime up to as_of_quarter that overlaps with the term's
      effective_from / effective_to range.
    - Required inputs (basis-dependent):
        * ``COMMITTED`` basis → at least one ``re_partner_commitment`` with status='active'.
        * ``CALLED``    basis → at least one ``re_cash_event`` (CALL) by quarter end.
        * ``NAV``       basis → ``re_fund_quarter_state.portfolio_nav`` for the quarter.
    - When any required input is missing, the corresponding line carries a
      ``null_reason`` and the schedule's top-level ``null_reasons`` dict is
      populated. The amount is left as ``None``, never zero. Callers must
      either skip the missing line or fail closed downstream.

Naming note: management_fee is its own line type (kind='management_fee').
Other fund-level expenses come from ``re_fund_expense_qtr.expense_type``,
which is one of:
    fund_admin, audit, legal, tax, financing, organizational, other_fund_expense
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from app.db import get_cursor
from app.services.bottom_up_cashflow import (
    CFPoint,
    _quarters_between,
    quarter_end_date,
)


# Recognized expense kinds. management_fee is computed; the rest read from
# re_fund_expense_qtr.expense_type. unknown_type values land in 'other' with
# a warning so we never lose a row.
ExpenseKind = Literal[
    "management_fee",
    "fund_admin",
    "audit",
    "legal",
    "tax",
    "financing",
    "organizational",
    "other_fund_expense",
]

KNOWN_EXPENSE_TYPES: tuple[str, ...] = (
    "fund_admin",
    "audit",
    "legal",
    "tax",
    "financing",
    "organizational",
    "other_fund_expense",
)
# Aliases the seed actually uses (admin → fund_admin, etc).
EXPENSE_TYPE_ALIASES: dict[str, str] = {
    "admin": "fund_admin",
    "fund_admin": "fund_admin",
    "audit": "audit",
    "legal": "legal",
    "tax": "tax",
    "financing": "financing",
    "organizational": "organizational",
    "org_costs": "organizational",
    "other": "other_fund_expense",
    "other_fund_expense": "other_fund_expense",
}

FEE_BASIS_VALUES = ("COMMITTED", "CALLED", "NAV")
FEE_BASIS_ALIASES = {
    "committed": "COMMITTED",
    "called": "CALLED",
    "invested": "CALLED",  # treat 'invested' as called-capital basis
    "nav": "NAV",
    "fair_value": "NAV",
}


@dataclass(frozen=False)
class FundExpenseLine:
    """One structured expense line with full provenance."""

    fund_id: UUID
    quarter: str
    quarter_end_date: date
    kind: str
    amount: Decimal | None
    currency: str
    source_table: str
    source_id: str | None
    formula_key: str
    basis: str | None  # 'committed' | 'called' | 'nav' | None for non-fee
    basis_amount: Decimal | None
    rate: Decimal | None
    null_reason: str | None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fund_id": str(self.fund_id),
            "quarter": self.quarter,
            "quarter_end_date": self.quarter_end_date.isoformat(),
            "kind": self.kind,
            "amount": float(self.amount) if self.amount is not None else None,
            "currency": self.currency,
            "source_table": self.source_table,
            "source_id": self.source_id,
            "formula_key": self.formula_key,
            "basis": self.basis,
            "basis_amount": float(self.basis_amount) if self.basis_amount is not None else None,
            "rate": float(self.rate) if self.rate is not None else None,
            "null_reason": self.null_reason,
            "warnings": list(self.warnings),
        }


@dataclass
class FundExpenseSchedule:
    """Aggregate expense schedule for a fund up to ``as_of_quarter``.

    ``cf_points`` is a list of signed-negative ``CFPoint`` (one per quarter
    that has any expense activity) ready to merge into the fund's pre-waterfall
    cash flow series.

    ``null_reasons`` is structured: each key names which downstream metric
    cannot be computed because of the missing input. Callers reading this
    schedule check ``has_blocking_nulls`` before using the totals.
    """

    fund_id: UUID
    as_of_quarter: str
    lines: list[FundExpenseLine]
    cf_points: list[CFPoint]
    total_management_fees: Decimal | None
    total_other_expenses: Decimal | None
    expenses_by_type: dict[str, Decimal]
    null_reasons: dict[str, str]
    expense_cf_hash: str
    schedule_contract_version: str = "v1"

    @property
    def has_blocking_nulls(self) -> bool:
        return any(
            v is not None
            for k, v in self.null_reasons.items()
            if k in ("fund_expense_layer", "management_fee", "fund_term")
        )

    @property
    def total_expenses(self) -> Decimal | None:
        if self.total_management_fees is None or self.total_other_expenses is None:
            return None
        return self.total_management_fees + self.total_other_expenses

    def to_dict(self) -> dict[str, Any]:
        return {
            "fund_id": str(self.fund_id),
            "as_of_quarter": self.as_of_quarter,
            "schedule_contract_version": self.schedule_contract_version,
            "expense_cf_hash": self.expense_cf_hash,
            "total_management_fees": (
                float(self.total_management_fees)
                if self.total_management_fees is not None
                else None
            ),
            "total_other_expenses": (
                float(self.total_other_expenses)
                if self.total_other_expenses is not None
                else None
            ),
            "total_expenses": (
                float(self.total_expenses) if self.total_expenses is not None else None
            ),
            "expenses_by_type": {k: float(v) for k, v in self.expenses_by_type.items()},
            "null_reasons": dict(self.null_reasons),
            "lines": [ln.to_dict() for ln in self.lines],
        }


# ---------------------------------------------------------------------------
# Lifetime quarter discovery
# ---------------------------------------------------------------------------


def _fund_inception_quarter(cur, fund_id: UUID) -> str | None:
    """Pick the inception quarter for the fund expense schedule.

    Priority:
      1. earliest ``repe_fund_term.effective_from`` (canonical fund-term start)
      2. earliest ``re_partner_commitment.commitment_date``
      3. earliest ``re_cash_event.event_date``

    The fund-term effective_from wins when present because it represents the
    period during which fund-level fees and expenses can accrue. Quarters
    that predate the term are not part of the fee-accrual window — operating
    cash events from before the term are typically pre-fund pipeline activity
    that the seed assigned to this fund.

    Returns a quarter label like ``'2024-Q1'`` (matches ``quarter_end_date``
    format), or None if no source has any data.
    """
    cur.execute(
        "SELECT MIN(effective_from) AS d FROM repe_fund_term WHERE fund_id = %s",
        (str(fund_id),),
    )
    row = cur.fetchone()
    if row and row.get("d"):
        d: date = row["d"]
        return f"{d.year}-Q{((d.month - 1) // 3) + 1}"

    cur.execute(
        """
        SELECT MIN(d) AS d FROM (
            SELECT commitment_date AS d FROM re_partner_commitment WHERE fund_id = %s
            UNION ALL
            SELECT event_date AS d FROM re_cash_event WHERE fund_id = %s
        ) t
        """,
        (str(fund_id), str(fund_id)),
    )
    row = cur.fetchone()
    if not row or not row.get("d"):
        return None
    d = row["d"]
    return f"{d.year}-Q{((d.month - 1) // 3) + 1}"


# ---------------------------------------------------------------------------
# Management fee resolution
# ---------------------------------------------------------------------------


def _load_active_fund_term(cur, fund_id: UUID, as_of: date) -> dict | None:
    """Load the active fund term for a quarter end."""
    cur.execute(
        """
        SELECT fund_term_id, effective_from, effective_to,
               management_fee_rate, management_fee_basis,
               preferred_return_rate, carry_rate,
               waterfall_style, catch_up_style
        FROM repe_fund_term
        WHERE fund_id = %s
          AND effective_from <= %s
          AND (effective_to IS NULL OR effective_to >= %s)
        ORDER BY effective_from DESC
        LIMIT 1
        """,
        (str(fund_id), as_of, as_of),
    )
    return cur.fetchone()


def _load_fee_policy(cur, fund_id: UUID, as_of: date) -> dict | None:
    """Load the most recent applicable re_fee_policy row.

    Priority: latest start_date <= as_of. Returns None if no policy.
    Note: the seed has duplicate policies for IGF VII; we trust the first
    one returned (most recent start_date, then any tiebreak).
    """
    cur.execute(
        """
        SELECT id, fee_basis, annual_rate,
               start_date, stepdown_date, stepdown_rate
        FROM re_fee_policy
        WHERE fund_id = %s
          AND start_date <= %s
          AND fee_basis IS NOT NULL
          AND annual_rate IS NOT NULL
        ORDER BY start_date DESC
        LIMIT 1
        """,
        (str(fund_id), as_of),
    )
    return cur.fetchone()


def _resolve_basis_amount(
    cur,
    *,
    fund_id: UUID,
    env_id: str,
    business_id: UUID | str,
    as_of: date,
    quarter: str,
    basis: str,
) -> tuple[Decimal | None, str | None]:
    """Return (basis_amount, null_reason). Never silently substitutes 0."""
    if basis == "COMMITTED":
        cur.execute(
            """
            SELECT COALESCE(SUM(committed_amount), 0) AS total,
                   COUNT(*) AS n
            FROM re_partner_commitment
            WHERE fund_id = %s AND status = 'active'
              AND commitment_date <= %s
            """,
            (str(fund_id), as_of),
        )
        row = cur.fetchone()
        if not row or row["n"] == 0:
            return None, "missing_committed_basis_no_partner_commitments"
        total = Decimal(str(row["total"]))
        if total <= 0:
            return None, "missing_committed_basis_zero_total"
        return total, None

    if basis == "CALLED":
        cur.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
            FROM re_cash_event
            WHERE fund_id = %s AND event_type = 'CALL'
              AND event_date <= %s
            """,
            (str(fund_id), as_of),
        )
        row = cur.fetchone()
        if not row or row["n"] == 0:
            return None, "missing_called_basis_no_capital_calls"
        total = Decimal(str(row["total"]))
        if total <= 0:
            return None, "missing_called_basis_zero_total"
        return total, None

    if basis == "NAV":
        cur.execute(
            """
            SELECT portfolio_nav
            FROM re_fund_quarter_state
            WHERE fund_id = %s AND quarter = %s AND scenario_id IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (str(fund_id), quarter),
        )
        row = cur.fetchone()
        if not row or row.get("portfolio_nav") is None:
            return None, "missing_nav_basis_no_quarter_state"
        nav = Decimal(str(row["portfolio_nav"]))
        if nav <= 0:
            return None, "missing_nav_basis_zero_or_negative"
        return nav, None

    return None, f"unknown_basis_{basis}"


def _normalize_basis(raw: str | None) -> str | None:
    if not raw:
        return None
    return FEE_BASIS_ALIASES.get(raw.strip().lower())


def _build_management_fee_line(
    cur,
    *,
    fund_id: UUID,
    env_id: str,
    business_id: UUID | str,
    quarter: str,
    as_of: date,
) -> FundExpenseLine:
    """Build a structured management fee line for one quarter, fail-closed.

    Returns a line with amount=None and a null_reason rather than a fake zero
    when any required input is missing.
    """
    qend = quarter_end_date(quarter)

    term = _load_active_fund_term(cur, fund_id, as_of)
    if not term:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=None,
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=None,
            basis_amount=None,
            rate=None,
            null_reason="missing_fund_term",
        )

    raw_basis = term.get("management_fee_basis")
    basis = _normalize_basis(raw_basis)
    if not basis:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=str(term["fund_term_id"]),
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=raw_basis,
            basis_amount=None,
            rate=None,
            null_reason=f"unknown_fee_basis_{raw_basis!r}",
        )

    annual_rate = term.get("management_fee_rate")
    if annual_rate is None:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=str(term["fund_term_id"]),
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=basis.lower(),
            basis_amount=None,
            rate=None,
            null_reason="missing_management_fee_rate",
        )

    annual_rate = Decimal(str(annual_rate))
    rate_source = "repe_fund_term"

    # Apply step-down if a re_fee_policy.stepdown_date has passed.
    policy = _load_fee_policy(cur, fund_id, as_of)
    if policy and policy.get("stepdown_date") and policy.get("stepdown_rate") is not None:
        if as_of >= policy["stepdown_date"]:
            annual_rate = Decimal(str(policy["stepdown_rate"]))
            rate_source = "re_fee_policy_stepdown"

    # Effective-date check: fee_term effective_from / effective_to must cover qend.
    eff_from = term.get("effective_from")
    eff_to = term.get("effective_to")
    if eff_from and qend < eff_from:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=str(term["fund_term_id"]),
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=basis.lower(),
            basis_amount=None,
            rate=float(annual_rate),
            null_reason="quarter_predates_fund_term_effective_from",
        )
    if eff_to and qend > eff_to:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=str(term["fund_term_id"]),
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=basis.lower(),
            basis_amount=None,
            rate=float(annual_rate),
            null_reason="quarter_after_fund_term_effective_to",
        )

    basis_amount, basis_null = _resolve_basis_amount(
        cur,
        fund_id=fund_id,
        env_id=env_id,
        business_id=business_id,
        as_of=as_of,
        quarter=quarter,
        basis=basis,
    )
    if basis_null:
        return FundExpenseLine(
            fund_id=fund_id,
            quarter=quarter,
            quarter_end_date=qend,
            kind="management_fee",
            amount=None,
            currency="USD",
            source_table="repe_fund_term",
            source_id=str(term["fund_term_id"]),
            formula_key="mgmt_fee = basis_amount * annual_rate / 4",
            basis=basis.lower(),
            basis_amount=None,
            rate=float(annual_rate),
            null_reason=basis_null,
        )

    fee = (basis_amount * annual_rate / Decimal("4")).quantize(Decimal("0.01"))
    return FundExpenseLine(
        fund_id=fund_id,
        quarter=quarter,
        quarter_end_date=qend,
        kind="management_fee",
        amount=fee,
        currency="USD",
        source_table="repe_fund_term",
        source_id=str(term["fund_term_id"]),
        formula_key=f"mgmt_fee = basis_amount * annual_rate / 4 [rate_source={rate_source}]",
        basis=basis.lower(),
        basis_amount=basis_amount,
        rate=float(annual_rate),
        null_reason=None,
    )


# ---------------------------------------------------------------------------
# Other-expense lines (admin / audit / legal / tax / financing / org / other)
# ---------------------------------------------------------------------------


def _build_other_expense_lines(
    cur, *, fund_id: UUID, as_of_quarter: str
) -> list[FundExpenseLine]:
    """Read re_fund_expense_qtr rows and project them into structured lines."""
    cur.execute(
        """
        SELECT id, quarter, expense_type, amount, currency
        FROM re_fund_expense_qtr
        WHERE fund_id = %s
          AND quarter <= %s
        ORDER BY quarter, expense_type
        """,
        (str(fund_id), as_of_quarter),
    )
    rows = cur.fetchall() or []
    out: list[FundExpenseLine] = []
    for r in rows:
        kind_raw = r.get("expense_type")
        normalized = (
            EXPENSE_TYPE_ALIASES.get((kind_raw or "").strip().lower())
            if kind_raw
            else None
        )
        warnings: list[str] = []
        if not kind_raw:
            normalized = "other_fund_expense"
            warnings.append("expense_type_null_classified_as_other")
        elif not normalized:
            normalized = "other_fund_expense"
            warnings.append(f"unknown_expense_type_{kind_raw!r}_classified_as_other")

        amount_raw = r.get("amount")
        if amount_raw is None:
            line = FundExpenseLine(
                fund_id=fund_id,
                quarter=r["quarter"],
                quarter_end_date=quarter_end_date(r["quarter"]),
                kind=normalized,
                amount=None,
                currency=r.get("currency") or "USD",
                source_table="re_fund_expense_qtr",
                source_id=str(r["id"]),
                formula_key="explicit_row",
                basis=None,
                basis_amount=None,
                rate=None,
                null_reason="missing_expense_amount",
                warnings=warnings,
            )
        else:
            line = FundExpenseLine(
                fund_id=fund_id,
                quarter=r["quarter"],
                quarter_end_date=quarter_end_date(r["quarter"]),
                kind=normalized,
                amount=Decimal(str(amount_raw)).quantize(Decimal("0.01")),
                currency=r.get("currency") or "USD",
                source_table="re_fund_expense_qtr",
                source_id=str(r["id"]),
                formula_key="explicit_row",
                basis=None,
                basis_amount=None,
                rate=None,
                null_reason=None,
                warnings=warnings,
            )
        out.append(line)
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_fund_expense_schedule(
    fund_id: UUID,
    as_of_quarter: str,
    *,
    env_id: str | None = None,
    business_id: UUID | str | None = None,
) -> FundExpenseSchedule:
    """Compose the fund's expense schedule from inception to as_of_quarter.

    The schedule has one management_fee line per quarter (whether computed or
    null with reason) plus one row per non-fee expense from re_fund_expense_qtr.
    Quarters with no expense activity at all produce no CFPoint — only quarters
    with at least one resolved (non-null) expense amount produce one.

    The returned schedule's ``null_reasons`` is structured so the snapshot
    composer can route it into the right top-level key:
      - ``fund_term``: no active term exists for any covered quarter.
      - ``management_fee``: at least one quarter has a null mgmt_fee line.
      - ``fund_expense_layer``: a critical missing input that blocks net.
    """
    with get_cursor() as cur:
        # Resolve env/business if not provided.
        if business_id is None:
            cur.execute(
                "SELECT business_id FROM repe_fund WHERE fund_id = %s",
                (str(fund_id),),
            )
            row = cur.fetchone()
            if row:
                business_id = row["business_id"]
        if env_id is None and business_id is not None:
            cur.execute(
                "SELECT env_id FROM app.env_business_bindings WHERE business_id = %s LIMIT 1",
                (str(business_id),),
            )
            row = cur.fetchone()
            if row:
                env_id = row["env_id"]

        inception = _fund_inception_quarter(cur, fund_id)
        quarters: list[str] = []
        if inception:
            try:
                quarters = _quarters_between(inception, as_of_quarter)
            except Exception:
                quarters = [as_of_quarter]
        if not quarters:
            quarters = [as_of_quarter]

        mgmt_lines: list[FundExpenseLine] = []
        for q in quarters:
            qend = quarter_end_date(q)
            mgmt_lines.append(
                _build_management_fee_line(
                    cur,
                    fund_id=fund_id,
                    env_id=env_id or "",
                    business_id=business_id or "",
                    quarter=q,
                    as_of=qend,
                )
            )

        other_lines = _build_other_expense_lines(
            cur, fund_id=fund_id, as_of_quarter=as_of_quarter
        )

    all_lines = mgmt_lines + other_lines
    null_reasons: dict[str, str] = {}

    # Top-level fail-closed routing. Pre-term quarters and post-term quarters
    # are NOT blocking — they're informational nulls (fund didn't exist yet
    # / fund has wound down). Only in-term mgmt_fee nulls block net metrics.
    in_term_mgmt = [
        ln for ln in mgmt_lines
        if ln.null_reason
        not in (
            None,
            "quarter_predates_fund_term_effective_from",
            "quarter_after_fund_term_effective_to",
        )
    ]
    in_term_mgmt_total = [
        ln for ln in mgmt_lines
        if ln.null_reason
        not in (
            "quarter_predates_fund_term_effective_from",
            "quarter_after_fund_term_effective_to",
        )
    ]
    if not in_term_mgmt_total:
        null_reasons["fund_term"] = "no_in_term_quarters_in_window"
        null_reasons["fund_expense_layer"] = "no_in_term_quarters_in_window"
    elif in_term_mgmt and all(
        ln.null_reason == "missing_fund_term" for ln in in_term_mgmt_total
    ):
        # All in-term quarters had no fund_term row — escalate to fund_term level.
        null_reasons["fund_term"] = "missing_fund_term_for_all_in_term_quarters"
        null_reasons["fund_expense_layer"] = "missing_fund_term"
    elif in_term_mgmt:
        null_reasons["management_fee"] = "partial_management_fee_nulls_in_term"

    if not other_lines:
        # No expense rows at all is a hard fail-closed — the user said
        # "missing expense assumptions block net metrics."
        null_reasons["fund_expense_layer"] = (
            null_reasons.get("fund_expense_layer")
            or "no_other_expense_rows_in_re_fund_expense_qtr"
        )
    elif any(ln.null_reason for ln in other_lines):
        null_reasons.setdefault(
            "other_expenses",
            "partial_other_expense_nulls",
        )

    # Aggregates: total_management_fees is None ONLY when an in-term null
    # exists. Pre-term / post-term nulls are expected (fund didn't exist
    # then) and should not poison the total.
    mgmt_amounts = [ln.amount for ln in mgmt_lines if ln.amount is not None]
    mgmt_has_in_term_null = any(
        ln.null_reason
        not in (
            None,
            "quarter_predates_fund_term_effective_from",
            "quarter_after_fund_term_effective_to",
        )
        for ln in mgmt_lines
    )
    total_mgmt: Decimal | None = (
        sum(mgmt_amounts, Decimal("0"))
        if mgmt_amounts and not mgmt_has_in_term_null
        else None
    )

    other_amounts = [ln.amount for ln in other_lines if ln.amount is not None]
    other_has_null = any(ln.null_reason for ln in other_lines)
    total_other: Decimal | None = (
        sum(other_amounts, Decimal("0")) if other_amounts and not other_has_null else None
    )

    # If no other_lines at all, total_other is None (hard fail-closed).
    if not other_lines:
        total_other = None

    by_type: dict[str, Decimal] = {}
    for ln in all_lines:
        if ln.amount is not None:
            by_type[ln.kind] = by_type.get(ln.kind, Decimal("0")) + ln.amount

    # Build CF points from every resolved line. Sign-flipped negative.
    points_by_q: dict[str, CFPoint] = {}
    for ln in all_lines:
        if ln.amount is None:
            continue
        amt_neg = -ln.amount
        if ln.quarter not in points_by_q:
            points_by_q[ln.quarter] = CFPoint(
                quarter=ln.quarter,
                quarter_end_date=ln.quarter_end_date,
                amount=Decimal("0"),
                component_breakdown={"fund_expense": []},
                has_actual=True,
            )
        p = points_by_q[ln.quarter]
        p.amount += amt_neg
        comps = p.component_breakdown.setdefault("fund_expense", [])
        comps.append(
            {
                "kind": ln.kind,
                "amount": float(amt_neg),
                "source_table": ln.source_table,
                "source_id": ln.source_id,
                "formula_key": ln.formula_key,
            }
        )

    cf_points = sorted(points_by_q.values(), key=lambda p: p.quarter_end_date)

    # Deterministic hash over the resolved (non-null) line set.
    h = hashlib.sha256()
    for ln in sorted(all_lines, key=lambda x: (x.quarter, x.kind, x.source_id or "")):
        if ln.amount is None:
            h.update(f"{ln.quarter}|{ln.kind}|null|{ln.null_reason}|".encode())
        else:
            h.update(
                f"{ln.quarter}|{ln.kind}|{ln.amount}|{ln.source_id or ''}|".encode()
            )

    return FundExpenseSchedule(
        fund_id=fund_id,
        as_of_quarter=as_of_quarter,
        lines=all_lines,
        cf_points=cf_points,
        total_management_fees=total_mgmt,
        total_other_expenses=total_other,
        expenses_by_type=by_type,
        null_reasons=null_reasons,
        expense_cf_hash=f"sha256:{h.hexdigest()}",
    )


# ---------------------------------------------------------------------------
# Pre-waterfall composition
# ---------------------------------------------------------------------------


def compose_pre_waterfall_cf(
    *,
    fund_gross_cf: list[CFPoint],
    expense_schedule: FundExpenseSchedule,
) -> tuple[list[CFPoint], dict[str, Any]]:
    """Merge fund_gross_cf and expense CF into fund_pre_waterfall_net_cf.

    Returns ``(merged_cf, summary)``. The summary carries identity check data
    so the snapshot composer can record:
        sum(merged) == sum(fund_gross_cf) + sum(expense_schedule.cf_points)
    The expense_schedule's ``null_reasons`` are propagated in the summary.
    """
    by_q: dict[str, CFPoint] = {}

    def _add(p: CFPoint, source_label: str) -> None:
        key = p.quarter_end_date.isoformat()
        if key not in by_q:
            by_q[key] = CFPoint(
                quarter=p.quarter,
                quarter_end_date=p.quarter_end_date,
                amount=Decimal("0"),
                component_breakdown={},
                has_actual=p.has_actual,
                has_projection=p.has_projection,
                has_exit=p.has_exit,
                has_terminal_value=p.has_terminal_value,
                warnings=[],
            )
        target = by_q[key]
        target.amount += p.amount
        target.has_actual = target.has_actual or p.has_actual
        target.has_projection = target.has_projection or p.has_projection
        target.has_exit = target.has_exit or p.has_exit
        target.has_terminal_value = target.has_terminal_value or p.has_terminal_value
        for w in p.warnings:
            if w not in target.warnings:
                target.warnings.append(w)
        # Carry component breakdown by source.
        target.component_breakdown.setdefault(source_label, []).append(
            {
                "amount": float(p.amount),
                "components": p.component_breakdown,
            }
        )

    for p in fund_gross_cf:
        _add(p, "asset_rollup")
    for p in expense_schedule.cf_points:
        _add(p, "fund_expense")

    merged = sorted(by_q.values(), key=lambda p: p.quarter_end_date)

    sum_gross = sum((p.amount for p in fund_gross_cf), Decimal("0"))
    sum_expense = sum((p.amount for p in expense_schedule.cf_points), Decimal("0"))
    sum_merged = sum((p.amount for p in merged), Decimal("0"))
    identity_diff = sum_merged - (sum_gross + sum_expense)

    summary = {
        "sum_fund_gross_cf": float(sum_gross),
        "sum_fund_expense_cf": float(sum_expense),
        "sum_pre_waterfall_cf": float(sum_merged),
        "identity_diff": float(identity_diff),
        "identity_ok": abs(identity_diff) < Decimal("0.01"),
        "expense_null_reasons": dict(expense_schedule.null_reasons),
        "expense_cf_hash": expense_schedule.expense_cf_hash,
    }
    return merged, summary
