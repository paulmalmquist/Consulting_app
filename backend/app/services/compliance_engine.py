"""Investment Engine: compliance service (ADR 005).

Six fixed JSONB operators evaluated by a single dispatcher. No code-defined
rules. Pre-trade and post-trade share the evaluator; the difference is the
context (proposed-trade applied vs current position set).

Operators (frozen — adding one requires an ADR amendment + new private
function + dispatcher entry + CHECK constraint update + tests):

    max_pct_of_nav         — sum matching predicate / NAV ≤ threshold
    max_issuer_exposure    — sum per issuer ≤ threshold (absolute, native ccy)
    max_sector_exposure_pct — sum per sector / NAV ≤ threshold
    restricted_list        — none of (account, security) pairs in named list
    mandate_min_pct        — sum matching predicate / NAV ≥ threshold
    mandate_max_pct        — sum matching predicate / NAV ≤ threshold

Returns EngineResult on every code path. No mutations outside persist_violations.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor
from app.services.accounting_engine import calculate_nav


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE (mirrors accounting_engine for uniformity)
# ─────────────────────────────────────────────────────────────────────────────

class EngineError(TypedDict):
    code: str
    message: str
    context: dict


class EngineResult(TypedDict):
    valid: bool
    value: Optional[Any]
    errors: list[EngineError]
    input_versions: dict


def _ok(value: Any, input_versions: dict) -> EngineResult:
    return {"valid": True, "value": value, "errors": [], "input_versions": input_versions}


def _fail(errors: list[EngineError], input_versions: dict | None = None) -> EngineResult:
    return {"valid": False, "value": None, "errors": errors,
            "input_versions": input_versions or {}}


def _err(code: str, message: str, **context: Any) -> EngineError:
    return {"code": code, "message": message, "context": context}


# Error codes
ERR_INVALID_RULE_OPERATOR = "invalid_rule_operator"
ERR_INVALID_RULE_PREDICATE = "invalid_rule_predicate"
ERR_NAV_UNAVAILABLE = "nav_unavailable"
ERR_POSITION_SET_UNAVAILABLE = "position_set_unavailable"
ERR_RULE_NOT_FOUND = "rule_not_found"
ERR_VIOLATION_NOT_FOUND = "violation_not_found"


# Allowed operators (must match CHECK constraint on inv_compliance_rule.operator)
VALID_OPERATORS = frozenset({
    "max_pct_of_nav",
    "max_issuer_exposure",
    "max_sector_exposure_pct",
    "restricted_list",
    "mandate_min_pct",
    "mandate_max_pct",
})


# ─────────────────────────────────────────────────────────────────────────────
# EVAL CONTEXT — pre-aggregated state passed to every evaluator
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Position:
    """A position used in compliance evaluation."""
    account_id: UUID
    security_id: UUID
    qty: Decimal
    market_value_native: Decimal
    currency: str
    issuer: Optional[str]
    sector: Optional[str]
    asset_class: Optional[str]


@dataclass(frozen=True)
class EvalContext:
    """Pre-aggregated position set + NAV for fast O(1) per-rule evaluation."""
    fund_id: UUID
    as_of_date: date
    base_currency: str
    nav: Decimal
    positions: tuple[Position, ...]
    issuer_totals: dict[str, Decimal] = field(default_factory=dict)
    sector_totals: dict[str, Decimal] = field(default_factory=dict)


def _build_context(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    proposed_trade: Optional[dict] = None,
) -> tuple[Optional[EvalContext], list[EngineError]]:
    """Load positions + NAV. If proposed_trade is set, apply it before aggregating.

    proposed_trade shape (for pre-trade evaluation):
        {
          "account_id": str, "security_id": str,
          "side": "buy" | "sell" | "transfer_in" | "transfer_out",
          "qty": str (Decimal-parseable), "price_native": str, "price_currency": str,
        }
    """
    nav_result = calculate_nav(env_id=env_id, fund_id=fund_id, as_of_date=as_of_date)
    if not nav_result["valid"]:
        return None, [_err(ERR_NAV_UNAVAILABLE,
                            "calculate_nav returned invalid; cannot evaluate compliance",
                            inner_errors=nav_result["errors"])]
    nav = Decimal(str(nav_result["value"]["nav"]))
    base_currency = nav_result["value"]["currency"]

    # Load positions: open lots aggregated to (account, security), with security context
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
                pc.account_id,
                pc.security_id,
                pc.open_qty,
                s.issuer,
                s.sector,
                s.asset_class,
                s.currency AS security_currency
            FROM inv_position_current pc
            JOIN inv_security s ON s.id = pc.security_id
            JOIN inv_account a ON a.id = pc.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE pc.env_id = %s AND p.fund_id = %s AND pc.open_qty <> 0
            """,
            (env_id, str(fund_id)),
        )
        rows = cur.fetchall()

    # For each position, get latest price to compute MV.
    # In V1 we use native currency MV (translation handled at NAV time).
    positions: list[Position] = []
    for r in rows:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT price_native, price_currency
                FROM inv_security_price
                WHERE env_id = %s AND security_id = %s AND price_date <= %s
                  AND superseded_by_id IS NULL
                ORDER BY price_date DESC, published_at DESC LIMIT 1
                """,
                (env_id, str(r["security_id"]), as_of_date),
            )
            price_row = cur.fetchone()
        if not price_row:
            return None, [_err(ERR_POSITION_SET_UNAVAILABLE,
                                f"no price for security {r['security_id']}")]
        qty = Decimal(str(r["open_qty"]))
        mv = qty * Decimal(str(price_row["price_native"]))
        positions.append(Position(
            account_id=r["account_id"],
            security_id=r["security_id"],
            qty=qty,
            market_value_native=mv,
            currency=price_row["price_currency"],
            issuer=r["issuer"],
            sector=r["sector"],
            asset_class=r["asset_class"],
        ))

    # Apply proposed_trade if provided (pre-trade)
    if proposed_trade is not None:
        positions = _apply_proposed_trade(positions, proposed_trade)

    # Pre-aggregate issuer + sector totals
    issuer_totals: dict[str, Decimal] = {}
    sector_totals: dict[str, Decimal] = {}
    for p in positions:
        if p.issuer:
            issuer_totals[p.issuer] = issuer_totals.get(p.issuer, Decimal(0)) + p.market_value_native
        if p.sector:
            sector_totals[p.sector] = sector_totals.get(p.sector, Decimal(0)) + p.market_value_native

    return EvalContext(
        fund_id=fund_id,
        as_of_date=as_of_date,
        base_currency=base_currency,
        nav=nav,
        positions=tuple(positions),
        issuer_totals=issuer_totals,
        sector_totals=sector_totals,
    ), []


def _apply_proposed_trade(positions: list[Position], trade: dict) -> list[Position]:
    """Return a new positions list with the proposed trade applied.

    Pure function. The new MV uses the trade's price_native × delta_qty applied
    to the existing position's MV (qty changes, price assumed same).
    """
    sec_id = UUID(trade["security_id"]) if isinstance(trade["security_id"], str) else trade["security_id"]
    acct_id = UUID(trade["account_id"]) if isinstance(trade["account_id"], str) else trade["account_id"]
    side = trade["side"]
    qty_delta = Decimal(str(trade["qty"]))
    if side in ("sell", "transfer_out"):
        qty_delta = -qty_delta
    price = Decimal(str(trade["price_native"]))

    out: list[Position] = []
    matched = False
    for p in positions:
        if p.account_id == acct_id and p.security_id == sec_id:
            new_qty = p.qty + qty_delta
            new_mv = new_qty * (p.market_value_native / p.qty if p.qty != 0 else price)
            if new_qty == 0:
                continue  # closed out
            out.append(Position(
                account_id=p.account_id, security_id=p.security_id,
                qty=new_qty, market_value_native=new_mv,
                currency=p.currency, issuer=p.issuer, sector=p.sector,
                asset_class=p.asset_class,
            ))
            matched = True
        else:
            out.append(p)

    if not matched and qty_delta > 0:
        # Position didn't previously exist; we need to fetch security context.
        # For V1 this is a simplification: caller should provide it via the trade payload's metadata.
        # Otherwise the new position is created without issuer/sector and won't trigger those rules.
        out.append(Position(
            account_id=acct_id, security_id=sec_id,
            qty=qty_delta, market_value_native=qty_delta * price,
            currency=trade.get("price_currency", "USD"),
            issuer=trade.get("issuer"),
            sector=trade.get("sector"),
            asset_class=trade.get("asset_class"),
        ))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# OPERATOR IMPLEMENTATIONS — pure functions
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Violation:
    rule_id: UUID
    severity: str
    snapshot_value: Optional[Decimal]
    threshold: Optional[Decimal]
    evidence: dict


def _eval_max_pct_of_nav(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """predicate: {"issuer": str} OR {"security_id": str} OR {"asset_class": str}.
    Sums position MV matching predicate; violation if (sum / NAV) > threshold.
    """
    pred = rule["predicate"]
    threshold = Decimal(str(rule["threshold"]))
    if "issuer" in pred:
        total = ctx.issuer_totals.get(pred["issuer"], Decimal(0))
        evidence = {"issuer": pred["issuer"], "issuer_total": str(total)}
    elif "asset_class" in pred:
        total = sum((p.market_value_native for p in ctx.positions
                      if p.asset_class == pred["asset_class"]), Decimal(0))
        evidence = {"asset_class": pred["asset_class"], "class_total": str(total)}
    elif "security_id" in pred:
        sec = UUID(pred["security_id"]) if isinstance(pred["security_id"], str) else pred["security_id"]
        total = sum((p.market_value_native for p in ctx.positions if p.security_id == sec), Decimal(0))
        evidence = {"security_id": str(sec), "security_total": str(total)}
    else:
        # Predicate wasn't valid; this is a rule-author bug, not a runtime check we can do here
        return None
    if ctx.nav <= 0:
        return None
    pct = total / ctx.nav
    if pct > threshold:
        return Violation(
            rule_id=rule["id"], severity=rule["severity"],
            snapshot_value=pct, threshold=threshold,
            evidence={**evidence, "nav": str(ctx.nav), "pct": str(pct)},
        )
    return None


def _eval_max_issuer_exposure(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """Absolute issuer cap. predicate: {"issuer": str} OR {} (= every issuer)."""
    pred = rule.get("predicate") or {}
    threshold = Decimal(str(rule["threshold"]))
    if "issuer" in pred:
        total = ctx.issuer_totals.get(pred["issuer"], Decimal(0))
        if total > threshold:
            return Violation(
                rule_id=rule["id"], severity=rule["severity"],
                snapshot_value=total, threshold=threshold,
                evidence={"issuer": pred["issuer"], "total": str(total)},
            )
    else:
        # Apply to every issuer; first breach wins
        for issuer, total in ctx.issuer_totals.items():
            if total > threshold:
                return Violation(
                    rule_id=rule["id"], severity=rule["severity"],
                    snapshot_value=total, threshold=threshold,
                    evidence={"issuer": issuer, "total": str(total)},
                )
    return None


def _eval_max_sector_exposure_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """predicate: {"sector": str} OR {} (= every sector)."""
    pred = rule.get("predicate") or {}
    threshold = Decimal(str(rule["threshold"]))
    if ctx.nav <= 0:
        return None
    if "sector" in pred:
        total = ctx.sector_totals.get(pred["sector"], Decimal(0))
        pct = total / ctx.nav
        if pct > threshold:
            return Violation(
                rule_id=rule["id"], severity=rule["severity"],
                snapshot_value=pct, threshold=threshold,
                evidence={"sector": pred["sector"], "pct": str(pct)},
            )
    else:
        for sector, total in ctx.sector_totals.items():
            pct = total / ctx.nav
            if pct > threshold:
                return Violation(
                    rule_id=rule["id"], severity=rule["severity"],
                    snapshot_value=pct, threshold=threshold,
                    evidence={"sector": sector, "pct": str(pct)},
                )
    return None


def _eval_restricted_list(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """threshold_list contains security_id UUIDs as strings. Violation if any
    held position's security_id is in the list.
    """
    restricted = set(rule.get("threshold_list") or [])
    if not restricted:
        return None
    for p in ctx.positions:
        if str(p.security_id) in restricted:
            return Violation(
                rule_id=rule["id"], severity=rule["severity"],
                snapshot_value=p.market_value_native, threshold=None,
                evidence={"security_id": str(p.security_id),
                          "account_id": str(p.account_id),
                          "qty": str(p.qty)},
            )
    return None


def _eval_mandate_min_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """sum matching predicate / NAV must be >= threshold.
    predicate: {"asset_class": str} OR {"sector": str}.
    """
    pred = rule["predicate"]
    threshold = Decimal(str(rule["threshold"]))
    if ctx.nav <= 0:
        return None
    if "asset_class" in pred:
        total = sum((p.market_value_native for p in ctx.positions
                      if p.asset_class == pred["asset_class"]), Decimal(0))
        evidence = {"asset_class": pred["asset_class"]}
    elif "sector" in pred:
        total = ctx.sector_totals.get(pred["sector"], Decimal(0))
        evidence = {"sector": pred["sector"]}
    else:
        return None
    pct = total / ctx.nav
    if pct < threshold:
        return Violation(
            rule_id=rule["id"], severity=rule["severity"],
            snapshot_value=pct, threshold=threshold,
            evidence={**evidence, "pct": str(pct), "nav": str(ctx.nav),
                      "expected_min": str(threshold)},
        )
    return None


def _eval_mandate_max_pct(rule: dict, ctx: EvalContext) -> Optional[Violation]:
    """sum matching predicate / NAV must be <= threshold."""
    pred = rule["predicate"]
    threshold = Decimal(str(rule["threshold"]))
    if ctx.nav <= 0:
        return None
    if "asset_class" in pred:
        total = sum((p.market_value_native for p in ctx.positions
                      if p.asset_class == pred["asset_class"]), Decimal(0))
        evidence = {"asset_class": pred["asset_class"]}
    elif "sector" in pred:
        total = ctx.sector_totals.get(pred["sector"], Decimal(0))
        evidence = {"sector": pred["sector"]}
    else:
        return None
    pct = total / ctx.nav
    if pct > threshold:
        return Violation(
            rule_id=rule["id"], severity=rule["severity"],
            snapshot_value=pct, threshold=threshold,
            evidence={**evidence, "pct": str(pct), "nav": str(ctx.nav),
                      "expected_max": str(threshold)},
        )
    return None


OPERATORS = {
    "max_pct_of_nav": _eval_max_pct_of_nav,
    "max_issuer_exposure": _eval_max_issuer_exposure,
    "max_sector_exposure_pct": _eval_max_sector_exposure_pct,
    "restricted_list": _eval_restricted_list,
    "mandate_min_pct": _eval_mandate_min_pct,
    "mandate_max_pct": _eval_mandate_max_pct,
}


# ─────────────────────────────────────────────────────────────────────────────
# RULE LOOKUP
# ─────────────────────────────────────────────────────────────────────────────

def _load_active_rules(env_id: str, fund_id: UUID, as_of_date: date) -> list[dict]:
    """Active rules for (env, fund, date). Includes env-wide rules (fund_id IS NULL)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, env_id, fund_id, scope_kind, operator, predicate,
                   threshold, threshold_list, severity, reason,
                   active_from, active_to
            FROM inv_compliance_rule
            WHERE env_id = %s
              AND (fund_id = %s OR fund_id IS NULL)
              AND active_from <= %s
              AND (active_to IS NULL OR active_to > %s)
            """,
            (env_id, str(fund_id), as_of_date, as_of_date),
        )
        return list(cur.fetchall())


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC: evaluate, list, create, deactivate, resolve
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_pre_trade(
    *, env_id: str, fund_id: UUID, proposed_trade: dict, as_of_date: date,
) -> EngineResult:
    """Evaluate compliance rules against the position set with the proposed trade applied.

    proposed_trade shape: see _apply_proposed_trade. Returns violations WITHOUT
    persisting them — caller decides whether to log a "rejected pre-trade" record.
    """
    ctx, errors = _build_context(env_id=env_id, fund_id=fund_id, as_of_date=as_of_date,
                                  proposed_trade=proposed_trade)
    if errors:
        return _fail(errors)
    return _evaluate(env_id=env_id, ctx=ctx, eval_kind="pre_trade",
                      proposed_trade_id=proposed_trade.get("id"))


def evaluate_post_trade(
    *, env_id: str, business_id: UUID, fund_id: UUID, as_of_date: date,
    persist: bool = True,
) -> EngineResult:
    """Evaluate compliance against the current position set as of date.

    When persist=True, violations are written to inv_compliance_violation.
    """
    ctx, errors = _build_context(env_id=env_id, fund_id=fund_id, as_of_date=as_of_date,
                                  proposed_trade=None)
    if errors:
        return _fail(errors)
    result = _evaluate(env_id=env_id, ctx=ctx, eval_kind="post_trade",
                        proposed_trade_id=None)
    if persist and result["valid"] and result["value"]["violations"]:
        _persist_violations(
            env_id=env_id, business_id=business_id, fund_id=fund_id,
            violations=result["value"]["violations"], eval_kind="post_trade",
        )
    return result


def _evaluate(*, env_id: str, ctx: EvalContext, eval_kind: str,
                proposed_trade_id: Optional[str]) -> EngineResult:
    rules = _load_active_rules(env_id, ctx.fund_id, ctx.as_of_date)
    violations: list[Violation] = []
    for rule in rules:
        op = rule["operator"]
        if op not in OPERATORS:
            # DB CHECK already prevents this; defensive
            continue
        v = OPERATORS[op](rule, ctx)
        if v is not None:
            violations.append(v)

    summary = {
        "rules_evaluated": len(rules),
        "violations_total": len(violations),
        "by_severity": {
            s: sum(1 for v in violations if v.severity == s)
            for s in ("low", "medium", "high", "critical")
        },
        "nav": str(ctx.nav),
        "currency": ctx.base_currency,
    }
    return _ok({
        "violations": [
            {
                "rule_id": str(v.rule_id),
                "severity": v.severity,
                "snapshot_value": str(v.snapshot_value) if v.snapshot_value is not None else None,
                "threshold": str(v.threshold) if v.threshold is not None else None,
                "evidence": v.evidence,
            }
            for v in violations
        ],
        "summary": summary,
        "eval_kind": eval_kind,
    }, input_versions={"rules_count": len(rules), "fund": str(ctx.fund_id)})


def _persist_violations(
    *, env_id: str, business_id: UUID, fund_id: UUID,
    violations: list[dict], eval_kind: str,
) -> None:
    with get_cursor() as cur:
        for v in violations:
            cur.execute(
                """
                INSERT INTO inv_compliance_violation (
                    env_id, business_id, rule_id, fund_id,
                    eval_kind, severity, snapshot_value, threshold, evidence
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    env_id, str(business_id), v["rule_id"], str(fund_id),
                    eval_kind, v["severity"],
                    v["snapshot_value"], v["threshold"],
                    json.dumps(v["evidence"]),
                ),
            )


