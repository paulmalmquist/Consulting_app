"""Investment Engine: risk service (ADR 004).

Pure, deterministic, fail-closed risk calculations:

    calculate_var          — historical sim + parametric (both methods, ADR 004)
    apply_scenario         — shock vector applied to current positions
    calculate_sensitivity  — DV01 / beta / delta
    calculate_factor_exposure — aggregate factor loading × position MV
    attribute_performance  — split realized + unrealized P&L by factor

Pure compute helpers (no DB) for:
    - parametric_var(weights, cov, confidence, horizon_days)
    - historical_sim_var(returns_matrix, weights, confidence, horizon_days)
    - apply_shock_native(positions, shocks)

Returns EngineResult on every code path. Fail-closed when price history,
factor loadings, or scenario inputs are missing.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, getcontext
from typing import Any, Literal, Optional, TypedDict
from uuid import UUID

from app.db import get_cursor

# Higher precision for variance/covariance arithmetic
getcontext().prec = 28


# ─────────────────────────────────────────────────────────────────────────────
# RESULT SHAPE
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
ERR_MISSING_HISTORY = "missing_history"
ERR_MISSING_FACTOR_LOADING = "missing_factor_loading"
ERR_UNKNOWN_SCENARIO = "unknown_scenario"
ERR_SINGULAR_COVARIANCE = "singular_covariance"
ERR_FUND_NOT_FOUND = "fund_not_found"
ERR_NO_POSITIONS = "no_positions"
ERR_INVALID_INPUT = "invalid_input"


# Inverse-CDF z-scores at confidence levels (one-sided lower tail)
# Matches the standard normal quantile to 6 decimals.
Z_SCORES: dict[Decimal, Decimal] = {
    Decimal("95.00"): Decimal("1.644854"),
    Decimal("97.50"): Decimal("1.959964"),
    Decimal("99.00"): Decimal("2.326348"),
}


# ─────────────────────────────────────────────────────────────────────────────
# PURE COMPUTE — testable in isolation
# ─────────────────────────────────────────────────────────────────────────────

def _decimal_sqrt(x: Decimal) -> Decimal:
    """Decimal sqrt without floating-point detour."""
    if x < 0:
        raise ValueError(f"sqrt of negative {x}")
    if x == 0:
        return Decimal(0)
    # Newton's method on Decimal; 30 iterations is plenty at prec=28
    g = Decimal(str(math.sqrt(float(x))))  # initial seed
    for _ in range(30):
        if g == 0:
            break
        g = (g + x / g) / Decimal(2)
    return g


def parametric_var(
    *, weights: list[Decimal], cov: list[list[Decimal]],
    confidence_pct: Decimal, horizon_days: int,
) -> Decimal:
    """Parametric VaR as a fraction of portfolio value.

    VaR = z × sqrt(w' Σ w) × sqrt(horizon_days)

    weights: list of position weights, summing to 1
    cov: NxN covariance matrix of single-period (typically daily) returns
    confidence_pct: one of 95.00, 97.50, 99.00
    horizon_days: scaling factor; 1, 5, 10, 20

    Returns Decimal — the loss as a fraction of portfolio value at the chosen
    confidence level. Caller multiplies by portfolio_value_native to get the
    monetary VaR.

    Pure function. Raises ValueError on shape mismatch.
    """
    n = len(weights)
    if n == 0:
        raise ValueError("empty weights")
    if len(cov) != n or any(len(row) != n for row in cov):
        raise ValueError(f"cov shape mismatch: weights n={n}, cov={len(cov)}x{len(cov[0]) if cov else 0}")
    z = Z_SCORES.get(confidence_pct)
    if z is None:
        raise ValueError(f"unsupported confidence_pct {confidence_pct}; allowed: {sorted(Z_SCORES)}")
    if horizon_days < 1:
        raise ValueError(f"horizon_days must be ≥ 1; got {horizon_days}")

    # portfolio variance = w' Σ w
    variance = Decimal(0)
    for i in range(n):
        for j in range(n):
            variance += weights[i] * cov[i][j] * weights[j]
    if variance < 0:
        # numerical artifact in degenerate cov; clamp to 0 rather than fail
        variance = Decimal(0)

    sigma = _decimal_sqrt(variance)
    return z * sigma * _decimal_sqrt(Decimal(horizon_days))


def historical_sim_var(
    *, returns_matrix: list[list[Decimal]], weights: list[Decimal],
    confidence_pct: Decimal, horizon_days: int,
) -> Decimal:
    """Historical-simulation VaR as a fraction of portfolio value.

    Apply each historical row to the current weights → get a vector of
    historical portfolio returns. Take the (1−confidence) quantile.

    returns_matrix: rows are dates, columns are securities (same order as weights)
    confidence_pct: one of 95.00, 97.50, 99.00
    horizon_days: ≥1; horizon scaling uses sqrt-of-time on the empirical loss
                  (acceptable approximation for short horizons; revisit if
                  multi-day overlapping windows become standard)

    Returns Decimal — positive number representing the loss at the percentile.
    Pure function.
    """
    n = len(weights)
    if not returns_matrix:
        raise ValueError("empty returns_matrix")
    if any(len(row) != n for row in returns_matrix):
        raise ValueError("returns_matrix column count must equal weights length")

    # Compute portfolio return for each historical date
    port_returns: list[Decimal] = []
    for row in returns_matrix:
        r = Decimal(0)
        for i in range(n):
            r += weights[i] * row[i]
        port_returns.append(r)

    # Sort ascending (most negative first)
    port_returns.sort()
    # Quantile index: the (1-conf) percentile of losses; e.g., 95% conf → 5th percentile
    one_minus_conf = (Decimal("100") - confidence_pct) / Decimal("100")
    idx = int(len(port_returns) * float(one_minus_conf))
    if idx >= len(port_returns):
        idx = len(port_returns) - 1
    quantile = port_returns[idx]
    # Loss is the negation (returns are sorted ascending; lower-tail return is the loss)
    loss = -quantile
    if loss < 0:
        loss = Decimal(0)
    # Time scaling
    return loss * _decimal_sqrt(Decimal(horizon_days))


def apply_shock_native(
    *, positions: list[tuple[str, Decimal]],
    factor_loadings: dict[str, dict[str, Decimal]],
    shocks: dict[str, Decimal],
) -> Decimal:
    """Apply a factor-space shock vector to positions and return total P&L.

    positions: list of (security_id_str, market_value_native)
    factor_loadings: { security_id_str: { factor_code: loading } }
    shocks: { factor_code: shock_pct } e.g., { "EQ.US": Decimal("-0.30") }

    Returns total scenario P&L in the position's native currency (assumes all
    positions in same currency; cross-currency handled at caller level).
    Pure function.
    """
    total = Decimal(0)
    for sec_id, mv in positions:
        loadings = factor_loadings.get(sec_id, {})
        # Sum across factors: ΔP&L = MV × Σ (loading × shock)
        delta = Decimal(0)
        for factor, loading in loadings.items():
            shock = shocks.get(factor)
            if shock is None:
                continue
            delta += loading * shock
        total += mv * delta
    return total


# ─────────────────────────────────────────────────────────────────────────────
# DB FETCHES
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FundPos:
    security_id: UUID
    qty: Decimal
    market_value_native: Decimal
    currency: str


def _fetch_fund(env_id: str, fund_id: UUID) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, base_currency, spot_fx_source FROM inv_fund "
            "WHERE env_id = %s AND id = %s",
            (env_id, str(fund_id)),
        )
        return cur.fetchone()


def _fetch_fund_positions(
    env_id: str, fund_id: UUID, as_of_date: date,
) -> tuple[list[FundPos], Optional[Decimal]]:
    """Returns (positions list, total_mv) — total in native (assumed same ccy).

    For multi-currency funds, this V1 simplification needs refinement at
    caller level. Wave 1+ TODO.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT pc.security_id, pc.open_qty, s.currency
            FROM inv_position_current pc
            JOIN inv_security s ON s.id = pc.security_id
            JOIN inv_account a ON a.id = pc.account_id
            JOIN inv_portfolio p ON p.id = a.portfolio_id
            WHERE pc.env_id = %s AND p.fund_id = %s AND pc.open_qty <> 0
            """,
            (env_id, str(fund_id)),
        )
        rows = cur.fetchall()

    if not rows:
        return [], None

    out: list[FundPos] = []
    total = Decimal(0)
    for r in rows:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT price_native FROM inv_security_price
                WHERE env_id = %s AND security_id = %s AND price_date <= %s
                  AND superseded_by_id IS NULL
                ORDER BY price_date DESC, published_at DESC LIMIT 1
                """,
                (env_id, str(r["security_id"]), as_of_date),
            )
            pr = cur.fetchone()
        if not pr:
            return [], None
        qty = Decimal(str(r["open_qty"]))
        mv = qty * Decimal(str(pr["price_native"]))
        out.append(FundPos(
            security_id=r["security_id"], qty=qty,
            market_value_native=mv, currency=r["currency"],
        ))
        total += mv
    return out, total


