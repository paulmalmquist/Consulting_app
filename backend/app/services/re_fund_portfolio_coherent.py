"""Coherent REPE Fund Portfolio selector.

Single canonical payload for the Fund Portfolio page at
[repo-b/src/app/lab/env/[envId]/re/page.tsx]. Reads the two views defined in
[repo-b/db/schema/535_re_fund_portfolio_included_view.sql]:

    re_fund_portfolio_included_v   investor-facing rows (released, non-quarantined,
                                   non-archived, scope-complete)
    re_fund_portfolio_excluded_v   diagnostics counterpart, env-scoped via
                                   app.env_business_bindings

Returns one CoherentPortfolioPayload object; the page consumes nothing else.

Plan and gap report: audit/fund_portfolio_coherence/gap_report.md.

Invariants (asserted in tests/test_re_fund_portfolio_coherent.py):

    fund_count == len(fund_rows)
    |portfolio_nav - sum(row.portfolio_nav for row in fund_rows)|  <=  rounding_tolerance
    every fund_row.env_id == requested env_id
    every diagnostics row was scoped via env_business_bindings — cross-env
        leakage is a contract violation
    provenance.irr_method == "nav_weighted_average" (literal string).
        The substring "portfolio_irr" never appears in the serialized payload.

The DSCR bridge from re_fund_quarter_state is intentional and tagged
`provenance: 'legacy_quarter_state'`; the snapshot writer migration is filed
as a Phase 7 follow-up.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.re_authoritative_snapshots import (
    _normalize,
    _to_decimal,
    nav_weighted_irr,
)


IRR_METHOD_LABEL = "nav_weighted_average"


@dataclass
class MetricWithProvenance:
    """A metric that may carry a non-canonical provenance label.

    `value`           — string-encoded decimal or None
    `provenance`      — "authoritative" when sourced from canonical_metrics;
                        "legacy_quarter_state" for the DSCR / LTV bridge.
    `null_reason`     — explanation when `value` is None.
    """

    value: str | None
    provenance: str
    null_reason: str | None


@dataclass
class CoherentFundRow:
    fund_id: str
    name: str
    vintage_year: int | None
    fund_type: str | None
    strategy: str | None
    sub_strategy: str | None
    target_size: str | None
    status: str | None
    base_currency: str | None
    inception_date: str | None
    env_id: str
    quarter: str
    snapshot_version: str | None
    audit_run_id: str | None
    promotion_state: str
    trust_status: str
    breakpoint_layer: str | None
    portfolio_nav: str | None
    total_committed: str | None
    total_called: str | None
    total_distributed: str | None
    gross_irr: str | None
    net_irr: str | None
    dpi: str | None
    rvpi: str | None
    tvpi: str | None
    weighted_dscr: dict
    weighted_ltv: dict
    null_reasons: dict[str, str]
    canonical_metrics_excerpt: dict[str, Any]
    # Hint for the UI to disable the trace link before the user clicks. True
    # when the snapshot's inputs_hash equals provenance[0].cf_series_hash and
    # both are non-empty — the same condition checked by re_irr_trace's hash
    # gate. Computed server-side from the snapshot already loaded; no extra
    # round-trip to the trace route is needed to know if it would resolve.
    gross_irr_traceable: bool = False


@dataclass
class DiagnosticEntry:
    fund_id: str
    fund_name: str
    status: str | None
    exclusion_reason: str
    latest_quarter: str | None
    latest_audit_run_id: str | None
    latest_promotion_state: str | None
    null_reasons: dict[str, Any]
    source_table: str = "repe_fund + re_authoritative_fund_state_qtr"


@dataclass
class NavReconciliation:
    """Server-computed NAV reconciliation. The UI only renders.

    `displayed_fund_nav_sum` — Σ(row.portfolio_nav) over included rows
    `portfolio_nav`           — header NAV (same source, recomputed independently)
    `rounding_delta`          — header − sum
    `tolerance`               — max($1.00, 0.01% of portfolio_nav)
    `status`                  — "reconciled" | "drift"
    """

    displayed_fund_nav_sum: str
    portfolio_nav: str
    rounding_delta: str
    tolerance: str
    status: str


@dataclass
class PortfolioSummary:
    fund_count: int
    diagnostics_count: int
    total_commitments: str | None
    portfolio_nav: str | None
    active_assets: int
    gross_irr: str | None
    net_irr: str | None
    weighted_dscr: dict
    nav_reconciliation: NavReconciliation
    warnings: list[str]
    null_reasons: dict[str, str]


@dataclass
class Provenance:
    irr_method: str
    irr_method_n_funds: int
    irr_method_denominator_nav: str
    source_snapshots: list[dict[str, Any]]
    mixed_release_states: bool
    per_fund_snapshot_version: dict[str, str | None]
    weighted_dscr_provenance: str
    weighted_ltv_provenance: str


@dataclass
class CoherentPortfolioPayload:
    env_id: str
    business_id: str
    quarter: str
    portfolio_summary: PortfolioSummary
    fund_rows: list[CoherentFundRow]
    diagnostics: list[DiagnosticEntry]
    provenance: Provenance


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _metric(value: Any) -> str | None:
    """Pass-through formatter: stringify Decimal/numeric, preserve None."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (int, float)):
        return str(value)
    return str(value)