def list_active_rules(
    *, env_id: str, fund_id: Optional[UUID], as_of_date: date,
) -> EngineResult:
    with get_cursor() as cur:
        if fund_id is not None:
            cur.execute(
                """
                SELECT id, fund_id, scope_kind, operator, predicate,
                       threshold, threshold_list, severity, reason,
                       active_from, active_to
                FROM inv_compliance_rule
                WHERE env_id = %s
                  AND (fund_id = %s OR fund_id IS NULL)
                  AND active_from <= %s
                  AND (active_to IS NULL OR active_to > %s)
                ORDER BY severity DESC, operator
                """,
                (env_id, str(fund_id), as_of_date, as_of_date),
            )
        else:
            cur.execute(
                """
                SELECT id, fund_id, scope_kind, operator, predicate,
                       threshold, threshold_list, severity, reason,
                       active_from, active_to
                FROM inv_compliance_rule
                WHERE env_id = %s
                  AND active_from <= %s
                  AND (active_to IS NULL OR active_to > %s)
                ORDER BY severity DESC, operator
                """,
                (env_id, as_of_date, as_of_date),
            )
        rules = list(cur.fetchall())
    return _ok({"rules": rules, "count": len(rules)},
                input_versions={"as_of_date": as_of_date.isoformat()})


