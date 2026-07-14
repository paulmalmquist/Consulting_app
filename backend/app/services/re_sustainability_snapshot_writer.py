"""Sustainability authoritative-state writer (materialization + release path).

Mirrors ``re_authoritative_snapshots`` (REPE) for the sustainability
authoritative tables introduced by ``repo-b/db/schema/618_sus_authoritative.sql``
(plan 0018 T3), matching the shape that
``re_sustainability_authoritative.get_authoritative_state`` (T4) already reads.

The writer works with the T3 triggers, not around them:

- ``sus_authoritative_snapshots`` payloads are immutable after INSERT. Only the
  promotion lifecycle columns (``promotion_state``, ``verified_at/by``,
  ``released_at/by``, ``updated_at``) may be UPDATEd. Corrections mint a new
  ``snapshot_version``; nothing here ever rewrites a payload.
- Released rows cannot be mutated or deleted.
- Promotion follows ``draft_audit -> verified -> released``.

The value/null invariant (a metric row carries a ``value_numeric`` xor a
``null_reason``, never both, never neither) is enforced at write time so a
legitimate measured zero stays distinguishable from an unavailable metric.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

from app.db import get_cursor


_PROMOTION_ORDER = {
    "draft_audit": 0,
    "verified": 1,
    "released": 2,
}

_VALID_STATES = ("draft_audit", "verified", "released")


class SustainabilityPromotionGateError(ValueError):
    """Raised when ``validate_snapshot_for_release`` rejects a snapshot.

    A snapshot is unfit to release when any of the following hold:

    - it has no ``sus_authoritative_metric_value`` rows;
    - any metric row carries both a ``value_numeric`` and a ``null_reason``,
      or carries neither (the value/null invariant);
    - a metric row with a non-null ``value_numeric`` has no matching
      ``sus_authoritative_evidence`` row (a released number must be
      traceable).
    """

    def __init__(self, snapshot_version: str, violations: list[dict[str, Any]]):
        self.snapshot_version = snapshot_version
        self.violations = violations
        detail = "; ".join(
            f"{v.get('metric_key', '<snapshot>')}:{v['reason']}" for v in violations
        )
        super().__init__(
            f"Sustainability promotion gate rejected {snapshot_version}: {detail}"
        )


def _has_value(value: Any) -> bool:
    """A metric row is considered to carry a numeric value whenever
    ``value_numeric`` is not None. Zero is a legitimate measured value and
    must NOT be treated as absent."""
    return value is not None


def create_snapshot(
    *,
    business_id: UUID | str,
    env_id: str,
    entity_scope: str,
    period_key: str,
    metric_family: str,
    snapshot_version: str,
    state_origin: str | None = None,
    formula_id: str | None = None,
    input_hash: str | None = None,
    period_exact: bool = False,
    trust_status: str = "untrusted",
    created_by: str | None = None,
) -> str:
    """INSERT a complete ``sus_authoritative_snapshots`` header in
    ``promotion_state='draft_audit'``.

    Idempotent on ``snapshot_version``: a repeat call with the same version
    is a no-op that returns the existing ``snapshot_version`` rather than
    raising on the unique constraint.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO sus_authoritative_snapshots (
              snapshot_version, env_id, business_id, entity_scope, period_key,
              metric_family, promotion_state, state_origin, trust_status,
              formula_id, input_hash, period_exact, created_by
            )
            VALUES (
              %s, %s, %s::uuid, %s, %s,
              %s, 'draft_audit', %s, %s,
              %s, %s, %s, %s
            )
            ON CONFLICT (snapshot_version) DO NOTHING
            RETURNING snapshot_version
            """,
            (
                snapshot_version,
                env_id,
                str(business_id),
                entity_scope,
                period_key,
                metric_family,
                state_origin,
                trust_status,
                formula_id,
                input_hash,
                period_exact,
                created_by,
            ),
        )
        row = cur.fetchone()
        if row and row.get("snapshot_version"):
            return row["snapshot_version"]
        return snapshot_version


def _validate_value_null_invariant(row: dict[str, Any]) -> None:
    """Enforce the value/null invariant on a single metric-value row.

    A row must carry a ``value_numeric`` XOR a ``null_reason``. Both or
    neither is a bug: it blurs the distinction between a measured zero and
    an unavailable metric everywhere downstream. Raise rather than persist.
    """
    value = row.get("value_numeric")
    null_reason = row.get("null_reason")
    has_value = _has_value(value)
    has_reason = null_reason is not None and null_reason != ""
    metric_key = row.get("metric_key")
    if has_value and has_reason:
        raise ValueError(
            f"metric_key={metric_key!r}: value_numeric and null_reason are "
            "both set — a row must carry one or the other, never both."
        )
    if not has_value and not has_reason:
        raise ValueError(
            f"metric_key={metric_key!r}: neither value_numeric nor null_reason "
            "is set — an unavailable metric must carry a null_reason."
        )


def persist_metric_values(
    *,
    snapshot_version: str,
    values: list[dict[str, Any]],
) -> int:
    """INSERT ``sus_authoritative_metric_value`` rows for a snapshot.

    Each row dict must contain ``env_id``, ``business_id``, ``metric_key``,
    ``unit`` (optional), ``value_numeric`` or ``null_reason`` (exactly one),
    and ``trust_status`` (optional; defaults to ``untrusted``).

    The value/null invariant is enforced before any INSERT: a row that
    carries both a value and a ``null_reason`` (or neither) is rejected.
    """
    for row in values:
        _validate_value_null_invariant(row)

    if not values:
        return 0

    inserted = 0
    with get_cursor() as cur:
        for row in values:
            value = row.get("value_numeric")
            null_reason = row.get("null_reason")
            cur.execute(
                """
                INSERT INTO sus_authoritative_metric_value (
                  snapshot_version, env_id, business_id, metric_key,
                  value_numeric, unit, null_reason, promotion_state, trust_status
                )
                VALUES (
                  %s, %s, %s::uuid, %s,
                  %s, %s, %s, 'draft_audit', %s
                )
                """,
                (
                    snapshot_version,
                    row["env_id"],
                    str(row["business_id"]),
                    row["metric_key"],
                    str(value) if isinstance(value, Decimal) else value,
                    row.get("unit"),
                    null_reason,
                    row.get("trust_status", "untrusted"),
                ),
            )
            inserted += 1
    return inserted


def persist_evidence(
    *,
    snapshot_version: str,
    rows: list[dict[str, Any]],
) -> int:
    """INSERT ``sus_authoritative_evidence`` provenance rows for a snapshot.

    Each row dict must contain ``env_id``, ``business_id``, ``metric_key``,
    and ``source_table``. ``source_row_ref``, ``emission_factor_set_id``,
    ``ingestion_run_id``, and ``formula_id`` are optional.
    """
    if not rows:
        return 0

    inserted = 0
    with get_cursor() as cur:
        for row in rows:
            efs_id = row.get("emission_factor_set_id")
            ing_id = row.get("ingestion_run_id")
            cur.execute(
                """
                INSERT INTO sus_authoritative_evidence (
                  snapshot_version, env_id, business_id, metric_key,
                  source_table, source_row_ref,
                  emission_factor_set_id, ingestion_run_id, formula_id
                )
                VALUES (
                  %s, %s, %s::uuid, %s,
                  %s, %s,
                  %s, %s, %s
                )
                """,
                (
                    snapshot_version,
                    row["env_id"],
                    str(row["business_id"]),
                    row["metric_key"],
                    row["source_table"],
                    row.get("source_row_ref"),
                    str(efs_id) if efs_id is not None else None,
                    str(ing_id) if ing_id is not None else None,
                    row.get("formula_id"),
                ),
            )
            inserted += 1
    return inserted


def _iter_gate_violations(
    metric_rows: Iterable[dict[str, Any]],
    evidence_metric_keys: set[str],
) -> list[dict[str, Any]]:
    violations: list[dict[str, Any]] = []
    for row in metric_rows:
        metric_key = row.get("metric_key")
        value = row.get("value_numeric")
        null_reason = row.get("null_reason")
        has_value = _has_value(value)
        has_reason = null_reason is not None and null_reason != ""
        if has_value and has_reason:
            violations.append({
                "metric_key": metric_key,
                "reason": "value_and_null_reason_both_set",
            })
            continue
        if not has_value and not has_reason:
            violations.append({
                "metric_key": metric_key,
                "reason": "value_and_null_reason_both_missing",
            })
            continue
        if has_value and metric_key not in evidence_metric_keys:
            violations.append({
                "metric_key": metric_key,
                "reason": "valued_metric_missing_evidence",
            })
    return violations


def validate_snapshot_for_release(*, snapshot_version: str) -> None:
    """Gate promotion to ``released``.

    Raises ``SustainabilityPromotionGateError`` when the snapshot is unfit:

    - no metric-value rows exist for the snapshot;
    - any metric row carries both a ``value_numeric`` and a ``null_reason``
      (or neither);
    - a metric row with a non-null ``value_numeric`` has no matching
      evidence row.

    Returns ``None`` on success; the caller may then promote.
    """
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, value_numeric, null_reason
            FROM sus_authoritative_metric_value
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        metric_rows = cur.fetchall() or []

        cur.execute(
            """
            SELECT DISTINCT metric_key
            FROM sus_authoritative_evidence
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        evidence_rows = cur.fetchall() or []

    if not metric_rows:
        raise SustainabilityPromotionGateError(
            snapshot_version,
            [{"reason": "no_metric_value_rows"}],
        )

    evidence_metric_keys = {r["metric_key"] for r in evidence_rows if r.get("metric_key")}
    violations = _iter_gate_violations(metric_rows, evidence_metric_keys)
    if violations:
        raise SustainabilityPromotionGateError(snapshot_version, violations)