def _bridge_metric(legacy_value: Any, fund_id: str) -> MetricWithProvenance:
    """DSCR / LTV bridge from re_fund_quarter_state.

    The snapshot writer does not yet populate weighted_dscr / weighted_ltv into
    canonical_metrics; until that follow-up lands, we read the legacy column
    and tag provenance explicitly so the UI can show a "(legacy)" badge.
    """
    if legacy_value is None:
        return MetricWithProvenance(
            value=None,
            provenance="legacy_quarter_state",
            null_reason="not_in_canonical_metrics_no_legacy_row",
        )
    return MetricWithProvenance(
        value=_metric(legacy_value),
        provenance="legacy_quarter_state",
        null_reason=None,
    )


def _is_gross_irr_traceable(
    *, gross_irr: Any, inputs_hash: str | None, provenance: Any
) -> bool:
    """Pre-flight hash gate for the gross_irr trace.

    Returns True only if every condition the trace route itself checks is
    already satisfied at portfolio-load time:
      - gross_irr is not null (no point linking to an unavailable value)
      - inputs_hash is non-empty
      - provenance[0].cf_series_hash equals inputs_hash

    A True hint here means the trace will resolve; a False hint means it
    would land on the lineage_missing surface. The UI uses this to disable
    the link with a tooltip instead of letting the user click into a dead end.
    """
    if gross_irr is None:
        return False
    if not inputs_hash:
        return False
    if not isinstance(provenance, list) or not provenance:
        return False
    first = provenance[0]
    if not isinstance(first, dict):
        return False
    cf_hash = first.get("cf_series_hash")
    if not cf_hash:
        return False
    return str(cf_hash) == str(inputs_hash)


def _row_to_coherent_fund_row(
    row: dict[str, Any],
    env_id: str,
    quarter: str,
    inputs_hash_by_fund: dict[str, str | None] | None = None,
) -> CoherentFundRow:
    metrics = row.get("canonical_metrics") or {}
    nulls = row.get("null_reasons") or {}
    fund_id = str(row["fund_id"])

    # Per-fund metric extraction. canonical_metrics is the only authoritative
    # source for these; null values stay null (no zero coercion).
    nav = metrics.get("ending_nav") or metrics.get("portfolio_nav")
    committed = metrics.get("total_committed")

    inputs_hash = (inputs_hash_by_fund or {}).get(fund_id)
    gross_irr_traceable = _is_gross_irr_traceable(
        gross_irr=metrics.get("gross_irr"),
        inputs_hash=inputs_hash,
        provenance=row.get("provenance"),
    )

    return CoherentFundRow(
        fund_id=fund_id,
        name=row["name"],
        vintage_year=row.get("vintage_year"),
        fund_type=row.get("fund_type"),
        strategy=row.get("strategy"),
        sub_strategy=row.get("sub_strategy"),
        target_size=_metric(row.get("target_size")),
        status=row.get("status"),
        base_currency=row.get("base_currency"),
        inception_date=_normalize(row.get("inception_date")),
        env_id=env_id,
        quarter=quarter,
        snapshot_version=row.get("snapshot_version"),
        audit_run_id=str(row["audit_run_id"]) if row.get("audit_run_id") else None,
        promotion_state=row["promotion_state"],
        trust_status=row.get("trust_status") or "trusted",
        breakpoint_layer=row.get("breakpoint_layer"),
        portfolio_nav=_metric(nav),
        total_committed=_metric(committed),
        total_called=_metric(metrics.get("total_called")),
        total_distributed=_metric(metrics.get("total_distributed")),
        gross_irr=_metric(metrics.get("gross_irr")),
        net_irr=_metric(metrics.get("net_irr")),
        dpi=_metric(metrics.get("dpi")),
        rvpi=_metric(metrics.get("rvpi")),
        tvpi=_metric(metrics.get("tvpi")),
        weighted_dscr=asdict(_bridge_metric(row.get("legacy_weighted_dscr"), fund_id)),
        weighted_ltv=asdict(_bridge_metric(row.get("legacy_weighted_ltv"), fund_id)),
        null_reasons={str(k): str(v) for k, v in nulls.items()} if nulls else {},
        canonical_metrics_excerpt={
            "asset_count": metrics.get("asset_count"),
            "investment_count": metrics.get("investment_count"),
            "scope": metrics.get("scope"),
        },
        gross_irr_traceable=gross_irr_traceable,
    )