def create_rule(
    *, env_id: str, business_id: UUID, rule: dict,
) -> EngineResult:
    """Create a compliance rule. Validates operator + predicate shape before insert."""
    op = rule.get("operator")
    if op not in VALID_OPERATORS:
        return _fail([_err(ERR_INVALID_RULE_OPERATOR,
                            f"unknown operator {op!r}",
                            valid=sorted(VALID_OPERATORS))])

    # Per-operator predicate validation
    pred = rule.get("predicate") or {}
    valid_preds = {
        "max_pct_of_nav": ({"issuer", "asset_class", "security_id"}, True),
        "max_issuer_exposure": ({"issuer"}, False),
        "max_sector_exposure_pct": ({"sector"}, False),
        "restricted_list": (set(), False),
        "mandate_min_pct": ({"asset_class", "sector"}, True),
        "mandate_max_pct": ({"asset_class", "sector"}, True),
    }
    allowed, requires_any = valid_preds[op]
    pred_keys = set(pred.keys())
    if pred_keys - allowed:
        return _fail([_err(ERR_INVALID_RULE_PREDICATE,
                            f"unknown predicate keys for operator {op}",
                            unknown=sorted(pred_keys - allowed),
                            allowed=sorted(allowed))])
    if requires_any and not (pred_keys & allowed):
        return _fail([_err(ERR_INVALID_RULE_PREDICATE,
                            f"operator {op} requires one of {sorted(allowed)} in predicate")])

    # Threshold required for everything except restricted_list
    if op == "restricted_list":
        if not rule.get("threshold_list"):
            return _fail([_err(ERR_INVALID_RULE_PREDICATE,
                                "restricted_list operator requires threshold_list")])
    else:
        if rule.get("threshold") is None:
            return _fail([_err(ERR_INVALID_RULE_PREDICATE,
                                f"operator {op} requires threshold")])

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO inv_compliance_rule (
                env_id, business_id, fund_id, scope_kind, operator,
                predicate, threshold, threshold_list, severity, reason,
                active_from, active_to
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id),
                str(rule["fund_id"]) if rule.get("fund_id") else None,
                rule.get("scope_kind", "fund"),
                op,
                json.dumps(pred),
                str(rule["threshold"]) if rule.get("threshold") is not None else None,
                rule.get("threshold_list"),
                rule.get("severity", "high"),
                rule.get("reason"),
                rule["active_from"],
                rule.get("active_to"),
            ),
        )
        row = cur.fetchone()
    return _ok({"id": str(row["id"])},
                input_versions={"operator": op})


