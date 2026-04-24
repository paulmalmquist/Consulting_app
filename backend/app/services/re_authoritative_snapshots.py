from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from app.db import get_cursor

_TABLE_BY_ENTITY = {
    "asset": ("re_authoritative_asset_state_qtr", "asset_id"),
    "investment": ("re_authoritative_investment_state_qtr", "investment_id"),
    "fund": ("re_authoritative_fund_state_qtr", "fund_id"),
}


class StateLockViolation(RuntimeError):
    """Raised when a non-snapshot path tries to read/serve a value for a
    (entity, quarter) that already has a released authoritative snapshot.

    Per the Authoritative State Lockdown rules in
    docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md, any released snapshot is the
    single source of truth for that period. Legacy routes, base-scenario
    fetchers, and direct SQL aggregates must yield to it.
    """

    def __init__(
        self,
        *,
        entity_type: str,
        entity_id: UUID | str,
        quarter: str,
        snapshot_version: str | None,
    ) -> None:
        self.entity_type = entity_type
        self.entity_id = str(entity_id)
        self.quarter = quarter
        self.snapshot_version = snapshot_version
        super().__init__(
            f"State lock violation: released authoritative snapshot exists for "
            f"{entity_type}={entity_id} quarter={quarter} "
            f"(snapshot_version={snapshot_version}). Read from "
            f"re_authoritative_snapshots.get_authoritative_state instead."
        )


def released_state_lock(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
) -> str | None:
    """Return the released snapshot_version for a given (entity, quarter)
    if one exists, else None. Callers in legacy / base-scenario / SQL paths
    MUST consult this before serving a financial value and either:

    - raise StateLockViolation, or
    - return a 409 with a redirect to /api/re/v2/authoritative-state/...

    See docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariants 1 and 2).
    """
    if entity_type not in _TABLE_BY_ENTITY:
        raise ValueError(f"Unsupported authoritative entity type: {entity_type}")
    table_name, id_col = _TABLE_BY_ENTITY[entity_type]
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT snapshot_version
            FROM {table_name}
            WHERE {id_col} = %s::uuid
              AND quarter = %s
              AND promotion_state = 'released'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(entity_id), quarter),
        )
        row = cur.fetchone()
    return row["snapshot_version"] if row else None


def assert_released_state_lock(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
) -> None:
    """Raise StateLockViolation if a released snapshot exists for the
    (entity, quarter). Use this in legacy code paths that compute
    financial values to make sure they yield to the snapshot.
    """
    snapshot_version = released_state_lock(
        entity_type=entity_type,
        entity_id=entity_id,
        quarter=quarter,
    )
    if snapshot_version is not None:
        raise StateLockViolation(
            entity_type=entity_type,
            entity_id=entity_id,
            quarter=quarter,
            snapshot_version=snapshot_version,
        )

_PROMOTION_ORDER = {
    "draft_audit": 0,
    "verified": 1,
    "released": 2,
}


def _json_default(value: Any) -> Any:
    if isinstance(value, (Decimal, UUID)):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Object of type {type(value)!r} is not JSON serializable")


def _json_dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _normalize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _normalize(v) for k, v in value.items()}
    return value


def _to_decimal(value: Any) -> Decimal:
    if value in (None, "", "null"):
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