def _row_to_diagnostic(row: dict[str, Any]) -> DiagnosticEntry:
    return DiagnosticEntry(
        fund_id=str(row["fund_id"]),
        fund_name=row["name"],
        status=row.get("status"),
        exclusion_reason=row["exclusion_reason"],
        latest_quarter=row.get("latest_quarter"),
        latest_audit_run_id=row.get("latest_audit_run_id"),
        latest_promotion_state=row.get("latest_promotion_state"),
        null_reasons=_normalize(row.get("latest_null_reasons") or {}),
    )


def _compute_nav_reconciliation(
    portfolio_nav: Decimal,
    displayed_sum: Decimal,
) -> NavReconciliation:
    delta = portfolio_nav - displayed_sum
    # Tolerance: $1 floor, 1bp ceiling on portfolio NAV.
    bp_ceiling = (portfolio_nav.copy_abs() * Decimal("0.0001")) if portfolio_nav else Decimal("0")
    tolerance = max(Decimal("1.00"), bp_ceiling)
    status = "reconciled" if abs(delta) <= tolerance else "drift"
    return NavReconciliation(
        displayed_fund_nav_sum=str(displayed_sum),
        portfolio_nav=str(portfolio_nav),
        rounding_delta=str(delta),
        tolerance=str(tolerance),
        status=status,
    )


