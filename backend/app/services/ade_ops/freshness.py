"""Freshness reads for Winston-owned durable data products (ADE Ops PR 2).

`assess_freshness` becomes real here: for a *known* durable data product we read
its authoritative as-of / status from the product's own durable freshness
contract, compute an age, classify, and recommend a cadence. For an unknown or
cloud-platform product we fail closed (`data_source_not_configured`) — we never
fabricate a timestamp.

PR 2 wires exactly one real source: the Telemetry pipeline-status handshake
(`tel_pipeline_status`: status fresh|stale|failed + as_of_ts + reason), which is
a purpose-built durable freshness contract. The product registry below is the
extension point: later PRs add more durable products (REPE authoritative
snapshots, etc.) and — separately, in PR 3 — cloud-platform adapters.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class FreshnessReading:
    """A real freshness read from a durable product. No fabricated fields."""

    product_id: str
    status: str               # the product's own status (fresh|stale|failed|…)
    as_of: datetime | None    # authoritative as-of timestamp
    age_seconds: float | None
    detail: str | None        # the product's own reason, verbatim
    source: str               # the durable table/contract this came from


# Per-product recommended cadence (seconds) — declared, business-impact-aware.
# Used to phrase a recommendation; never used to invent an observed value.
_DEFAULT_CADENCE_SECONDS = 3600  # hourly default for an operational stream


def _age_seconds(as_of: datetime | None) -> float | None:
    if as_of is None:
        return None
    now = datetime.now(timezone.utc)
    ref = as_of if as_of.tzinfo else as_of.replace(tzinfo=timezone.utc)
    return max(0.0, (now - ref).total_seconds())


def read_telemetry_pipeline(product_id: str, env_id: str, business_id: str,
                            surface: str = "stream_ingest") -> FreshnessReading | None:
    """Read tel_pipeline_status for a telemetry surface. Returns None when the
    table/row is absent (pre-migration / no such surface) — caller fails closed."""
    from app.db import get_telemetry_cursor as get_cursor

    with get_cursor() as cur:
        cur.execute(
            """SELECT status, as_of_ts, reason FROM tel_pipeline_status
               WHERE env_id = %s AND business_id = %s AND surface = %s""",
            (env_id, str(business_id), surface),
        )
        row = cur.fetchone()
    if row is None:
        return None
    as_of = row.get("as_of_ts")
    return FreshnessReading(
        product_id=product_id,
        status=row.get("status") or "unknown",
        as_of=as_of,
        age_seconds=_age_seconds(as_of),
        detail=row.get("reason"),
        source="tel_pipeline_status",
    )


# Registry of durable data products ADE Ops can read in PR 1+2. Keyed by the
# product_id a caller passes as `table_name`/`data_product_id`. Each entry knows
# how to read its own durable freshness contract + a recommended cadence.
@dataclass(frozen=True)
class DurableProduct:
    product_id: str
    label: str
    reader: str               # which reader fn to use
    surface: str | None
    cadence_seconds: int
    business_impact: str      # short, honest note for the recommendation


DURABLE_PRODUCTS: dict[str, DurableProduct] = {
    "telemetry.stream_ingest": DurableProduct(
        product_id="telemetry.stream_ingest",
        label="Telemetry stream ingest (bronze→silver→gold)",
        reader="telemetry_pipeline",
        surface="stream_ingest",
        cadence_seconds=300,  # a live operational stream wants minute-scale freshness
        business_impact="Powers Mission Control + monitoring; stale ingest hides current anomalies.",
    ),
}


def resolve_product(product_id: str | None) -> DurableProduct | None:
    if not product_id:
        return None
    return DURABLE_PRODUCTS.get(product_id)


def read_product(product: DurableProduct, env_id: str, business_id: str) -> FreshnessReading | None:
    if product.reader == "telemetry_pipeline":
        return read_telemetry_pipeline(product.product_id, env_id, business_id, product.surface or "stream_ingest")
    return None


def recommend_cadence(reading: FreshnessReading, product: DurableProduct) -> tuple[str, str]:
    """(recommendation, confidence) — phrased from the real read; never invented.

    The recommendation references the product's declared target cadence and the
    observed age; it does not assert a value the read did not provide.
    """
    target = product.cadence_seconds
    if reading.age_seconds is None:
        return ("As-of timestamp unavailable; cannot assess drift against the "
                f"target cadence ({target}s).", "low")
    if reading.status == "failed":
        return (f"Pipeline reports failed ({reading.detail or 'no reason given'}); "
                "refresh is not completing — investigate before relying on this product.", "high")
    if reading.status == "stale" or reading.age_seconds > 2 * target:
        return (f"Data is {int(reading.age_seconds)}s old vs a {target}s target "
                f"({product.business_impact}). Recommend restoring the {target}s refresh.", "high")
    return (f"Fresh: {int(reading.age_seconds)}s old, within the {target}s target. "
            "No cadence change recommended.", "medium")