def create_snapshot_run(
    *,
    env_id: str,
    business_id: UUID | str,
    snapshot_version: str,
    sample_manifest: dict[str, Any],
    artifact_root: str,
    created_by: str = "meridian_authoritative_runner",
    methodology_version: str = "meridian_authoritative_snapshot_v1",
) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_authoritative_snapshot_run (
              env_id, business_id, snapshot_version, methodology_version,
              sample_manifest, artifact_root, created_by
            )
            VALUES (
              %s, %s::uuid, %s, %s,
              %s::jsonb, %s, %s
            )
            RETURNING audit_run_id
            """,
            (
                env_id,
                str(business_id),
                snapshot_version,
                methodology_version,
                _json_dumps(sample_manifest),
                artifact_root,
                created_by,
            ),
        )
        row = cur.fetchone()
        return row["audit_run_id"]


def persist_authoritative_state(
    *,
    entity_type: str,
    audit_run_id: UUID | str,
    snapshot_version: str,
    env_id: str,
    business_id: UUID | str,
    entity_id: UUID | str,
    quarter: str,
    trust_status: str,
    breakpoint_layer: str | None,
    canonical_metrics: dict[str, Any],
    display_metrics: dict[str, Any],
    null_reasons: dict[str, Any],
    formulas: dict[str, Any],
    provenance: list[dict[str, Any]],
    source_row_refs: list[dict[str, Any]],
    artifact_paths: dict[str, Any],
    fund_id: UUID | str | None = None,
    investment_id: UUID | str | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    inputs_hash: str | None = None,
) -> UUID:
    if entity_type not in _TABLE_BY_ENTITY:
        raise ValueError(f"Unsupported authoritative entity type: {entity_type}")
    table_name, id_col = _TABLE_BY_ENTITY[entity_type]

    if entity_type == "asset":
        entity_columns = "fund_id, investment_id, asset_id"
        entity_placeholders = "%s::uuid, %s::uuid, %s::uuid"
        entity_params: tuple[Any, ...] = (
            str(fund_id) if fund_id else None,
            str(investment_id) if investment_id else None,
            str(entity_id),
        )
    elif entity_type == "investment":
        entity_columns = "fund_id, investment_id"
        entity_placeholders = "%s::uuid, %s::uuid"
        entity_params = (
            str(fund_id) if fund_id else None,
            str(entity_id),
        )
    else:
        entity_columns = "fund_id"
        entity_placeholders = "%s::uuid"
        entity_params = (str(entity_id),)

    with get_cursor() as cur:
        cur.execute(
            f"""
            INSERT INTO {table_name} (
              audit_run_id, snapshot_version, env_id, business_id,
              {entity_columns}, quarter, period_start, period_end,
              trust_status, breakpoint_layer, canonical_metrics, display_metrics,
              null_reasons, formulas, provenance, source_row_refs, artifact_paths,
              inputs_hash
            )
            VALUES (
              %s::uuid, %s, %s, %s::uuid,
              {entity_placeholders}, %s, %s, %s,
              %s, %s, %s::jsonb, %s::jsonb,
              %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb,
              %s
            )
            RETURNING id
            """,
            (
                str(audit_run_id),
                snapshot_version,
                env_id,
                str(business_id),
                *entity_params,
                quarter,
                period_start,
                period_end,
                trust_status,
                breakpoint_layer,
                _json_dumps(canonical_metrics),
                _json_dumps(display_metrics),
                _json_dumps(null_reasons),
                _json_dumps(formulas),
                _json_dumps(provenance),
                _json_dumps(source_row_refs),
                _json_dumps(artifact_paths),
                inputs_hash,
            ),
        )
        return cur.fetchone()["id"]


def persist_fund_gross_to_net_bridge(
    *,
    audit_run_id: UUID | str,
    snapshot_version: str,
    env_id: str,
    business_id: UUID | str,
    fund_id: UUID | str,
    quarter: str,
    trust_status: str,
    breakpoint_layer: str | None,
    gross_return_amount: Decimal | str | None,
    management_fees: Decimal | str | None,
    fund_expenses: Decimal | str | None,
    net_return_amount: Decimal | str | None,
    bridge_items: list[dict[str, Any]],
    null_reasons: dict[str, Any],
    formulas: dict[str, Any],
    provenance: list[dict[str, Any]],
    source_row_refs: list[dict[str, Any]],
    artifact_paths: dict[str, Any],
    inputs_hash: str | None = None,
) -> UUID:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO re_authoritative_fund_gross_to_net_qtr (
              audit_run_id, snapshot_version, env_id, business_id, fund_id, quarter,
              trust_status, breakpoint_layer, gross_return_amount, management_fees,
              fund_expenses, net_return_amount, bridge_items, null_reasons,
              formulas, provenance, source_row_refs, artifact_paths, inputs_hash
            )
            VALUES (
              %s::uuid, %s, %s, %s::uuid, %s::uuid, %s,
              %s, %s, %s, %s,
              %s, %s, %s::jsonb, %s::jsonb,
              %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s
            )
            RETURNING id
            """,
            (
                str(audit_run_id),
                snapshot_version,
                env_id,
                str(business_id),
                str(fund_id),
                quarter,
                trust_status,
                breakpoint_layer,
                str(gross_return_amount) if gross_return_amount is not None else None,
                str(management_fees) if management_fees is not None else None,
                str(fund_expenses) if fund_expenses is not None else None,
                str(net_return_amount) if net_return_amount is not None else None,
                _json_dumps(bridge_items),
                _json_dumps(null_reasons),
                _json_dumps(formulas),
                _json_dumps(provenance),
                _json_dumps(source_row_refs),
                _json_dumps(artifact_paths),
                inputs_hash,
            ),
        )
        return cur.fetchone()["id"]


class PromotionGateError(ValueError):
    """Raised when promote_snapshot_version rejects a release because of
    a gross_irr trust failure on one or more funds in the snapshot."""

    def __init__(self, snapshot_version: str, violations: list[dict[str, Any]]):
        self.snapshot_version = snapshot_version
        self.violations = violations
        detail = "; ".join(
            f"fund={v['fund_id']} reason={v['reason']}" for v in violations
        )
        super().__init__(
            f"Promotion gate rejected {snapshot_version}: {detail}"
        )