def deactivate_rule(
    *, env_id: str, rule_id: UUID, as_of: date,
) -> EngineResult:
    """Set active_to on a rule. New rules with adjusted thresholds are inserted separately."""
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_compliance_rule
            SET active_to = %s
            WHERE env_id = %s AND id = %s AND (active_to IS NULL OR active_to > %s)
            RETURNING id
            """,
            (as_of, env_id, str(rule_id), as_of),
        )
        row = cur.fetchone()
    if not row:
        return _fail([_err(ERR_RULE_NOT_FOUND,
                            "rule not found or already deactivated",
                            rule_id=str(rule_id))])
    return _ok({"id": str(rule_id), "active_to": as_of.isoformat()},
                input_versions={})


def resolve_violation(
    *, env_id: str, violation_id: UUID, resolved_by: str, resolution_note: Optional[str],
) -> EngineResult:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE inv_compliance_violation
            SET resolved_at = now(), resolved_by = %s, resolution_note = %s
            WHERE env_id = %s AND id = %s AND resolved_at IS NULL
            RETURNING id
            """,
            (resolved_by, resolution_note, env_id, str(violation_id)),
        )
        row = cur.fetchone()
    if not row:
        return _fail([_err(ERR_VIOLATION_NOT_FOUND,
                            "violation not found or already resolved",
                            violation_id=str(violation_id))])
    return _ok({"id": str(violation_id), "resolved": True},
                input_versions={})