def _fetch_returns_matrix(
    env_id: str, security_ids: list[UUID], as_of_date: date, window_days: int,
) -> Optional[list[list[Decimal]]]:
    """For each security, fetch the most recent `window_days` daily returns up to as_of_date.

    Returns matrix oriented [date_idx][sec_idx]; returns None if any security
    has < window_days observations (fail-closed per ADR 004).
    """
    if not security_ids:
        return None
    series: dict[UUID, list[tuple[date, Decimal]]] = {}
    for sid in security_ids:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT price_date, price_native FROM inv_security_price
                WHERE env_id = %s AND security_id = %s AND price_date <= %s
                  AND superseded_by_id IS NULL
                ORDER BY price_date DESC LIMIT %s
                """,
                (env_id, str(sid), as_of_date, window_days + 1),
            )
            rows = cur.fetchall()
        if len(rows) < window_days + 1:
            return None
        # Convert to log returns (ln(p_t / p_{t-1}))
        rows = sorted(rows, key=lambda r: r["price_date"])
        rets: list[tuple[date, Decimal]] = []
        for i in range(1, len(rows)):
            p1 = Decimal(str(rows[i - 1]["price_native"]))
            p2 = Decimal(str(rows[i]["price_native"]))
            if p1 <= 0 or p2 <= 0:
                continue
            r = Decimal(str(math.log(float(p2) / float(p1))))
            rets.append((rows[i]["price_date"], r))
        if len(rets) < window_days:
            return None
        series[sid] = rets[-window_days:]
    # Align by date (assume all securities have same trading days; for robustness in V1 we just zip)
    n_dates = window_days
    matrix: list[list[Decimal]] = []
    for d_i in range(n_dates):
        row = [series[sid][d_i][1] for sid in security_ids]
        matrix.append(row)
    return matrix


def _compute_covariance(returns_matrix: list[list[Decimal]],
                          ewma_lambda: Optional[Decimal] = None) -> list[list[Decimal]]:
    """Sample or EWMA covariance from a returns matrix.

    Pure function. Returns NxN covariance.
    """
    if not returns_matrix:
        return []
    n_dates = len(returns_matrix)
    n = len(returns_matrix[0])

    # Compute means
    means = [Decimal(0)] * n
    for row in returns_matrix:
        for i in range(n):
            means[i] += row[i]
    means = [m / Decimal(n_dates) for m in means]

    cov: list[list[Decimal]] = [[Decimal(0)] * n for _ in range(n)]
    if ewma_lambda is None or ewma_lambda <= 0 or ewma_lambda >= 1:
        # Sample covariance
        for row in returns_matrix:
            for i in range(n):
                for j in range(n):
                    cov[i][j] += (row[i] - means[i]) * (row[j] - means[j])
        denom = Decimal(max(n_dates - 1, 1))
        for i in range(n):
            for j in range(n):
                cov[i][j] /= denom
    else:
        # EWMA
        # cov_t = λ × cov_{t-1} + (1-λ) × x_t x_t'
        one_minus = Decimal(1) - ewma_lambda
        for row in returns_matrix:
            for i in range(n):
                for j in range(n):
                    cov[i][j] = ewma_lambda * cov[i][j] + one_minus * (row[i] - means[i]) * (row[j] - means[j])
    return cov


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def calculate_var(
    *,
    env_id: str,
    fund_id: UUID,
    as_of_date: date,
    confidence_pct: Decimal = Decimal("95.00"),
    horizon_days: int = 1,
    history_window_days: int = 252,
    ewma_lambda: Optional[Decimal] = None,
) -> EngineResult:
    """Calculate VaR using BOTH historical-sim and parametric methods (ADR 004).

    Returns one EngineResult containing both numbers; the snapshot writer
    persists them as two rows.
    """
    if confidence_pct not in Z_SCORES:
        return _fail([_err(ERR_INVALID_INPUT,
                            f"confidence_pct {confidence_pct} not in {sorted(Z_SCORES)}")])
    if horizon_days not in (1, 5, 10, 20):
        return _fail([_err(ERR_INVALID_INPUT,
                            "horizon_days must be 1, 5, 10, or 20")])

    fund = _fetch_fund(env_id, fund_id)
    if not fund:
        return _fail([_err(ERR_FUND_NOT_FOUND, "fund not found",
                            fund_id=str(fund_id))])
    base_currency = fund["base_currency"]

    positions, total_mv = _fetch_fund_positions(env_id, fund_id, as_of_date)
    if not positions or total_mv is None or total_mv == 0:
        return _fail([_err(ERR_NO_POSITIONS,
                            "no positions or total MV zero",
                            fund_id=str(fund_id))])

    sec_ids = [p.security_id for p in positions]
    returns_matrix = _fetch_returns_matrix(env_id, sec_ids, as_of_date, history_window_days)
    if returns_matrix is None:
        return _fail([_err(ERR_MISSING_HISTORY,
                            f"insufficient price history (< {history_window_days} days) for at least one position",
                            history_window_days=history_window_days)])

    weights = [p.market_value_native / total_mv for p in positions]

    # Historical sim
    var_hist = historical_sim_var(
        returns_matrix=returns_matrix, weights=weights,
        confidence_pct=confidence_pct, horizon_days=horizon_days,
    )

    # Parametric
    cov = _compute_covariance(returns_matrix, ewma_lambda=ewma_lambda)
    try:
        var_param = parametric_var(
            weights=weights, cov=cov,
            confidence_pct=confidence_pct, horizon_days=horizon_days,
        )
    except ValueError as e:
        return _fail([_err(ERR_SINGULAR_COVARIANCE,
                            f"parametric VaR failed: {e}",
                            history_window_days=history_window_days)])

    return _ok({
        "fund_id": str(fund_id),
        "as_of_date": as_of_date.isoformat(),
        "confidence_pct": confidence_pct,
        "horizon_days": horizon_days,
        "history_window_days": history_window_days,
        "covariance_method": ("ewma_" + str(ewma_lambda)) if ewma_lambda else "sample",
        "currency": base_currency,
        "portfolio_value_native": total_mv,
        "var_historical_sim_native": var_hist * total_mv,
        "var_parametric_native": var_param * total_mv,
        "var_historical_sim_pct": var_hist,
        "var_parametric_pct": var_param,
    }, input_versions={
        "fund": str(fund_id),
        "history_days": history_window_days,
        "n_positions": len(positions),
    })


def apply_scenario(
    *, env_id: str, fund_id: UUID, as_of_date: date, scenario_id: UUID,
) -> EngineResult:
    """Apply a named scenario (factor-space shock vector) to current positions.

    Returns total scenario P&L in the fund's base currency. Fail-closed if
    any held security is missing factor loadings for the active factors in
    the scenario.
    """
    fund = _fetch_fund(env_id, fund_id)
    if not fund:
        return _fail([_err(ERR_FUND_NOT_FOUND, "fund not found")])
    base_currency = fund["base_currency"]

    with get_cursor() as cur:
        cur.execute(
            "SELECT id, code, name, kind, shocks FROM inv_scenario "
            "WHERE env_id = %s AND id = %s",
            (env_id, str(scenario_id)),
        )
        scenario = cur.fetchone()
    if not scenario:
        return _fail([_err(ERR_UNKNOWN_SCENARIO,
                            "scenario not found", scenario_id=str(scenario_id))])

    shocks: dict[str, Decimal] = {k: Decimal(str(v)) for k, v in scenario["shocks"].items()}
    factor_codes = list(shocks.keys())

    positions, total_mv = _fetch_fund_positions(env_id, fund_id, as_of_date)
    if not positions:
        return _fail([_err(ERR_NO_POSITIONS, "no positions")])

    # Look up factor IDs by code (env-scoped)
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, code FROM inv_factor WHERE env_id = %s AND code = ANY(%s)",
            (env_id, factor_codes),
        )
        factor_id_by_code = {r["code"]: r["id"] for r in cur.fetchall()}

    missing_factor_codes = [c for c in factor_codes if c not in factor_id_by_code]
    if missing_factor_codes:
        return _fail([_err(ERR_UNKNOWN_SCENARIO,
                            "scenario references factor codes not in inv_factor for this env",
                            missing=missing_factor_codes)])

    # Pull loadings for every (security, factor_id) pair, latest as_of_date
    loadings_map: dict[str, dict[str, Decimal]] = {}
    for p in positions:
        for code, fid in factor_id_by_code.items():
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT loading FROM inv_factor_loading
                    WHERE env_id = %s AND security_id = %s AND factor_id = %s
                      AND effective_date <= %s AND superseded_by_id IS NULL
                    ORDER BY effective_date DESC, published_at DESC LIMIT 1
                    """,
                    (env_id, str(p.security_id), str(fid), as_of_date),
                )
                row = cur.fetchone()
            if not row:
                return _fail([_err(ERR_MISSING_FACTOR_LOADING,
                                    "missing factor loading for held security under scenario factor",
                                    security_id=str(p.security_id), factor=code)])
            loadings_map.setdefault(str(p.security_id), {})[code] = Decimal(str(row["loading"]))

    pnl = apply_shock_native(
        positions=[(str(p.security_id), p.market_value_native) for p in positions],
        factor_loadings=loadings_map,
        shocks=shocks,
    )

    return _ok({
        "fund_id": str(fund_id),
        "scenario_id": str(scenario_id),
        "scenario_code": scenario["code"],
        "scenario_name": scenario["name"],
        "as_of_date": as_of_date.isoformat(),
        "currency": base_currency,
        "portfolio_value_native": total_mv,
        "scenario_pnl_native": pnl,
        "scenario_pnl_pct": pnl / total_mv if total_mv else Decimal(0),
    }, input_versions={"scenario": str(scenario_id), "fund": str(fund_id)})