def validate_snapshot_for_release(
    *,
    snapshot_version: str,
) -> dict[str, Any]:
    """Gate promotion to 'released' on IRR correctness per the revised plan.

    Rules (hard failures — block promotion):
      - fund row missing gross_irr
      - gross_irr present but irr_trust_state != "trusted"
      - top-level null_reason present on the fund row

    Rules (informational — do NOT block):
      - net_irr_trust_state == "unavailable" (expected for below-hurdle funds)
      - dscr_trust_state == anything (dscr is informational per plan)

    Returns { ok: bool, violations: [{fund_id, reason, ...}] }
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT
              fund_id::text AS fund_id,
              canonical_metrics,
              null_reasons
            FROM re_authoritative_fund_state_qtr
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        rows = cur.fetchall() or []

    violations: list[dict[str, Any]] = []
    for row in rows:
        fund_id = row["fund_id"]
        cm = row.get("canonical_metrics") or {}
        null_reasons = row.get("null_reasons") or {}
        top_reason = null_reasons.get("state") or null_reasons.get("fund")

        if top_reason:
            violations.append(
                {"fund_id": fund_id, "reason": f"top_null_reason:{top_reason}"}
            )
            continue

        # Belt-and-suspenders scope gate: if canonical_metrics.scope.scope_completeness
        # is 'partial' or 'over_scope', block promotion regardless of IRR trust state.
        # The null_reasons check above catches these too (via state='partial_scope' /
        # 'over_scope'), but this explicit check on the scope field is more descriptive.
        scope_meta = cm.get("scope") or {}
        if isinstance(scope_meta, dict):
            sc = scope_meta.get("scope_completeness")
            if sc == "partial":
                in_scope = scope_meta.get("investment_count", "?")
                expected = scope_meta.get("expected_investment_count", "?")
                violations.append({
                    "fund_id": fund_id,
                    "reason": f"partial_scope:{in_scope}_of_{expected}_investments_included",
                })
                continue
            if sc == "over_scope":
                in_scope = scope_meta.get("investment_count", "?")
                expected = scope_meta.get("expected_investment_count", "?")
                violations.append({
                    "fund_id": fund_id,
                    "reason": f"over_scope:{in_scope}_investments_but_only_{expected}_exist_in_re_investment",
                })
                continue

        gross_irr = cm.get("gross_irr")
        if gross_irr is None:
            violations.append(
                {"fund_id": fund_id, "reason": "missing_gross_irr"}
            )
            continue

        irr_trust = cm.get("irr_trust_state")
        # If the field is present (post-3a snapshots), enforce "trusted".
        # Pre-3a rows without the field fall through (backward compatible).
        if irr_trust is not None and irr_trust != "trusted":
            explicit_reason = cm.get("irr_reason")
            reason = (
                f"irr_untrusted:{explicit_reason}"
                if isinstance(explicit_reason, str) and explicit_reason
                else f"irr_untrusted:{irr_trust}"
            )
            violations.append({"fund_id": fund_id, "reason": reason})
            continue

        # IRR dispersion sanity gate: high-IRR + terminal-value-concentrated funds
        # require explicit acknowledgement before promotion. This prevents a single
        # large terminal value from producing a suspiciously high IRR that goes
        # unreviewed. To pass: set null_reasons.dispersion_acknowledged=true in the
        # snapshot row (or skip_gate=True for manual override).
        try:
            irr_float = float(gross_irr)
        except (TypeError, ValueError):
            irr_float = 0.0
        terminal_value_pct = cm.get("terminal_value_pct")
        if terminal_value_pct is not None:
            try:
                tv_float = float(terminal_value_pct)
            except (TypeError, ValueError):
                tv_float = 0.0
            if irr_float > 0.40 and tv_float > 0.80:
                if not null_reasons.get("dispersion_acknowledged"):
                    violations.append({
                        "fund_id": fund_id,
                        "reason": (
                            f"dispersion_warning_unacknowledged:"
                            f"gross_irr={irr_float:.2%}_terminal_value_pct={tv_float:.2%}."
                            " Set null_reasons.dispersion_acknowledged=true to release."
                        ),
                    })

    return {
        "ok": len(violations) == 0,
        "violations": violations,
        "fund_count_scanned": len(rows),
    }


def promote_snapshot_version(
    *,
    snapshot_version: str,
    target_state: str,
    actor: str,
    findings_summary: dict[str, Any] | None = None,
    skip_gate: bool = False,
) -> None:
    if target_state not in ("verified", "released"):
        raise ValueError(f"Unsupported target_state: {target_state}")

    # Phase 4: IRR-correctness gate for release promotion.
    # Only runs on target="released" so verification (draft → verified)
    # is unaffected. Operators can override with skip_gate=True for
    # documented manual escapes, but the default path enforces the gate.
    if target_state == "released" and not skip_gate:
        gate_result = validate_snapshot_for_release(snapshot_version=snapshot_version)
        if not gate_result["ok"]:
            raise PromotionGateError(snapshot_version, gate_result["violations"])

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT audit_run_id, run_status
            FROM re_authoritative_snapshot_run
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Snapshot version {snapshot_version} not found")

        current_state = row["run_status"]
        if _PROMOTION_ORDER[target_state] <= _PROMOTION_ORDER[current_state]:
            raise ValueError(f"Snapshot {snapshot_version} is already {current_state}")
        if target_state == "released" and current_state != "verified":
            raise ValueError("Only verified snapshot runs may be promoted to released")

        timestamp_col = "verified_at" if target_state == "verified" else "released_at"
        actor_col = "verified_by" if target_state == "verified" else "released_by"
        summary_sql = ", findings_summary = %s::jsonb" if findings_summary is not None else ""
        params: list[Any] = [actor]
        if findings_summary is not None:
            params.append(_json_dumps(findings_summary))
        params.append(snapshot_version)

        cur.execute(
            f"""
            UPDATE re_authoritative_snapshot_run
            SET run_status = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
                {summary_sql}
            WHERE snapshot_version = %s
            """,
            [target_state] + params,
        )

        for table_name in (
            "re_authoritative_asset_state_qtr",
            "re_authoritative_investment_state_qtr",
            "re_authoritative_fund_state_qtr",
            "re_authoritative_fund_gross_to_net_qtr",
        ):
            cur.execute(
                f"""
                UPDATE {table_name}
                SET promotion_state = %s,
                    {timestamp_col} = COALESCE({timestamp_col}, now()),
                    {actor_col} = %s
                WHERE snapshot_version = %s
                """,
                (target_state, actor, snapshot_version),
            )


class ScopedPromotionError(ValueError):
    """Raised when promote_fund_snapshot rejects a release for a specific
    (fund_id, quarter) row within a snapshot_version."""

    def __init__(self, snapshot_version: str, fund_id: str, quarter: str, reason: str):
        self.snapshot_version = snapshot_version
        self.fund_id = fund_id
        self.quarter = quarter
        self.reason = reason
        super().__init__(
            f"Scoped promotion rejected: snapshot={snapshot_version} "
            f"fund={fund_id} quarter={quarter} reason={reason}"
        )


def promote_fund_snapshot(
    *,
    snapshot_version: str,
    fund_id: UUID | str,
    quarter: str,
    target_state: str,
    actor: str,
    findings_summary: dict[str, Any] | None = None,
    skip_gate: bool = False,
) -> dict[str, Any]:
    """Promote exactly one (fund_id, quarter) row within a snapshot_version.

    This is the disciplined per-fund release path. It scopes the IRR gate,
    the promotion UPDATE, and the lineage audit row to the single target row.
    All other (fund_id, quarter) rows in the same snapshot_version are
    untouched — their promotion_state does not change.

    Invariants enforced:
    - Only the exact (snapshot_version, fund_id, quarter) row is mutated.
    - No partial quarter: the quarter filter is an exact match.
    - An audit lineage row records the old released snapshot_version (if any)
      and the new scoped release, tied to (fund_id, quarter).

    Returns a dict with pre/post state for receipt generation.
    """
    if target_state not in ("verified", "released"):
        raise ValueError(f"Unsupported target_state: {target_state!r}")

    fund_id_str = str(fund_id)

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, promotion_state, trust_status,
                   canonical_metrics, null_reasons, audit_run_id
            FROM re_authoritative_fund_state_qtr
            WHERE snapshot_version = %s
              AND fund_id = %s::uuid
              AND quarter = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (snapshot_version, fund_id_str, quarter),
        )
        target_row = cur.fetchone()

    if not target_row:
        raise ScopedPromotionError(
            snapshot_version, fund_id_str, quarter,
            "row_not_found: no matching (snapshot_version, fund_id, quarter) in re_authoritative_fund_state_qtr"
        )

    current_state = target_row["promotion_state"]
    if _PROMOTION_ORDER.get(target_state, -1) <= _PROMOTION_ORDER.get(current_state or "draft_audit", -1):
        raise ScopedPromotionError(
            snapshot_version, fund_id_str, quarter,
            f"already_at_or_past_target: current={current_state} target={target_state}"
        )
    if target_state == "released" and current_state != "verified":
        raise ScopedPromotionError(
            snapshot_version, fund_id_str, quarter,
            f"must_be_verified_first: current={current_state}"
        )

    # Fund-scoped IRR gate — same rules as validate_snapshot_for_release
    # but bounded to this single fund row.
    if target_state == "released" and not skip_gate:
        cm = target_row.get("canonical_metrics") or {}
        null_reasons = target_row.get("null_reasons") or {}
        # A top-level blocking null reason sits under key "state" or "fund"
        # in the null_reasons JSONB, not a dedicated column.
        top_reason = null_reasons.get("state") or null_reasons.get("fund")
        if top_reason:
            raise ScopedPromotionError(
                snapshot_version, fund_id_str, quarter,
                f"gate_fail:top_null_reason={top_reason}"
            )
        # Scope completeness gate — partial or over_scope snapshots must never be promoted.
        scope_meta = cm.get("scope") or {}
        if isinstance(scope_meta, dict):
            sc = scope_meta.get("scope_completeness")
            in_scope = scope_meta.get("investment_count", "?")
            expected = scope_meta.get("expected_investment_count", "?")
            if sc == "partial":
                raise ScopedPromotionError(
                    snapshot_version, fund_id_str, quarter,
                    f"gate_fail:partial_scope={in_scope}_of_{expected}_investments_included",
                )
            if sc == "over_scope":
                raise ScopedPromotionError(
                    snapshot_version, fund_id_str, quarter,
                    f"gate_fail:over_scope={in_scope}_investments_but_only_{expected}_exist_in_re_investment",
                )
        gross_irr = cm.get("gross_irr")
        if gross_irr is None:
            raise ScopedPromotionError(
                snapshot_version, fund_id_str, quarter,
                "gate_fail:missing_gross_irr"
            )
        irr_trust = cm.get("irr_trust_state")
        if irr_trust is not None and irr_trust != "trusted":
            raise ScopedPromotionError(
                snapshot_version, fund_id_str, quarter,
                f"gate_fail:irr_untrusted={irr_trust}"
            )
        # IRR dispersion sanity gate — same rule as validate_snapshot_for_release.
        try:
            irr_float = float(gross_irr)
        except (TypeError, ValueError):
            irr_float = 0.0
        terminal_value_pct = cm.get("terminal_value_pct")
        null_reasons_check = target_row.get("null_reasons") or {}
        if terminal_value_pct is not None:
            try:
                tv_float = float(terminal_value_pct)
            except (TypeError, ValueError):
                tv_float = 0.0
            if irr_float > 0.40 and tv_float > 0.80 and not null_reasons_check.get("dispersion_acknowledged"):
                raise ScopedPromotionError(
                    snapshot_version, fund_id_str, quarter,
                    f"gate_fail:dispersion_warning_unacknowledged:"
                    f"gross_irr={irr_float:.2%}_terminal_value_pct={tv_float:.2%}."
                    " Set null_reasons.dispersion_acknowledged=true to release.",
                )

    # Capture the currently-released snapshot_version for this (fund_id, quarter)
    # before we change anything — used for lineage.
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_version AS old_snapshot_version
            FROM re_authoritative_fund_state_qtr
            WHERE fund_id = %s::uuid
              AND quarter = %s
              AND promotion_state = 'released'
            ORDER BY released_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """,
            (fund_id_str, quarter),
        )
        prior_row = cur.fetchone()
    old_snapshot_version = prior_row["old_snapshot_version"] if prior_row else None

    timestamp_col = "verified_at" if target_state == "verified" else "released_at"
    actor_col = "verified_by" if target_state == "verified" else "released_by"

    with get_cursor() as cur:
        # Promote only the targeted fund row in the fund state table.
        cur.execute(
            f"""
            UPDATE re_authoritative_fund_state_qtr
            SET promotion_state = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
            WHERE snapshot_version = %s
              AND fund_id = %s::uuid
              AND quarter = %s
            """,
            (target_state, actor, snapshot_version, fund_id_str, quarter),
        )

        # Promote the gross-to-net bridge row if it exists for the same scope.
        cur.execute(
            f"""
            UPDATE re_authoritative_fund_gross_to_net_qtr
            SET promotion_state = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
            WHERE snapshot_version = %s
              AND fund_id = %s::uuid
              AND quarter = %s
            """,
            (target_state, actor, snapshot_version, fund_id_str, quarter),
        )

        # Promote investment-level rows that belong to this fund+quarter scope.
        cur.execute(
            f"""
            UPDATE re_authoritative_investment_state_qtr
            SET promotion_state = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
            WHERE snapshot_version = %s
              AND fund_id = %s::uuid
              AND quarter = %s
            """,
            (target_state, actor, snapshot_version, fund_id_str, quarter),
        )

        # Promote asset-level rows that belong to this fund+quarter scope.
        cur.execute(
            f"""
            UPDATE re_authoritative_asset_state_qtr
            SET promotion_state = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
            WHERE snapshot_version = %s
              AND fund_id = %s::uuid
              AND quarter = %s
            """,
            (target_state, actor, snapshot_version, fund_id_str, quarter),
        )

        # Write an audit lineage record to re_authoritative_snapshot_run
        # scoped annotations column (uses jsonb findings_summary field).
        lineage_note = {
            "scope": "fund_only",
            "fund_id": fund_id_str,
            "quarter": quarter,
            "target_state": target_state,
            "actor": actor,
            "old_release_snapshot_version": old_snapshot_version,
            "new_scoped_snapshot_version": snapshot_version,
            **(findings_summary or {}),
        }
        cur.execute(
            """
            UPDATE re_authoritative_snapshot_run
            SET findings_summary = COALESCE(findings_summary, '{}'::jsonb)
                  || %s::jsonb
            WHERE snapshot_version = %s
            """,
            (_json_dumps({"scoped_promotions": [lineage_note]}), snapshot_version),
        )

    return {
        "snapshot_version": snapshot_version,
        "fund_id": fund_id_str,
        "quarter": quarter,
        "target_state": target_state,
        "actor": actor,
        "old_release_snapshot_version": old_snapshot_version,
        "lineage": lineage_note,
    }


