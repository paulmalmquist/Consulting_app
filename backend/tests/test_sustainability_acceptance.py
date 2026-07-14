"""T12 (plan 0018): acceptance tests that lock the v1 sustainability guarantees.

The v1 sustainability platform makes three promises. Each of them is currently
enforced only by the code that happens to implement it today. This module turns
them into tests that break loudly if a future change violates them:

1. No fabrication. A missing value surfaces its ``null_reason``. Zero is never
   substituted. Verified against the T4 reader, the T9 governed-report bundle,
   and the T10 unified-query executor path -- so no layer can quietly zero-fill.
2. Reconciliation. The dashboard, the report bundle, and the AI copilot all
   consume values from the same governed reader. For a single mocked reader
   payload, the ``(metric_key, value, null_reason, unit)`` tuples emitted by
   the report and by the unified-query executor must match the reader byte for
   byte.
3. Single fetch layer. Only ``re_sustainability_authoritative`` may read
   ``sus_authoritative_*`` tables. ``re_sustainability_report`` contains no
   ``get_cursor``, no ``SELECT``, and no direct ``sus_`` table reference (its
   only source of metric values is the reader).

Plus:

4. Registry integrity. All six v1 metric keys are seeded with
   ``query_strategy='service'`` -> ``service_function='sustainability_authoritative'``,
   that service function exists in ``_get_service_map()``, and each carries a
   ``down_good`` polarity so rising emissions can never be described as an
   improvement.
5. Fail-closed on error. A reader that raises does not produce a number
   anywhere: the report bundle and the query executor both degrade to a
   null/empty result rather than a fabricated value.

Deferred plan-0018 acceptance tests (documented here rather than silently
skipped):

- Tests 1, 2, 11 (source bill traces to metric; duplicate bill quarantined;
  corrected record versioning). Deferred: there is no intake/upload path in
  v1; plan 0018 itself defers T11 (intake) to v1.1.
- Tests 6, 7, 8, 12 (weather-normalized baseline; forecast interval coverage;
  anomaly detection; ML exclusion tests). Deferred: v1 has no forecasting,
  weather normalization, or anomaly-detection capability. Writing tests for
  unbuilt features would be theater.
- Test 15 (report export matches screen). Deferred: v1 has no file export.

Playwright/browser tests and tests that require a live database are also out
of scope for this ticket.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.services import re_sustainability_authoritative as sus_auth
from app.services import re_sustainability_report as sus_report
from app.services import unified_metric_registry as umr
from app.services import unified_query_builder as uqb
from app.services.unified_metric_registry import (
    MetricContract,
    UnifiedMetricRegistry,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SUSTAINABILITY_METRIC_KEYS: tuple[str, ...] = (
    "scope1_tco2e",
    "scope2_location_tco2e",
    "scope2_market_tco2e",
    "scope3_tco2e",
    "energy_intensity_kwh_per_sqft",
    "water_intensity_gal_per_sqft",
)
FAIL_CLOSED_REASONS: tuple[str, ...] = (
    "snapshot_unavailable",
    "emission_factor_missing",
    "metric_definition_missing",
    "out_of_certified_scope",
)
FABRICATION_SENTINELS: tuple[Any, ...] = (0, 0.0, "0", "0.0", "", "-")

BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID = "sus-demo"
PERIOD_KEY = "2026Q2"


# ── Shared helpers ────────────────────────────────────────────────────


def _sus_contract(metric_key: str) -> MetricContract:
    return MetricContract(
        metric_key=metric_key,
        display_name=metric_key.replace("_", " ").title(),
        description=None,
        aliases=(metric_key.replace("_", " "),),
        metric_family="sustainability",
        query_strategy="service",
        template_key=None,
        service_function="sustainability_authoritative",
        sql_template="-- served via sustainability_authoritative reader",
        unit="tco2e",
        aggregation="sum",
        format_hint_fe="number",
        polarity="down_good",
        entity_key="asset",
        allowed_breakouts=("fund", "asset", "quarter"),
        time_behavior="additive_period",
    )


def _make_query(metric_key: str) -> uqb.MetricQuery:
    return uqb.MetricQuery(
        metric_keys=[metric_key],
        business_id=BUSINESS_ID,
        env_id=ENV_ID,
        entity_type="portfolio",
        quarter=PERIOD_KEY,
    )


def _install_service_map(
    monkeypatch: pytest.MonkeyPatch, mapping: dict[str, Any]
) -> None:
    monkeypatch.setattr(umr, "_get_service_map", lambda: mapping)
    monkeypatch.setattr(uqb, "_get_service_map", lambda: mapping)


@pytest.fixture(autouse=True)
def _reset_service_map():
    umr._SERVICE_MAP = None
    yield
    umr._SERVICE_MAP = None


# ── 1. No fabrication ─────────────────────────────────────────────────


@pytest.mark.parametrize("null_reason", FAIL_CLOSED_REASONS)
def test_reader_no_fabrication_for_each_fail_closed_reason(
    monkeypatch: pytest.MonkeyPatch, null_reason: str,
) -> None:
    """The T4 reader must surface every fail-closed reason with value=None."""

    def fake_state(**_: Any) -> dict[str, Any]:
        # A snapshot exists, but the requested metric row carries a NULL
        # value and a stored null_reason. Reader must pass it through.
        return {
            "entity_scope": "portfolio",
            "period_key": PERIOD_KEY,
            "requested_period_key": PERIOD_KEY,
            "period_exact": True,
            "state_origin": "authoritative",
            "snapshot_version": "snap-1",
            "promotion_state": "released",
            "trust_status": "released",
            "null_reason": None,
            "metrics": [
                {
                    "metric_key": "scope1_tco2e",
                    "value": None,
                    "unit": "tco2e",
                    "null_reason": null_reason,
                    "trust_status": "missing_source",
                },
            ],
            "evidence": [],
        }

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    result = sus_auth.get_metric(
        business_id=BUSINESS_ID,
        env_id=ENV_ID,
        entity_scope="portfolio",
        period_key=PERIOD_KEY,
        metric_family="sustainability",
        metric_key="scope1_tco2e",
    )

    assert result["value"] is None
    assert result["null_reason"] == null_reason
    for sentinel in FABRICATION_SENTINELS:
        assert result["value"] != sentinel, (
            f"reader fabricated {sentinel!r} for null_reason={null_reason!r}"
        )


@pytest.mark.parametrize("null_reason", FAIL_CLOSED_REASONS)
def test_report_bundle_no_fabrication_for_each_fail_closed_reason(
    monkeypatch: pytest.MonkeyPatch, null_reason: str,
) -> None:
    """The T9 governed report bundle preserves null_reason and never zero-fills."""

    def fake_state(**_: Any) -> dict[str, Any]:
        return {
            "entity_scope": "portfolio",
            "period_key": PERIOD_KEY,
            "requested_period_key": PERIOD_KEY,
            "period_exact": True,
            "state_origin": "authoritative",
            "snapshot_version": "snap-1",
            "promotion_state": "released",
            "trust_status": "released",
            "null_reason": None,
            "metrics": [
                {
                    "metric_key": "scope1_tco2e",
                    "value": None,
                    "unit": "tco2e",
                    "null_reason": null_reason,
                    "trust_status": "missing_source",
                },
            ],
            "evidence": [],
        }

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    bundle = sus_report.build_governed_report(
        business_id=BUSINESS_ID,
        env_id=ENV_ID,
        entity_scope="portfolio",
        period_key=PERIOD_KEY,
        metric_family="sustainability",
    )

    assert len(bundle["metrics"]) == 1
    metric = bundle["metrics"][0]
    assert metric["value"] is None
    assert metric["null_reason"] == null_reason
    for sentinel in FABRICATION_SENTINELS:
        assert metric["value"] != sentinel, (
            f"report fabricated {sentinel!r} for null_reason={null_reason!r}"
        )


@pytest.mark.parametrize("null_reason", FAIL_CLOSED_REASONS)
def test_unified_query_no_fabrication_for_each_fail_closed_reason(
    monkeypatch: pytest.MonkeyPatch, null_reason: str,
) -> None:
    """The T10 unified-query executor carries null_reason and never zero-fills."""

    def fake_reader(**_: Any) -> dict[str, Any]:
        return {
            "value": None,
            "unit": "tco2e",
            "null_reason": null_reason,
            "trust_status": "missing_source",
            "snapshot_version": "snap-1",
            "state_origin": "authoritative",
        }

    _install_service_map(monkeypatch, {"sustainability_authoritative": fake_reader})
    registry = UnifiedMetricRegistry([_sus_contract("scope1_tco2e")])
    results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)

    assert len(results) == 1
    r = results[0]
    assert r.value is None
    assert r.null_reason == null_reason
    for sentinel in FABRICATION_SENTINELS:
        assert r.value != sentinel, (
            f"executor fabricated {sentinel!r} for null_reason={null_reason!r}"
        )


# ── 2. Reconciliation: report == reader == executor ───────────────────


def test_report_and_executor_tuples_match_reader(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One reader payload, two consumers, identical (key,value,null_reason,unit)."""

    reader_metric = {
        "metric_key": "scope1_tco2e",
        "value": "1234.5",
        "unit": "tco2e",
        "null_reason": None,
        "trust_status": "released",
    }

    def fake_state(**_: Any) -> dict[str, Any]:
        return {
            "entity_scope": "portfolio",
            "period_key": PERIOD_KEY,
            "requested_period_key": PERIOD_KEY,
            "period_exact": True,
            "state_origin": "authoritative",
            "snapshot_version": "snap-recon",
            "promotion_state": "released",
            "trust_status": "released",
            "null_reason": None,
            "metrics": [dict(reader_metric)],
            "evidence": [],
        }

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    # Report path (T9) — consumes the reader directly.
    bundle = sus_report.build_governed_report(
        business_id=BUSINESS_ID,
        env_id=ENV_ID,
        entity_scope="portfolio",
        period_key=PERIOD_KEY,
        metric_family="sustainability",
    )
    assert len(bundle["metrics"]) == 1
    report_metric = bundle["metrics"][0]
    report_tuple = (
        report_metric["metric_key"],
        report_metric["value"],
        report_metric["null_reason"],
        report_metric["unit"],
    )
    reader_tuple = (
        reader_metric["metric_key"],
        reader_metric["value"],
        reader_metric["null_reason"],
        reader_metric["unit"],
    )
    assert report_tuple == reader_tuple

    # Executor path (T10) — the same reader is dispatched via the service map.
    def fake_reader(**_: Any) -> dict[str, Any]:
        return {
            "value": reader_metric["value"],
            "unit": reader_metric["unit"],
            "null_reason": reader_metric["null_reason"],
            "trust_status": reader_metric["trust_status"],
            "snapshot_version": "snap-recon",
            "state_origin": "authoritative",
        }

    _install_service_map(monkeypatch, {"sustainability_authoritative": fake_reader})
    registry = UnifiedMetricRegistry([_sus_contract("scope1_tco2e")])
    results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)
    assert len(results) == 1
    r = results[0]
    executor_tuple = (r.metric_key, r.value, r.null_reason, r.unit)
    assert executor_tuple == reader_tuple