def _collect_warnings(
    fund_rows: list[CoherentFundRow],
    diagnostics: list[DiagnosticEntry],
    mixed_release_states: bool,
) -> list[str]:
    warnings: list[str] = []
    if mixed_release_states:
        warnings.append(
            "Portfolio contains funds from multiple snapshot_versions. "
            "Aggregate metrics blend methodologies — see provenance.per_fund_snapshot_version."
        )
    missing_committed = [r.fund_id for r in fund_rows if r.total_committed is None]
    if missing_committed:
        warnings.append(
            f"Total commitments excludes {len(missing_committed)} fund(s) "
            f"with missing total_committed: {', '.join(missing_committed)}. "
            f"Headline total under-reports."
        )
    if diagnostics:
        warnings.append(
            f"{len(diagnostics)} fund(s) excluded from investor-facing rollups. "
            f"See diagnostics panel for fund_id and exclusion_reason."
        )
    return warnings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_coherent_fund_portfolio(
    *,
    env_id: str,
    business_id: UUID | str,
    quarter: str,
) -> CoherentPortfolioPayload:
    """Single canonical payload for the REPE Fund Portfolio page.

    See module docstring for invariants. The function is the only legitimate
    consumer of re_fund_portfolio_included_v / re_fund_portfolio_excluded_v.
    """
    business_id_text = str(business_id)
    env_id_text = str(env_id)

    with get_cursor() as cur:
        # Included rows — always env-scoped + business-scoped + quarter-scoped.
        cur.execute(
            """
            SELECT
              env_id,
              business_id::text AS business_id,
              quarter,
              fund_id::text AS fund_id,
              name,
              vintage_year,
              fund_type,
              strategy,
              sub_strategy,
              target_size,
              status,
              base_currency,
              inception_date,
              audit_run_id,
              snapshot_version,
              promotion_state,
              trust_status,
              breakpoint_layer,
              canonical_metrics,
              null_reasons,
              provenance,
              released_at,
              legacy_weighted_dscr,
              legacy_weighted_ltv
            FROM re_fund_portfolio_included_v
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND quarter = %s
            ORDER BY name
            """,
            (env_id_text, business_id_text, quarter),
        )
        included_rows = cur.fetchall()

        # Per-fund inputs_hash lookup — needed to compute gross_irr_traceable
        # without an extra trace-route round trip. Reads the same released
        # snapshot rows that re_fund_portfolio_included_v already JOINs to.
        inputs_hash_by_fund: dict[str, str | None] = {}
        if included_rows:
            audit_ids = [r["audit_run_id"] for r in included_rows]
            cur.execute(
                """
                SELECT fund_id::text AS fund_id, inputs_hash
                FROM re_authoritative_fund_state_qtr
                WHERE audit_run_id = ANY(%s::uuid[])
                  AND quarter = %s
                  AND promotion_state = 'released'
                """,
                (audit_ids, quarter),
            )
            for row in cur.fetchall():
                inputs_hash_by_fund[row["fund_id"]] = row.get("inputs_hash")

        # Diagnostics — env-scoped via app.env_business_bindings JOIN inside the view.
        # We additionally filter by business_id so a multi-env binding cannot leak
        # across businesses (defense-in-depth; today UNIQUE(env_id) makes this a no-op).
        cur.execute(
            """
            SELECT
              env_id,
              business_id::text AS business_id,
              fund_id::text AS fund_id,
              name,
              status,
              latest_quarter,
              latest_audit_run_id,
              latest_promotion_state,
              latest_null_reasons,
              exclusion_reason
            FROM re_fund_portfolio_excluded_v
            WHERE env_id = %s
              AND business_id = %s::uuid
            ORDER BY name
            """,
            (env_id_text, business_id_text),
        )
        excluded_rows = cur.fetchall()

    # ── Env-scope invariant (defense-in-depth) ─────────────────────────────
    # The view filters by env_id, so this should always pass. If a future view
    # refactor returns rows for the wrong env, this assertion surfaces the
    # violation loudly before any incoherent payload reaches the UI.
    for r in included_rows:
        row_env_id = r.get("env_id")
        if row_env_id is None or str(row_env_id) != env_id_text:
            raise RuntimeError(
                f"env-scope contract violation: included view returned a row with "
                f"env_id={row_env_id!r} for requested env_id={env_id_text!r} "
                f"(fund_id={r.get('fund_id')})"
            )
    for r in excluded_rows:
        row_env_id = r.get("env_id")
        if row_env_id is None or str(row_env_id) != env_id_text:
            raise RuntimeError(
                f"env-scope contract violation: excluded view returned a row with "
                f"env_id={row_env_id!r} for requested env_id={env_id_text!r} "
                f"(fund_id={r.get('fund_id')})"
            )

    # ── Build fund_rows ────────────────────────────────────────────────────
    fund_rows = [
        _row_to_coherent_fund_row(r, env_id_text, quarter, inputs_hash_by_fund)
        for r in included_rows
    ]
    diagnostics = [_row_to_diagnostic(r) for r in excluded_rows]

    # ── Portfolio aggregates (released-only, scope-complete by view contract) ──
    portfolio_nav = sum(
        (_to_decimal(r.portfolio_nav) for r in fund_rows),
        Decimal("0"),
    )
    total_commitments = sum(
        (_to_decimal(r.total_committed) for r in fund_rows if r.total_committed is not None),
        Decimal("0"),
    )
    active_assets = sum(
        int((r.canonical_metrics_excerpt or {}).get("asset_count") or 0)
        for r in fund_rows
    )

    # ── IRR: shared NAV-weighting helper ──────────────────────────────────
    gross_irr, gross_denom, gross_n = nav_weighted_irr(included_rows, irr_key="gross_irr")
    net_irr, net_denom, net_n = nav_weighted_irr(included_rows, irr_key="net_irr")

    # ── DSCR: NAV-weighted bridge from legacy quarter-state ────────────────
    dscr_weighted_sum = Decimal("0")
    dscr_denom = Decimal("0")
    dscr_n = 0
    for r in fund_rows:
        nav_val = _to_decimal(r.portfolio_nav)
        legacy = r.weighted_dscr.get("value") if r.weighted_dscr else None
        if legacy is None or nav_val <= 0:
            continue
        dscr_weighted_sum += _to_decimal(legacy) * nav_val
        dscr_denom += nav_val
        dscr_n += 1
    weighted_dscr_value = (dscr_weighted_sum / dscr_denom) if dscr_denom > 0 else None
    weighted_dscr = {
        "value": str(weighted_dscr_value) if weighted_dscr_value is not None else None,
        "provenance": "legacy_quarter_state",
        "null_reason": None if weighted_dscr_value is not None else "no_legacy_dscr_rows",
    }

    # ── NAV reconciliation ────────────────────────────────────────────────
    displayed_sum = sum(
        (_to_decimal(r.portfolio_nav) for r in fund_rows),
        Decimal("0"),
    )
    nav_reconciliation = _compute_nav_reconciliation(portfolio_nav, displayed_sum)

    # ── Provenance ────────────────────────────────────────────────────────
    source_snapshots = [
        {
            "fund_id": str(r["fund_id"]),
            "audit_run_id": str(r["audit_run_id"]) if r.get("audit_run_id") else None,
            "snapshot_version": r.get("snapshot_version"),
            "promotion_state": r.get("promotion_state"),
            "trust_status": r.get("trust_status"),
        }
        for r in included_rows
    ]
    unique_versions = sorted({s["snapshot_version"] for s in source_snapshots if s["snapshot_version"]})
    mixed_release_states = len(unique_versions) > 1
    per_fund_snapshot_version = {s["fund_id"]: s["snapshot_version"] for s in source_snapshots}

    # IRR n is taken from gross_irr's contributing-fund count; if gross is null
    # everywhere, fall back to net's count, else 0.
    irr_n = gross_n if gross_n > 0 else net_n
    irr_denom = gross_denom if gross_denom > 0 else net_denom

    provenance = Provenance(
        irr_method=IRR_METHOD_LABEL,
        irr_method_n_funds=irr_n,
        irr_method_denominator_nav=str(irr_denom),
        source_snapshots=source_snapshots,
        mixed_release_states=mixed_release_states,
        per_fund_snapshot_version=per_fund_snapshot_version,
        weighted_dscr_provenance="legacy_quarter_state",
        weighted_ltv_provenance="legacy_quarter_state",
    )

    # ── Warnings + null_reasons aggregation ───────────────────────────────
    warnings = _collect_warnings(fund_rows, diagnostics, mixed_release_states)

    null_reasons: dict[str, str] = {}
    if not fund_rows:
        null_reasons["portfolio"] = "no_released_authoritative_funds"

    summary = PortfolioSummary(
        fund_count=len(fund_rows),
        diagnostics_count=len(diagnostics),
        total_commitments=str(total_commitments) if fund_rows else None,
        portfolio_nav=str(portfolio_nav) if fund_rows else None,
        active_assets=active_assets,
        gross_irr=str(gross_irr) if gross_irr is not None else None,
        net_irr=str(net_irr) if net_irr is not None else None,
        weighted_dscr=weighted_dscr,
        nav_reconciliation=nav_reconciliation,
        warnings=warnings,
        null_reasons=null_reasons,
    )

    payload = CoherentPortfolioPayload(
        env_id=env_id_text,
        business_id=business_id_text,
        quarter=quarter,
        portfolio_summary=summary,
        fund_rows=fund_rows,
        diagnostics=diagnostics,
        provenance=provenance,
    )

    return payload


def payload_to_dict(payload: CoherentPortfolioPayload) -> dict[str, Any]:
    """JSON-serializable form for the FastAPI route.

    Uses asdict() then runs `_normalize` to convert any Decimal/UUID/datetime
    that snuck through (defensive — most fields are already strings).
    """
    return _normalize(asdict(payload))