def _build_missing_state(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "quarter": quarter,
        "requested_quarter": quarter,
        "period_exact": False,
        "state_origin": "fallback",
        "audit_run_id": None,
        "snapshot_version": None,
        "promotion_state": None,
        "trust_status": "missing_source",
        "breakpoint_layer": None,
        "null_reason": reason,
        "state": None,
        "null_reasons": {"state": reason},
        "formulas": {},
        "provenance": [],
        "artifact_paths": {},
    }


def get_authoritative_state(
    *,
    entity_type: str,
    entity_id: UUID | str,
    quarter: str,
    snapshot_version: str | None = None,
    audit_run_id: UUID | str | None = None,
) -> dict[str, Any]:
    if entity_type not in _TABLE_BY_ENTITY:
        raise ValueError(f"Unsupported authoritative entity type: {entity_type}")
    table_name, id_col = _TABLE_BY_ENTITY[entity_type]

    filters = [f"{id_col} = %s::uuid", "quarter = %s"]
    params: list[Any] = [str(entity_id), quarter]
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if not snapshot_version and not audit_run_id:
        filters.append("promotion_state = 'released'")

    where_sql = " AND ".join(filters)
    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM {table_name}
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        return _build_missing_state(
            entity_type=entity_type,
            entity_id=entity_id,
            quarter=quarter,
            reason="authoritative_state_not_released" if not snapshot_version and not audit_run_id else "authoritative_state_not_found",
        )

    state = {
        "period_start": _normalize(row.get("period_start")),
        "period_end": _normalize(row.get("period_end")),
        "canonical_metrics": _normalize(row.get("canonical_metrics") or {}),
        "display_metrics": _normalize(row.get("display_metrics") or {}),
    }
    if entity_type == "fund":
        bridge = get_fund_gross_to_net_bridge(
            fund_id=entity_id,
            quarter=quarter,
            snapshot_version=row["snapshot_version"],
            audit_run_id=row["audit_run_id"],
        )
        if bridge.get("null_reason") is None:
            state["gross_to_net_bridge"] = {
                "gross_return_amount": bridge.get("gross_return_amount"),
                "management_fees": bridge.get("management_fees"),
                "fund_expenses": bridge.get("fund_expenses"),
                "net_return_amount": bridge.get("net_return_amount"),
                "bridge_items": bridge.get("bridge_items") or [],
                "formulas": bridge.get("formulas") or {},
                "null_reasons": bridge.get("null_reasons") or {},
            }
    returned_quarter = str(row["quarter"])
    return {
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "quarter": returned_quarter,
        "requested_quarter": quarter,
        "period_exact": returned_quarter == quarter,
        "state_origin": "authoritative",
        "audit_run_id": str(row["audit_run_id"]),
        "snapshot_version": row["snapshot_version"],
        "promotion_state": row["promotion_state"],
        "trust_status": row["trust_status"],
        "breakpoint_layer": row.get("breakpoint_layer"),
        "null_reason": None,
        "state": state,
        "null_reasons": _normalize(row.get("null_reasons") or {}),
        "formulas": _normalize(row.get("formulas") or {}),
        "provenance": _normalize(row.get("provenance") or []),
        "artifact_paths": _normalize(row.get("artifact_paths") or {}),
    }


