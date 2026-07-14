"""Sustainability released-demo snapshot seed (plan 0018 T13b).

Materializes exactly one governed ``released`` sustainability snapshot for a
demo environment by driving the sanctioned T13a materialization/release path
(``re_sustainability_snapshot_writer``) — never by writing directly to the
``sus_authoritative_*`` tables. The demo therefore exercises the same chain the
product relies on in production:

    create_snapshot -> persist_metric_values -> persist_evidence
                    -> promote_snapshot(verified)
                    -> promote_snapshot(released)  # runs the release gate

The snapshot is deterministic and byte-reproducible across runs: fixed
``snapshot_version``, fixed ids, fixed metric rows, no ``now()``-derived data.

It contains the three cases the platform must be able to tell apart:

- **A valid measured metric** — a real value with evidence behind it.
- **A legitimate measured zero** — ``value = 0``, ``null_reason = None``.
  Must render as ``0``, not as "unavailable".
- **An unavailable metric** — ``value = None`` with a ``null_reason`` set
  (``emission_factor_missing``). Must render as the reason, never as ``0``.

Idempotency contract: re-running the seed after the snapshot is released is a
no-op — it does not raise, does not duplicate, and does not attempt to mutate
the released row (the T3 trigger would reject that anyway). A ``reseed(...)``
path exists for issuing a **new** ``snapshot_version`` instead of mutating a
released one, because that is the correct authoritative behavior for
corrections.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services import re_sustainability_snapshot_writer as writer


DEMO_BUSINESS_ID: str = "a1b2c3d4-0001-0001-0001-000000000001"
DEMO_ENV_ID: str = "sus-demo"
DEMO_ENTITY_SCOPE: str = "portfolio"
DEMO_PERIOD_KEY: str = "2026Q1"
DEMO_METRIC_FAMILY: str = "sustainability"
DEMO_SNAPSHOT_VERSION: str = "sus-demo-2026Q1-001"
DEMO_FORMULA_ID: str = "sus.snapshot.v1"
DEMO_INPUT_HASH: str = "sha256:sus-demo-2026Q1-001-fixed"


# ── Deterministic demo facts ──────────────────────────────────────────
#
# A handful of facilities for one period. Fixed values, no randomness. These
# are the "source facts" the snapshot is materialized from; the seed does not
# recompute anything, it hands the pre-aggregated rows to the writer so the
# release path is exercised end-to-end.

@dataclass(frozen=True)
class DemoMetric:
    metric_key: str
    value: Decimal | None
    unit: str
    null_reason: str | None
    evidence_sources: tuple[tuple[str, str], ...]  # (source_table, source_row_ref)


DEMO_METRICS: tuple[DemoMetric, ...] = (
    # (1) A valid measured metric — a real value with evidence behind it.
    DemoMetric(
        metric_key="scope1_tco2e",
        value=Decimal("1245.30"),
        unit="tco2e",
        null_reason=None,
        evidence_sources=(
            ("sus_utility_bill", "demo-nat-gas-2026Q1-facility-a"),
            ("sus_utility_bill", "demo-nat-gas-2026Q1-facility-b"),
        ),
    ),
    DemoMetric(
        metric_key="scope2_location_tco2e",
        value=Decimal("842.10"),
        unit="tco2e",
        null_reason=None,
        evidence_sources=(
            ("sus_utility_bill", "demo-electric-2026Q1-facility-a"),
            ("sus_utility_bill", "demo-electric-2026Q1-facility-b"),
        ),
    ),
    # (2) A legitimate measured zero — the portfolio's market-based scope 2
    # emissions really are zero this period (100% renewable PPA + RECs).
    # Must render as 0, not as "unavailable".
    DemoMetric(
        metric_key="scope2_market_tco2e",
        value=Decimal("0"),
        unit="tco2e",
        null_reason=None,
        evidence_sources=(
            ("sus_rec_certificate", "demo-rec-2026Q1-portfolio"),
        ),
    ),
    # (3) An unavailable metric — scope 3 has no emission factor set loaded
    # for the demo period, so we cannot stand behind a number. Must render
    # as the null_reason, never as 0.
    DemoMetric(
        metric_key="scope3_tco2e",
        value=None,
        unit="tco2e",
        null_reason="emission_factor_missing",
        evidence_sources=(),
    ),
    DemoMetric(
        metric_key="energy_intensity_kwh_per_sqft",
        value=Decimal("22.70"),
        unit="kwh_per_sqft",
        null_reason=None,
        evidence_sources=(
            ("sus_utility_bill", "demo-electric-2026Q1-facility-a"),
            ("sus_utility_bill", "demo-electric-2026Q1-facility-b"),
        ),
    ),
    DemoMetric(
        metric_key="water_intensity_gal_per_sqft",
        value=Decimal("18.40"),
        unit="gal_per_sqft",
        null_reason=None,
        evidence_sources=(
            ("sus_utility_bill", "demo-water-2026Q1-facility-a"),
        ),
    ),
)


def _metric_value_rows(env_id: str, business_id: str) -> list[dict[str, Any]]:
    """Build the ``sus_authoritative_metric_value`` payloads for the writer."""
    return [
        {
            "env_id": env_id,
            "business_id": business_id,
            "metric_key": m.metric_key,
            "value_numeric": m.value,
            "unit": m.unit,
            "null_reason": m.null_reason,
            "trust_status": "released" if m.value is not None else "missing_source",
        }
        for m in DEMO_METRICS
    ]


def _evidence_rows(env_id: str, business_id: str) -> list[dict[str, Any]]:
    """Build the ``sus_authoritative_evidence`` payloads for the writer.

    Only valued metrics get evidence rows — the T13a release gate requires
    every valued metric to be traceable, but an unavailable metric (value is
    None + null_reason set) is not a released number and needs no source row.
    """
    rows: list[dict[str, Any]] = []
    for m in DEMO_METRICS:
        if m.value is None:
            continue
        for source_table, source_row_ref in m.evidence_sources:
            rows.append({
                "env_id": env_id,
                "business_id": business_id,
                "metric_key": m.metric_key,
                "source_table": source_table,
                "source_row_ref": source_row_ref,
                "formula_id": DEMO_FORMULA_ID,
            })
    return rows


def _existing_promotion_state(snapshot_version: str) -> str | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT promotion_state FROM sus_authoritative_snapshots "
            "WHERE snapshot_version = %s",
            (snapshot_version,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return row.get("promotion_state")


def seed_sustainability_demo_snapshot(
    *,
    business_id: UUID | str = DEMO_BUSINESS_ID,
    env_id: str = DEMO_ENV_ID,
    entity_scope: str = DEMO_ENTITY_SCOPE,
    period_key: str = DEMO_PERIOD_KEY,
    metric_family: str = DEMO_METRIC_FAMILY,
    snapshot_version: str = DEMO_SNAPSHOT_VERSION,
    actor: str = "sus-demo-seed",
) -> dict[str, Any]:
    """Materialize + release the demo sustainability snapshot.

    Idempotent: if a snapshot with ``snapshot_version`` is already ``released``,
    this returns ``{"status": "skipped", ...}`` and performs no writes. The
    T3 trigger blocks mutation of released rows, so the seed detects and
    respects that state rather than attempting an update.
    """
    existing_state = _existing_promotion_state(snapshot_version)
    if existing_state == "released":
        return {
            "status": "skipped",
            "reason": "already_released",
            "snapshot_version": snapshot_version,
        }

    if existing_state is None:
        writer.create_snapshot(
            business_id=business_id,
            env_id=env_id,
            entity_scope=entity_scope,
            period_key=period_key,
            metric_family=metric_family,
            snapshot_version=snapshot_version,
            state_origin="materialized_demo",
            formula_id=DEMO_FORMULA_ID,
            input_hash=DEMO_INPUT_HASH,
            period_exact=True,
            trust_status="released",
            created_by=actor,
        )
        writer.persist_metric_values(
            snapshot_version=snapshot_version,
            values=_metric_value_rows(env_id, str(business_id)),
        )
        writer.persist_evidence(
            snapshot_version=snapshot_version,
            rows=_evidence_rows(env_id, str(business_id)),
        )

    if existing_state in (None, "draft_audit"):
        writer.promote_snapshot(
            snapshot_version=snapshot_version, to_state="verified", actor=actor
        )
    if existing_state in (None, "draft_audit", "verified"):
        writer.promote_snapshot(
            snapshot_version=snapshot_version, to_state="released", actor=actor
        )

    return {
        "status": "released",
        "snapshot_version": snapshot_version,
        "business_id": str(business_id),
        "env_id": env_id,
        "entity_scope": entity_scope,
        "period_key": period_key,
        "metric_family": metric_family,
        "metric_count": len(DEMO_METRICS),
    }


def reseed(
    *,
    force_version: str,
    business_id: UUID | str = DEMO_BUSINESS_ID,
    env_id: str = DEMO_ENV_ID,
    actor: str = "sus-demo-reseed",
) -> dict[str, Any]:
    """Mint a new released snapshot version instead of mutating the existing one.

    Corrections to an authoritative sustainability snapshot are made by
    releasing a **new** ``snapshot_version``, never by rewriting the released
    row (which the T3 trigger blocks). ``force_version`` must be a fresh
    identifier the caller chooses; passing the current
    ``DEMO_SNAPSHOT_VERSION`` here would fall back to the no-op idempotent
    path rather than mutate the released row.
    """
    if not force_version or not force_version.strip():
        raise ValueError("reseed() requires a non-empty force_version")
    return seed_sustainability_demo_snapshot(
        business_id=business_id,
        env_id=env_id,
        snapshot_version=force_version,
        actor=actor,
    )