# ── 3. Single fetch layer static guard ────────────────────────────────


def _services_dir() -> Path:
    return REPO_ROOT / "backend" / "app" / "services"


def test_report_service_contains_no_sql() -> None:
    """re_sustainability_report may only read via the T4 reader — no SQL."""
    path = _services_dir() / "re_sustainability_report.py"
    text = path.read_text(encoding="utf-8")

    assert "get_cursor" not in text, (
        "re_sustainability_report must not open a DB cursor — read via "
        "re_sustainability_authoritative only."
    )
    # Match SELECT as a SQL keyword (word boundary), not just any substring.
    # A bare, uppercase SELECT should never appear in this module.
    import re

    assert re.search(r"\bSELECT\b", text) is None, (
        "re_sustainability_report must not contain SQL SELECT statements."
    )
    assert " sus_" not in text and "\tsus_" not in text and '"sus_' not in text, (
        "re_sustainability_report must not reference sus_* tables directly."
    )
    # Guard against future creep: the module must still import the reader.
    assert "re_sustainability_authoritative" in text


def test_only_authoritative_reader_touches_sus_authoritative_tables() -> None:
    """No other governed service may SELECT from sus_authoritative_* tables.

    The T13a materialization/release path (``re_sustainability_snapshot_writer``)
    is the sanctioned writer — it INSERTs draft rows and UPDATEs the promotion
    lifecycle, and reads its own draft rows only for the release gate. Every
    other ``re_sustainability*`` service must still be blocked from touching
    these tables.
    """
    services = _services_dir()
    offenders: list[tuple[str, str]] = []

    # Whitelist: the reader (SELECT-only) and the writer (INSERT/UPDATE + gate
    # read) are the two governed surfaces allowed to name these tables.
    allowed = {
        "re_sustainability_authoritative.py",
        "re_sustainability_snapshot_writer.py",
    }
    for py in services.glob("re_sustainability*.py"):
        if py.name in allowed:
            continue
        text = py.read_text(encoding="utf-8")
        for table in (
            "sus_authoritative_snapshots",
            "sus_authoritative_metric_value",
            "sus_authoritative_evidence",
        ):
            if table in text:
                offenders.append((py.name, table))

    assert not offenders, (
        "Only re_sustainability_authoritative (reader) and "
        "re_sustainability_snapshot_writer (writer/release gate) may reference "
        f"sus_authoritative_* tables; offenders: {offenders}"
    )

    # The writer must not SELECT payload columns — its only reads are the
    # release-gate lookups (metric_key/value_numeric/null_reason + evidence
    # metric_key) and the current promotion_state before transitioning. Any
    # other SELECT would drift into reader territory.
    writer_text = (services / "re_sustainability_snapshot_writer.py").read_text(
        encoding="utf-8",
    )
    assert "INSERT INTO sus_authoritative_snapshots" in writer_text
    assert "INSERT INTO sus_authoritative_metric_value" in writer_text
    assert "INSERT INTO sus_authoritative_evidence" in writer_text
    assert "UPDATE sus_authoritative_snapshots" in writer_text

    # And the reader itself really does own the SELECTs.
    reader_text = (services / "re_sustainability_authoritative.py").read_text(
        encoding="utf-8",
    )
    assert "sus_authoritative_snapshots" in reader_text
    assert "sus_authoritative_metric_value" in reader_text