def promote_snapshot(
    *,
    snapshot_version: str,
    to_state: str,
    actor: str | None = None,
) -> str:
    """Advance ``promotion_state`` for the snapshot header and its child rows.

    Runs the release gate before any promotion to ``released``. Refuses an
    invalid transition (``draft_audit -> released`` skips ``verified``; a
    backward move from ``verified`` to ``draft_audit`` is rejected) rather
    than relying on the DB trigger alone.
    """
    if to_state not in ("verified", "released"):
        raise ValueError(f"Unsupported target state: {to_state!r}")

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT promotion_state
            FROM sus_authoritative_snapshots
            WHERE snapshot_version = %s
            """,
            (snapshot_version,),
        )
        row = cur.fetchone()

    if not row:
        raise LookupError(f"Snapshot version {snapshot_version} not found")

    current_state = row["promotion_state"]
    if current_state not in _VALID_STATES:
        raise ValueError(
            f"Snapshot {snapshot_version} has unrecognized promotion_state "
            f"{current_state!r}"
        )
    if _PROMOTION_ORDER[to_state] <= _PROMOTION_ORDER[current_state]:
        raise ValueError(
            f"Invalid promotion transition {current_state!r} -> {to_state!r} "
            f"for snapshot {snapshot_version}"
        )
    if to_state == "released" and current_state != "verified":
        raise ValueError(
            f"Snapshot {snapshot_version} must be 'verified' before release "
            f"(currently {current_state!r})"
        )

    if to_state == "released":
        validate_snapshot_for_release(snapshot_version=snapshot_version)

    timestamp_col = "verified_at" if to_state == "verified" else "released_at"
    actor_col = "verified_by" if to_state == "verified" else "released_by"

    with get_cursor() as cur:
        cur.execute(
            f"""
            UPDATE sus_authoritative_snapshots
            SET promotion_state = %s,
                {timestamp_col} = COALESCE({timestamp_col}, now()),
                {actor_col} = %s
            WHERE snapshot_version = %s
            """,
            (to_state, actor, snapshot_version),
        )
        cur.execute(
            """
            UPDATE sus_authoritative_metric_value
            SET promotion_state = %s
            WHERE snapshot_version = %s
            """,
            (to_state, snapshot_version),
        )

    return to_state