def get_fund_gross_to_net_bridge(
    *,
    fund_id: UUID | str,
    quarter: str,
    snapshot_version: str | None = None,
    audit_run_id: UUID | str | None = None,
) -> dict[str, Any]:
    filters = ["fund_id = %s::uuid", "quarter = %s"]
    params: list[Any] = [str(fund_id), quarter]
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if not snapshot_version and not audit_run_id:
        filters.append("promotion_state = 'released'")

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM re_authoritative_fund_gross_to_net_qtr
            WHERE {" AND ".join(filters)}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        missing_reason = (
            "authoritative_state_not_released"
            if not snapshot_version and not audit_run_id
            else "authoritative_state_not_found"
        )
        return {
            "fund_id": str(fund_id),
            "quarter": quarter,
            "requested_quarter": quarter,
            "period_exact": False,
            "state_origin": "fallback",
            "audit_run_id": None,
            "snapshot_version": None,
            "promotion_state": None,
            "trust_status": "missing_source",
            "breakpoint_layer": None,
            "null_reason": missing_reason,
            "gross_return_amount": None,
            "management_fees": None,
            "fund_expenses": None,
            "net_return_amount": None,
            "bridge_items": [],
            "null_reasons": {"bridge": missing_reason},
            "formulas": {},
            "provenance": [],
            "artifact_paths": {},
        }

    returned_quarter = str(row["quarter"])
    return {
        "fund_id": str(fund_id),
        "quarter": returned_quarter,
        "requested_quarter": quarter,
        "period_exact": returned_quarter == quarter,
        "state_origin": "authoritative",
        "audit_run_id": str(row["audit_run_id"]),
        "snapshot_version": row["snapshot_version"],
        "promotion_state": row["promotion_state"],
        "trust_status": row["trust_status"],
        "breakpoint_layer": row.get("breakpoint_layer"),
        "null_reason": None,
        "gross_return_amount": str(row["gross_return_amount"]) if row.get("gross_return_amount") is not None else None,
        "management_fees": str(row["management_fees"]) if row.get("management_fees") is not None else None,
        "fund_expenses": str(row["fund_expenses"]) if row.get("fund_expenses") is not None else None,
        "net_return_amount": str(row["net_return_amount"]) if row.get("net_return_amount") is not None else None,
        "bridge_items": _normalize(row.get("bridge_items") or []),
        "null_reasons": _normalize(row.get("null_reasons") or {}),
        "formulas": _normalize(row.get("formulas") or {}),
        "provenance": _normalize(row.get("provenance") or []),
        "artifact_paths": _normalize(row.get("artifact_paths") or {}),
    }