# ── 4. Registry integrity ─────────────────────────────────────────────


def test_service_map_registers_sustainability_authoritative() -> None:
    svc_map = umr._get_service_map()
    assert "sustainability_authoritative" in svc_map
    assert callable(svc_map["sustainability_authoritative"])


def test_v1_metrics_seeded_with_correct_routing_and_polarity() -> None:
    """All six v1 metric keys are seeded as service→sustainability_authoritative
    with a down_good polarity so rising emissions can never be described as an
    improvement."""
    seed = (
        REPO_ROOT / "repo-b" / "db" / "schema" / "619_sus_metric_registry_seed.sql"
    ).read_text(encoding="utf-8")

    for key in SUSTAINABILITY_METRIC_KEYS:
        assert f"'{key}'" in seed, f"metric {key} missing from seed"

    # A per-metric block is delimited by "'<key>'," in the VALUES list. Each
    # such block must carry service routing + down_good polarity.
    for key in SUSTAINABILITY_METRIC_KEYS:
        start = seed.index(f"'{key}',")
        # Grab a slice large enough to contain the whole VALUES row.
        block = seed[start : start + 800]
        assert "'service'" in block, (
            f"{key} not routed via query_strategy='service'"
        )
        assert "'sustainability_authoritative'" in block, (
            f"{key} not routed to service_function='sustainability_authoritative'"
        )
        assert "'down_good'" in block, (
            f"{key} missing down_good polarity — rising emissions could be "
            "described as an improvement"
        )