def calculate_factor_exposure(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    factor_id: Optional[UUID] = None,
) -> EngineResult:
    """Aggregate factor exposure for a fund: Σ (position_mv × loading) for each factor.

    Returns dict { factor_code: { exposure: Decimal, factor_id: str } }.
    Fail-closed if any held security is missing loadings for a requested factor.
    """
    fund = _fetch_fund(env_id, fund_id)
    if not fund:
        return _fail([_err(ERR_FUND_NOT_FOUND, "fund not found")])

    positions, total_mv = _fetch_fund_positions(env_id, fund_id, as_of_date)
    if not positions:
        return _fail([_err(ERR_NO_POSITIONS, "no positions")])

    with get_cursor() as cur:
        if factor_id is None:
            cur.execute(
                "SELECT id, code, name FROM inv_factor WHERE env_id = %s ORDER BY code",
                (env_id,),
            )
        else:
            cur.execute(
                "SELECT id, code, name FROM inv_factor WHERE env_id = %s AND id = %s",
                (env_id, str(factor_id)),
            )
        factors = cur.fetchall()

    exposures: dict[str, dict] = {}
    for f in factors:
        total_exp = Decimal(0)
        for p in positions:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT loading FROM inv_factor_loading
                    WHERE env_id = %s AND security_id = %s AND factor_id = %s
                      AND effective_date <= %s AND superseded_by_id IS NULL
                    ORDER BY effective_date DESC, published_at DESC LIMIT 1
                    """,
                    (env_id, str(p.security_id), str(f["id"]), as_of_date),
                )
                row = cur.fetchone()
            if not row:
                return _fail([_err(ERR_MISSING_FACTOR_LOADING,
                                    "missing factor loading",
                                    security_id=str(p.security_id),
                                    factor_code=f["code"])])
            total_exp += p.market_value_native * Decimal(str(row["loading"]))
        exposures[f["code"]] = {
            "factor_id": str(f["id"]),
            "factor_name": f["name"],
            "exposure_native": total_exp,
        }

    return _ok({
        "fund_id": str(fund_id),
        "as_of_date": as_of_date.isoformat(),
        "portfolio_value_native": total_mv,
        "exposures": exposures,
    }, input_versions={"fund": str(fund_id)})


def calculate_sensitivity(
    *, env_id: str, fund_id: UUID, as_of_date: date,
    sensitivity_kind: Literal["dv01", "beta", "delta"],
) -> EngineResult:
    """Sensitivity calculation. V1 stub-quality except DV01.

    DV01 = sum over fixed-income positions of (MV × duration × 0.0001).
    Duration loadings come from inv_factor_loading where factor.dimension='duration'.

    Beta and Delta deferred — return valid=False with code='not_yet_implemented'.
    """
    if sensitivity_kind == "dv01":
        # DV01: use factor with code 'FI.DURATION' for duration loadings
        with get_cursor() as cur:
            cur.execute(
                "SELECT id FROM inv_factor WHERE env_id = %s AND code = 'FI.DURATION'",
                (env_id,),
            )
            dur_factor = cur.fetchone()
        if not dur_factor:
            return _fail([_err(ERR_INVALID_INPUT,
                                "DV01 requires factor 'FI.DURATION' to be defined for env")])
        positions, total_mv = _fetch_fund_positions(env_id, fund_id, as_of_date)
        if not positions:
            return _fail([_err(ERR_NO_POSITIONS, "no positions")])

        dv01 = Decimal(0)
        for p in positions:
            with get_cursor() as cur:
                cur.execute(
                    """
                    SELECT loading FROM inv_factor_loading
                    WHERE env_id = %s AND security_id = %s AND factor_id = %s
                      AND effective_date <= %s AND superseded_by_id IS NULL
                    ORDER BY effective_date DESC, published_at DESC LIMIT 1
                    """,
                    (env_id, str(p.security_id), str(dur_factor["id"]), as_of_date),
                )
                row = cur.fetchone()
            if not row:
                # Position has no duration loading — skip (likely an equity)
                continue
            duration = Decimal(str(row["loading"]))
            dv01 += p.market_value_native * duration * Decimal("0.0001")
        return _ok({
            "fund_id": str(fund_id),
            "as_of_date": as_of_date.isoformat(),
            "sensitivity_kind": "dv01",
            "value": dv01,
            "currency_per_bp": "USD",  # placeholder — caller can use fund.base_currency
        }, input_versions={"fund": str(fund_id)})

    return _fail([_err("not_yet_implemented",
                        f"sensitivity_kind={sensitivity_kind} deferred to Wave 1.5",
                        kind=sensitivity_kind)])


def attribute_performance(
    *, env_id: str, fund_id: UUID, start_date: date, end_date: date,
) -> EngineResult:
    """V1 attribution: factor contribution = factor exposure (start) × factor return (period).

    Approximate but reproducible. Returns a breakdown by factor.
    """
    if start_date >= end_date:
        return _fail([_err(ERR_INVALID_INPUT, "start_date must be before end_date")])

    # Get exposures at start
    start_exp = calculate_factor_exposure(env_id=env_id, fund_id=fund_id, as_of_date=start_date)
    if not start_exp["valid"]:
        return start_exp

    # For V1, we don't have a way to compute factor returns over a period without
    # historical factor index series (a full thing). Return the structure with
    # factor_return=None and a clear note.
    breakdown = {}
    for code, exp in start_exp["value"]["exposures"].items():
        breakdown[code] = {
            "factor_id": exp["factor_id"],
            "factor_name": exp["factor_name"],
            "exposure_at_start": exp["exposure_native"],
            "factor_return_period": None,
            "factor_return_reason": "factor_index_series_not_yet_modelled",
            "contribution_native": None,
        }

    return _ok({
        "fund_id": str(fund_id),
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "breakdown": breakdown,
        "total_attributable_pnl": None,
        "total_reason": "factor_index_series_not_yet_modelled",
    }, input_versions={"fund": str(fund_id)})