def get_snapshot_run(*, audit_run_id: UUID | str | None = None, snapshot_version: str | None = None) -> dict[str, Any]:
    if not audit_run_id and not snapshot_version:
        raise ValueError("Either audit_run_id or snapshot_version is required")

    filters = []
    params: list[Any] = []
    if audit_run_id:
        filters.append("audit_run_id = %s::uuid")
        params.append(str(audit_run_id))
    if snapshot_version:
        filters.append("snapshot_version = %s")
        params.append(snapshot_version)

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT *
            FROM re_authoritative_snapshot_run
            WHERE {" AND ".join(filters)}
            ORDER BY created_at DESC
            LIMIT 1
            """,
            params,
        )
        row = cur.fetchone()

    if not row:
        raise LookupError("Authoritative snapshot run not found")
    return _normalize(dict(row))


def get_released_portfolio_kpis(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (fund_id)
              fund_id::text AS fund_id,
              audit_run_id::text AS audit_run_id,
              snapshot_version,
              promotion_state,
              trust_status,
              breakpoint_layer,
              canonical_metrics,
              null_reasons,
              provenance,
              artifact_paths
            FROM re_authoritative_fund_state_qtr
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND quarter = %s
              AND promotion_state = 'released'
            ORDER BY fund_id, released_at DESC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id), quarter),
        )
        rows = cur.fetchall()

    if not rows:
        return {
            "env_id": str(env_id),
            "business_id": str(business_id),
            "quarter": quarter,
            "effective_quarter": quarter,
            "fund_count": 0,
            "total_commitments": "0",
            "portfolio_nav": None,
            "active_assets": 0,
            "gross_irr": None,
            "net_irr": None,
            "warnings": [f"No released authoritative fund snapshots found for {quarter}."],
            "null_reason": "authoritative_state_not_released",
            "null_reasons": {"portfolio": "authoritative_state_not_released"},
            "provenance": [],
            "artifact_paths": {},
            "audit_run_id": None,
            "snapshot_version": None,
            "promotion_state": None,
            "breakpoint_layer": None,
            "source_snapshots": [],
            "trust_status": "missing_source",
        }

    nav_weighted_gross = Decimal("0")
    nav_weighted_net = Decimal("0")
    nav_base_gross = Decimal("0")
    nav_base_net = Decimal("0")
    total_commitments = Decimal("0")
    portfolio_nav = Decimal("0")
    active_assets = 0
    source_snapshots: list[dict[str, Any]] = []
    breakpoint_layers: list[str] = []
    provenance_rows: list[dict[str, Any]] = []
    artifact_paths: dict[str, Any] = {}
    excluded_funds: list[dict[str, Any]] = []

    for row in rows:
        # Homogeneity gate: exclude funds whose scope is not complete from aggregates.
        # A partial or over_scope fund would silently distort portfolio NAV and IRR.
        cm_check = row.get("canonical_metrics") or {}
        scope_check = cm_check.get("scope") or {}
        sc = scope_check.get("scope_completeness") if isinstance(scope_check, dict) else None
        if sc in ("partial", "over_scope"):
            excluded_funds.append({
                "fund_id": row["fund_id"],
                "reason": f"scope_not_complete:{sc}",
                "snapshot_version": row.get("snapshot_version"),
            })
            continue
        metrics = row.get("canonical_metrics") or {}
        nav_value = _to_decimal(metrics.get("ending_nav") or metrics.get("portfolio_nav"))
        portfolio_nav += nav_value
        total_commitments += _to_decimal(metrics.get("total_committed"))
        active_assets += int(metrics.get("asset_count") or 0)
        if row.get("breakpoint_layer"):
            breakpoint_layers.append(str(row["breakpoint_layer"]))
        provenance_rows.extend(_normalize(row.get("provenance") or []))
        artifact_paths[row["fund_id"]] = _normalize(row.get("artifact_paths") or {})
        source_snapshots.append(
            {
                "fund_id": row["fund_id"],
                "audit_run_id": row.get("audit_run_id"),
                "snapshot_version": row.get("snapshot_version"),
                "promotion_state": row.get("promotion_state"),
                "trust_status": row.get("trust_status"),
            }
        )

        gross_irr = metrics.get("gross_irr")
        if gross_irr is not None and nav_value > 0:
            nav_weighted_gross += _to_decimal(gross_irr) * nav_value
            nav_base_gross += nav_value

        net_irr = metrics.get("net_irr")
        if net_irr is not None and nav_value > 0:
            nav_weighted_net += _to_decimal(net_irr) * nav_value
            nav_base_net += nav_value

    included_rows = [
        row for row in rows
        if row["fund_id"] not in {ef["fund_id"] for ef in excluded_funds}
    ]
    unique_versions = sorted({row["snapshot_version"] for row in included_rows if row.get("snapshot_version")})
    unique_run_ids = sorted({str(row["audit_run_id"]) for row in included_rows if row.get("audit_run_id")})
    mixed_release_states = len(unique_versions) > 1
    per_fund_snapshot_version = {
        row["fund_id"]: row.get("snapshot_version") for row in included_rows
    }
    warnings: list[str] = []
    if mixed_release_states:
        warnings.append(
            "Portfolio contains funds from multiple snapshot_versions. "
            "Aggregate metrics blend methodologies — see per_fund_snapshot_version for breakdown."
        )
    if excluded_funds:
        fund_list = ", ".join(ef["fund_id"] for ef in excluded_funds)
        warnings.append(
            f"Portfolio aggregates exclude {len(excluded_funds)} fund(s) with incomplete scope "
            f"(partial or over_scope): {fund_list}. Correct SELECTED_INVESTMENT_IDS and re-run."
        )
    return {
        "env_id": str(env_id),
        "business_id": str(business_id),
        "quarter": quarter,
        "effective_quarter": quarter,
        "fund_count": len(included_rows),
        "excluded_fund_count": len(excluded_funds),
        "excluded_funds": excluded_funds,
        "total_commitments": str(total_commitments),
        "portfolio_nav": str(portfolio_nav) if portfolio_nav != 0 else None,
        "active_assets": active_assets,
        "gross_irr": str(nav_weighted_gross / nav_base_gross) if nav_base_gross > 0 else None,
        "net_irr": str(nav_weighted_net / nav_base_net) if nav_base_net > 0 else None,
        "warnings": warnings,
        "null_reason": None,
        "null_reasons": {},
        "provenance": provenance_rows,
        "artifact_paths": artifact_paths,
        "audit_run_id": unique_run_ids[0] if len(unique_run_ids) == 1 else None,
        "snapshot_version": unique_versions[0] if len(unique_versions) == 1 else None,
        "mixed_release_states": mixed_release_states,
        "per_fund_snapshot_version": per_fund_snapshot_version,
        "promotion_state": "released",
        "breakpoint_layer": breakpoint_layers[0] if breakpoint_layers else None,
        "source_snapshots": source_snapshots,
        "trust_status": "trusted",
    }


def get_portfolio_authoritative_states(
    *,
    env_id: UUID | str,
    business_id: UUID | str,
    quarter: str,
) -> list[dict[str, Any]]:
    """Return one authoritative-state payload per fund in a single DB round-trip.

    This eliminates the per-fund N+1 pattern in the portfolio list page.
    Each entry in the returned list matches the shape of
    get_authoritative_state(entity_type='fund', ...) so the frontend helper
    can iterate unchanged.

    Only released rows are returned. If no released rows exist for a fund,
    that fund is not in the result — the caller decides how to render
    unavailable. The gross-to-net bridge is NOT attached here (adds a
    second query per fund); the per-fund detail view can still fetch it.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (fund_id)
              fund_id::text AS fund_id,
              audit_run_id::text AS audit_run_id,
              snapshot_version,
              promotion_state,
              trust_status,
              breakpoint_layer,
              quarter,
              period_start,
              period_end,
              canonical_metrics,
              display_metrics,
              null_reasons,
              formulas,
              provenance,
              artifact_paths
            FROM re_authoritative_fund_state_qtr
            WHERE env_id = %s
              AND business_id = %s::uuid
              AND quarter = %s
              AND promotion_state = 'released'
            ORDER BY fund_id, released_at DESC NULLS LAST, created_at DESC
            """,
            (str(env_id), str(business_id), quarter),
        )
        rows = cur.fetchall() or []

    results: list[dict[str, Any]] = []
    for row in rows:
        returned_quarter = str(row["quarter"])
        state = {
            "period_start": _normalize(row.get("period_start")),
            "period_end": _normalize(row.get("period_end")),
            "canonical_metrics": _normalize(row.get("canonical_metrics") or {}),
            "display_metrics": _normalize(row.get("display_metrics") or {}),
        }
        results.append(
            {
                "entity_type": "fund",
                "entity_id": row["fund_id"],
                "quarter": returned_quarter,
                "requested_quarter": quarter,
                "period_exact": returned_quarter == quarter,
                "state_origin": "authoritative",
                "audit_run_id": row["audit_run_id"],
                "snapshot_version": row["snapshot_version"],
                "promotion_state": row["promotion_state"],
                "trust_status": row["trust_status"],
                "breakpoint_layer": row.get("breakpoint_layer"),
                "null_reason": None,
                "state": state,
                "null_reasons": _normalize(row.get("null_reasons") or {}),
                "formulas": _normalize(row.get("formulas") or {}),
                "provenance": _normalize(row.get("provenance") or []),
                "artifact_paths": _normalize(row.get("artifact_paths") or {}),
            }
        )
    return results