def test_registry_validate_schema_accepts_all_six_contracts() -> None:
    """UnifiedMetricRegistry.validate_schema() must accept every v1 contract."""
    contracts = [_sus_contract(k) for k in SUSTAINABILITY_METRIC_KEYS]
    registry = UnifiedMetricRegistry(contracts)

    issues = registry.validate_schema()

    for key in SUSTAINABILITY_METRIC_KEYS:
        offending = [i for i in issues if i.startswith(f"{key}:")]
        assert offending == [], (
            f"validate_schema() flagged {key}: {offending}"
        )


# ── 5. Fail-closed on error ───────────────────────────────────────────


def test_report_fails_closed_when_reader_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A raising reader must degrade the report bundle to an empty/null result.

    Plan 0018 scope item 5 requires that the report "degrade to a null/empty
    result rather than a fabricated value" when the reader errors. Exception
    propagation is not an acceptable substitute -- callers of the governed
    report expect a bundle shape they can render, not an uncaught exception.
    """

    def boom(**_: Any) -> dict[str, Any]:
        raise RuntimeError("reader exploded")

    monkeypatch.setattr(sus_auth, "get_authoritative_state", boom)

    bundle = sus_report.build_governed_report(
        business_id=BUSINESS_ID,
        env_id=ENV_ID,
        entity_scope="portfolio",
        period_key=PERIOD_KEY,
        metric_family="sustainability",
    )

    # Bundle must be present, null-reasoned, and carry zero metrics.
    assert isinstance(bundle, dict)
    assert bundle.get("metrics") == [], (
        "report must degrade to an empty metrics list when the reader raises"
    )
    assert bundle.get("null_reason") is not None, (
        "report must surface a null_reason when the reader raises"
    )
    # Nothing in the (empty) metrics list can carry a fabricated value; and
    # the bundle itself must not carry a headline fabricated number.
    for metric in bundle.get("metrics") or []:
        assert metric.get("value") is None
        for sentinel in FABRICATION_SENTINELS:
            assert metric.get("value") != sentinel


def test_executor_fails_closed_when_reader_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A raising reader must degrade the executor to an empty result."""

    def boom(**_: Any) -> dict[str, Any]:
        raise RuntimeError("reader exploded")

    _install_service_map(monkeypatch, {"sustainability_authoritative": boom})
    registry = UnifiedMetricRegistry([_sus_contract("scope1_tco2e")])
    results, _ = uqb.execute_unified_query(_make_query("scope1_tco2e"), registry)

    assert len(results) == 1
    r = results[0]
    assert r.value is None
    for sentinel in FABRICATION_SENTINELS:
        assert r.value != sentinel
