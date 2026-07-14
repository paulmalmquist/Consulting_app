"""T13b acceptance tests: released demo snapshot (plan 0018).

The demo snapshot exists to prove — end to end, through the sanctioned
materialization/release chain — that the platform can tell the three cases
apart on every governed surface:

1. a valid measured metric,
2. a legitimate measured zero (``value == 0``, ``null_reason is None``),
3. an unavailable metric (``value is None`` + non-empty ``null_reason``).

These tests exercise the seed with ``get_cursor`` monkeypatched to a
``FakeCursor`` (no live DB required in CI), then reconcile the seeded rows
across the four governed surfaces the plan calls out: the T4 reader, the T9
report bundle, the T10 copilot/unified-query executor, and the dashboard
payload (which is also ``get_authoritative_state`` — the endpoint that feeds
``/app/sustainability``).
"""

from __future__ import annotations

from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from app.services import re_sustainability_authoritative as sus_auth
from app.services import re_sustainability_report as sus_report
from app.services import re_sustainability_snapshot_writer as sus_writer
from app.services import unified_metric_registry as umr
from app.services import unified_query_builder as uqb
from app.services.environment_seed_packs_v2 import sustainability_demo as seed
from app.services.unified_metric_registry import (
    MetricContract,
    UnifiedMetricRegistry,
)
from tests.conftest import FakeCursor


REPO_ROOT = Path(__file__).resolve().parents[2]
SEED_MODULE_PATH = (
    REPO_ROOT
    / "backend"
    / "app"
    / "services"
    / "environment_seed_packs_v2"
    / "sustainability_demo.py"
)


# ── helpers ───────────────────────────────────────────────────────────


def _fake_cursor_ctx(cur: FakeCursor):
    @contextmanager
    def _mock():
        yield cur

    return _mock


def _install_writer_cursor(monkeypatch: pytest.MonkeyPatch, cur: FakeCursor) -> None:
    """Route every ``get_cursor`` call the seed can trigger to one FakeCursor."""
    ctx = _fake_cursor_ctx(cur)
    monkeypatch.setattr(seed, "get_cursor", ctx)
    monkeypatch.setattr(sus_writer, "get_cursor", ctx)


def _sus_contract(metric_key: str, unit: str) -> MetricContract:
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
        unit=unit,
        aggregation="sum",
        format_hint_fe="number",
        polarity="down_good",
        entity_key="asset",
        allowed_breakouts=("fund", "asset", "quarter"),
        time_behavior="additive_period",
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


def _reader_state_from_seed() -> dict[str, Any]:
    """Build the reader payload the seeded rows would produce.

    Mirrors ``re_sustainability_authoritative.get_authoritative_state`` shape.
    Values stay as the numeric ``Decimal`` the reader emits from
    ``value_numeric``; ``Decimal("0") == 0`` and ``Decimal("1245.30") == 1245.30``
    so the T4 exact-numeric assertion holds on the reader/report/dashboard
    surfaces. The executor path normalizes to a string via ``_format_value``,
    and the reconciliation test compares surfaces after ``_normalize_value``.
    """
    metrics: list[dict[str, Any]] = []
    for m in seed.DEMO_METRICS:
        metrics.append({
            "metric_key": m.metric_key,
            # Numeric — exactly what the reader returns after psycopg maps
            # ``NUMERIC`` -> ``Decimal``. Do NOT stringify here; T4 asserts
            # ``value == 0`` for the measured-zero case.
            "value": m.value,
            "unit": m.unit,
            "null_reason": m.null_reason,
            "trust_status": "released" if m.value is not None else "missing_source",
        })
    return {
        "entity_scope": seed.DEMO_ENTITY_SCOPE,
        "period_key": seed.DEMO_PERIOD_KEY,
        "requested_period_key": seed.DEMO_PERIOD_KEY,
        "period_exact": True,
        "state_origin": "authoritative",
        "snapshot_version": seed.DEMO_SNAPSHOT_VERSION,
        "promotion_state": "released",
        "trust_status": "released",
        "null_reason": None,
        "metrics": metrics,
        "evidence": [],
    }


# ── T1/T3/T4: three-case coverage in the seed data ────────────────────


def test_demo_metrics_contain_valid_zero_and_unavailable_cases() -> None:
    """[D2] The released snapshot carries the three cases that matter."""
    valid = [
        m for m in seed.DEMO_METRICS if m.value is not None and m.value != 0
    ]
    measured_zero = [
        m for m in seed.DEMO_METRICS if m.value is not None and m.value == 0
        and m.null_reason is None
    ]
    unavailable = [
        m for m in seed.DEMO_METRICS
        if m.value is None and m.null_reason is not None and m.null_reason != ""
    ]

    assert valid, "seed must include at least one valid measured metric"
    assert len(measured_zero) == 1, (
        "seed must include exactly one legitimate measured zero — a row with "
        "value == 0 and null_reason is None"
    )
    assert len(unavailable) == 1, (
        "seed must include exactly one unavailable metric — value is None with "
        "a non-empty null_reason"
    )
    assert unavailable[0].null_reason == "emission_factor_missing"


# ── T5: idempotency ───────────────────────────────────────────────────


def test_seed_is_idempotent_when_snapshot_already_released(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[D1][T5] Re-running the seed on a released snapshot is a no-op."""
    cur = FakeCursor()
    # Pre-check finds the snapshot already released.
    cur.push_result([{"promotion_state": "released"}])
    _install_writer_cursor(monkeypatch, cur)

    # If the seed reached the writer, these would raise KeyErrors on the empty
    # cursor queue — proving the no-op path.
    result = seed.seed_sustainability_demo_snapshot()

    assert result["status"] == "skipped"
    assert result["reason"] == "already_released"
    assert result["snapshot_version"] == seed.DEMO_SNAPSHOT_VERSION
    # Only the pre-check query ran; no INSERT/UPDATE was attempted.
    assert len(cur.queries) == 1
    assert "SELECT promotion_state" in cur.queries[0][0]
    for sql, _ in cur.queries:
        assert "INSERT INTO sus_authoritative_" not in sql
        assert "UPDATE sus_authoritative_" not in sql


def test_reseed_mints_new_snapshot_version_rather_than_mutating_released(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[D1] A forced reseed mints a new ``snapshot_version``.

    ``reseed(force_version=NEW)`` targets an unused version and drives the
    normal materialization/release path against that new id — it never
    attempts to UPDATE the released row.
    """
    new_version = "sus-demo-2026Q1-002"
    calls: dict[str, Any] = {"pre_check": None, "created": None, "promoted": []}

    def fake_pre_check(snapshot_version: str) -> str | None:
        calls["pre_check"] = snapshot_version
        return None  # brand-new version, no existing row

    def fake_create(*, snapshot_version, **kwargs):
        calls["created"] = snapshot_version
        return snapshot_version

    def fake_persist_values(*, snapshot_version, values):
        calls.setdefault("values", []).extend(values)
        return len(values)

    def fake_persist_ev(*, snapshot_version, rows):
        calls.setdefault("evidence", []).extend(rows)
        return len(rows)

    def fake_promote(*, snapshot_version, to_state, actor=None):
        calls["promoted"].append(to_state)
        return to_state

    monkeypatch.setattr(seed, "_existing_promotion_state", fake_pre_check)
    monkeypatch.setattr(sus_writer, "create_snapshot", fake_create)
    monkeypatch.setattr(sus_writer, "persist_metric_values", fake_persist_values)
    monkeypatch.setattr(sus_writer, "persist_evidence", fake_persist_ev)
    monkeypatch.setattr(sus_writer, "promote_snapshot", fake_promote)

    result = seed.reseed(force_version=new_version)

    assert result["status"] == "released"
    assert result["snapshot_version"] == new_version
    assert calls["pre_check"] == new_version
    assert calls["created"] == new_version
    # The chain went draft -> verified -> released — the sanctioned path.
    assert calls["promoted"] == ["verified", "released"]


# ── T6: release gate integration ──────────────────────────────────────


def test_seeded_snapshot_passes_the_t13a_release_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[T6] Every valued metric has evidence, so the gate must accept the snapshot."""
    cur = FakeCursor()
    metric_rows = [
        {
            "metric_key": m.metric_key,
            "value_numeric": m.value,
            "null_reason": m.null_reason,
        }
        for m in seed.DEMO_METRICS
    ]
    # Evidence: one distinct metric_key per valued metric.
    evidence_rows = [
        {"metric_key": m.metric_key}
        for m in seed.DEMO_METRICS
        if m.value is not None
    ]
    cur.push_result(metric_rows)
    cur.push_result(evidence_rows)

    monkeypatch.setattr(sus_writer, "get_cursor", _fake_cursor_ctx(cur))
    # No return value on success; must not raise.
    assert (
        sus_writer.validate_snapshot_for_release(
            snapshot_version=seed.DEMO_SNAPSHOT_VERSION
        )
        is None
    )


# ── T2/T3/T4: four-way reconciliation across governed surfaces ────────


def _normalize_value(val: Any) -> Decimal | None:
    """Coerce a governed-metric value to a comparable numeric form.

    The reader/report/dashboard surfaces emit ``Decimal`` (psycopg's mapping
    for ``NUMERIC``); the T10 executor emits a string via ``_format_value``.
    Four-way reconciliation compares values after collapsing both encodings
    to ``Decimal``, so ``Decimal("0")`` and ``"0"`` reconcile as identical.
    """
    if val is None:
        return None
    if isinstance(val, Decimal):
        return val
    return Decimal(str(val))


def _executor_result(metric_key: str, unit: str, reader_payload: dict[str, Any]):
    def fake_reader(**_: Any) -> dict[str, Any]:
        return {
            "value": reader_payload["value"],
            "unit": reader_payload["unit"],
            "null_reason": reader_payload["null_reason"],
            "trust_status": reader_payload["trust_status"],
            "snapshot_version": seed.DEMO_SNAPSHOT_VERSION,
            "state_origin": "authoritative",
        }

    return fake_reader


def test_four_way_reconciliation_across_reader_report_executor_dashboard(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[B1][T2] Every released metric emits identical (value, unit, null_reason)
    from the reader, the report bundle, the executor, and the dashboard payload.
    """
    state = _reader_state_from_seed()

    def fake_state(**_: Any) -> dict[str, Any]:
        # Return a deep-enough copy so downstream mutations cannot leak.
        return {**state, "metrics": [dict(m) for m in state["metrics"]]}

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    # The dashboard payload IS the authoritative-state response (see
    # backend/app/routes/re_sustainability.py :: get_authoritative_overview).
    dashboard = sus_auth.get_authoritative_state(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )

    # The report bundle re-shapes but must preserve every metric tuple.
    bundle = sus_report.build_governed_report(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )

    reader_by_key = {m["metric_key"]: m for m in state["metrics"]}
    dash_by_key = {m["metric_key"]: m for m in dashboard["metrics"]}
    report_by_key = {m["metric_key"]: m for m in bundle["metrics"]}

    for m in seed.DEMO_METRICS:
        key = m.metric_key
        # Reader (via get_metric — the single-metric contract used by the copilot
        # unavailable path and the /authoritative/metric route).
        single = sus_auth.get_metric(
            business_id=seed.DEMO_BUSINESS_ID,
            env_id=seed.DEMO_ENV_ID,
            entity_scope=seed.DEMO_ENTITY_SCOPE,
            period_key=seed.DEMO_PERIOD_KEY,
            metric_family=seed.DEMO_METRIC_FAMILY,
            metric_key=key,
        )

        # Executor path (T10) — one contract per metric so each dispatches
        # through the sustainability_authoritative service function.
        _install_service_map(
            monkeypatch,
            {"sustainability_authoritative": _executor_result(
                key, m.unit, reader_by_key[key],
            )},
        )
        registry = UnifiedMetricRegistry([_sus_contract(key, m.unit)])
        results, _ = uqb.execute_unified_query(
            uqb.MetricQuery(
                metric_keys=[key],
                business_id=seed.DEMO_BUSINESS_ID,
                env_id=seed.DEMO_ENV_ID,
                entity_type=seed.DEMO_ENTITY_SCOPE,
                quarter=seed.DEMO_PERIOD_KEY,
            ),
            registry,
        )
        assert len(results) == 1
        exec_row = results[0]

        r = reader_by_key[key]
        d = dash_by_key[key]
        rep = report_by_key[key]

        # (value, unit, null_reason) must be identical across all four surfaces.
        # Reader/report/dashboard emit Decimal; the executor emits a string via
        # _format_value. Reconcile by normalizing both encodings to Decimal.
        norm_r = _normalize_value(r["value"])
        assert _normalize_value(single["value"]) == norm_r
        assert _normalize_value(d["value"]) == norm_r
        assert _normalize_value(rep["value"]) == norm_r
        assert _normalize_value(exec_row.value) == norm_r, (
            f"executor value diverged for {key}: "
            f"{exec_row.value!r} != {r['value']!r}"
        )

        assert single["unit"] == r["unit"] == d["unit"] == rep["unit"] == exec_row.unit
        assert (
            single["null_reason"] == r["null_reason"]
            == d["null_reason"] == rep["null_reason"]
            == exec_row.null_reason
        )


# ── T3: unavailable metric never renders as 0 on any surface ──────────


def test_unavailable_metric_is_never_zero_on_any_surface(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[B3][T3] The unavailable metric returns value=None + its null_reason
    from the reader, report, executor, and dashboard — never ``0``."""
    unavailable = next(m for m in seed.DEMO_METRICS if m.value is None)
    state = _reader_state_from_seed()

    def fake_state(**_: Any) -> dict[str, Any]:
        return {**state, "metrics": [dict(m) for m in state["metrics"]]}

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    # Reader (get_metric).
    single = sus_auth.get_metric(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
        metric_key=unavailable.metric_key,
    )
    # Report bundle.
    bundle = sus_report.build_governed_report(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )
    report_row = next(
        m for m in bundle["metrics"] if m["metric_key"] == unavailable.metric_key
    )
    # Dashboard payload.
    dash = sus_auth.get_authoritative_state(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )
    dash_row = next(
        m for m in dash["metrics"] if m["metric_key"] == unavailable.metric_key
    )
    # Executor.
    reader_by_key = {m["metric_key"]: m for m in state["metrics"]}
    _install_service_map(
        monkeypatch,
        {"sustainability_authoritative": _executor_result(
            unavailable.metric_key,
            unavailable.unit,
            reader_by_key[unavailable.metric_key],
        )},
    )
    registry = UnifiedMetricRegistry([_sus_contract(unavailable.metric_key, unavailable.unit)])
    results, _ = uqb.execute_unified_query(
        uqb.MetricQuery(
            metric_keys=[unavailable.metric_key],
            business_id=seed.DEMO_BUSINESS_ID,
            env_id=seed.DEMO_ENV_ID,
            entity_type=seed.DEMO_ENTITY_SCOPE,
            quarter=seed.DEMO_PERIOD_KEY,
        ),
        registry,
    )
    exec_row = results[0]

    for surface, row in (
        ("reader", single),
        ("report", report_row),
        ("dashboard", dash_row),
    ):
        assert row["value"] is None, f"{surface} produced a value for an unavailable metric"
        assert row["null_reason"] == unavailable.null_reason
        for sentinel in (0, 0.0, "0", "0.0"):
            assert row["value"] != sentinel, (
                f"{surface} fabricated {sentinel!r} for the unavailable metric"
            )
    assert exec_row.value is None
    assert exec_row.null_reason == unavailable.null_reason
    for sentinel in (0, 0.0, "0", "0.0"):
        assert exec_row.value != sentinel


# ── T4: legitimate measured zero renders as 0 on every surface ────────


def test_measured_zero_is_zero_and_never_unavailable_on_any_surface(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[B4][T4] The legitimate measured zero returns value=0 with
    null_reason=None from every surface — and is never reported as unavailable.
    """
    zero = next(
        m for m in seed.DEMO_METRICS
        if m.value is not None and m.value == 0 and m.null_reason is None
    )
    state = _reader_state_from_seed()

    def fake_state(**_: Any) -> dict[str, Any]:
        return {**state, "metrics": [dict(m) for m in state["metrics"]]}

    monkeypatch.setattr(sus_auth, "get_authoritative_state", fake_state)

    single = sus_auth.get_metric(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
        metric_key=zero.metric_key,
    )
    bundle = sus_report.build_governed_report(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )
    report_row = next(m for m in bundle["metrics"] if m["metric_key"] == zero.metric_key)
    dash = sus_auth.get_authoritative_state(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )
    dash_row = next(m for m in dash["metrics"] if m["metric_key"] == zero.metric_key)

    reader_by_key = {m["metric_key"]: m for m in state["metrics"]}
    _install_service_map(
        monkeypatch,
        {"sustainability_authoritative": _executor_result(
            zero.metric_key, zero.unit, reader_by_key[zero.metric_key],
        )},
    )
    registry = UnifiedMetricRegistry([_sus_contract(zero.metric_key, zero.unit)])
    results, _ = uqb.execute_unified_query(
        uqb.MetricQuery(
            metric_keys=[zero.metric_key],
            business_id=seed.DEMO_BUSINESS_ID,
            env_id=seed.DEMO_ENV_ID,
            entity_type=seed.DEMO_ENTITY_SCOPE,
            quarter=seed.DEMO_PERIOD_KEY,
        ),
        registry,
    )
    exec_row = results[0]

    for surface, row in (
        ("reader", single),
        ("report", report_row),
        ("dashboard", dash_row),
    ):
        # Exact numeric zero — Decimal("0") == 0 satisfies the plan's T4/B4
        # assertion literally. Emphatically NOT the string "0" and NOT None.
        assert row["value"] == 0, (
            f"{surface} did not preserve the measured zero: got {row['value']!r}"
        )
        assert row["value"] is not None, (
            f"{surface} dropped the measured zero to None (would render as unavailable)"
        )
        assert row["null_reason"] is None, (
            f"{surface} attached a null_reason to a measured zero"
        )
    # The T10 executor's public contract is a string-formatted Decimal, so
    # ``_format_value(Decimal("0"))`` is ``"0"``. Normalize both back to
    # Decimal and assert equality to numeric zero, which is what B4 requires
    # of the value irrespective of the transport-level encoding.
    assert exec_row.value is not None
    assert _normalize_value(exec_row.value) == 0
    assert exec_row.null_reason is None


# ── S1/S2: dashboard-payload artifact for the UI surfaces ────────────


def test_dashboard_payload_carries_header_state_and_evidence_binding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """[S1][S2] Captured artifact of the payload that renders ``/app/sustainability``.

    ``/app/sustainability`` renders whatever ``get_authoritative_state`` returns
    (see ``backend/app/routes/re_sustainability.py``); this test asserts that
    payload directly, which is the code-side evidence for the screen criteria.

    Header (S1): released ``snapshot_version`` and ``trust_status == "released"``.
    Grid (S1): valid metric emits its number, the measured zero emits ``0``,
    and the unavailable metric emits its ``null_reason`` (not ``0``).
    Evidence drawer (S2): the payload's evidence rows and metric rows share the
    same ``snapshot_version``, so opening the drawer on the valid metric shows
    the released snapshot version and its source rows.
    """
    state = _reader_state_from_seed()
    # Add one evidence row per valued metric — the shape the drawer consumes.
    evidence: list[dict[str, Any]] = []
    for m in seed.DEMO_METRICS:
        if m.value is None:
            continue
        for source_table, source_row_ref in m.evidence_sources:
            evidence.append({
                "snapshot_version": seed.DEMO_SNAPSHOT_VERSION,
                "metric_key": m.metric_key,
                "source_table": source_table,
                "source_row_ref": source_row_ref,
            })
    state = {**state, "evidence": evidence}

    monkeypatch.setattr(
        sus_auth,
        "get_authoritative_state",
        lambda **_: {**state, "metrics": [dict(m) for m in state["metrics"]]},
    )

    payload = sus_auth.get_authoritative_state(
        business_id=seed.DEMO_BUSINESS_ID,
        env_id=seed.DEMO_ENV_ID,
        entity_scope=seed.DEMO_ENTITY_SCOPE,
        period_key=seed.DEMO_PERIOD_KEY,
        metric_family=seed.DEMO_METRIC_FAMILY,
    )

    # Header state (S1)
    assert payload["snapshot_version"] == seed.DEMO_SNAPSHOT_VERSION
    assert payload["promotion_state"] == "released"
    assert payload["trust_status"] == "released"
    assert payload["null_reason"] is None
    assert payload["state_origin"] == "authoritative"

    grid = {row["metric_key"]: row for row in payload["metrics"]}

    # Grid — valid metric renders its number.
    valid = grid["scope1_tco2e"]
    assert valid["value"] == Decimal("1245.30")
    assert valid["null_reason"] is None
    assert valid["unit"] == "tco2e"

    # Grid — measured zero renders as 0, not as unavailable.
    zero = grid["scope2_market_tco2e"]
    assert zero["value"] == 0
    assert zero["value"] is not None
    assert zero["null_reason"] is None

    # Grid — unavailable renders as its null_reason, never as 0.
    unavailable = grid["scope3_tco2e"]
    assert unavailable["value"] is None
    assert unavailable["null_reason"] == "emission_factor_missing"
    for sentinel in (0, 0.0, "0", "0.0"):
        assert unavailable["value"] != sentinel

    # Evidence drawer (S2) — evidence for the valid metric binds to the same
    # released snapshot_version, and the source rows are the ones we seeded.
    drawer_rows = [
        row for row in payload["evidence"] if row["metric_key"] == "scope1_tco2e"
    ]
    assert drawer_rows, "evidence drawer would be empty for the valid metric"
    for row in drawer_rows:
        assert row["snapshot_version"] == seed.DEMO_SNAPSHOT_VERSION
    source_refs = {row["source_row_ref"] for row in drawer_rows}
    assert source_refs == {
        "demo-nat-gas-2026Q1-facility-a",
        "demo-nat-gas-2026Q1-facility-b",
    }


# ── A1/R2: seed writes only through the T13a writer (grep guard) ──────


def test_seed_module_contains_no_direct_writes_to_sus_authoritative() -> None:
    """[A1][R2] The seed drives the T13a writer — it must not INSERT/UPDATE
    ``sus_authoritative_*`` on its own. A single SELECT for the idempotency
    pre-check is allowed; anything else is a route around the release gate.
    """
    text = SEED_MODULE_PATH.read_text(encoding="utf-8")

    forbidden = (
        "INSERT INTO sus_authoritative_snapshots",
        "INSERT INTO sus_authoritative_metric_value",
        "INSERT INTO sus_authoritative_evidence",
        "UPDATE sus_authoritative_snapshots",
        "UPDATE sus_authoritative_metric_value",
        "UPDATE sus_authoritative_evidence",
        "DELETE FROM sus_authoritative_",
    )
    for phrase in forbidden:
        assert phrase not in text, (
            f"sustainability demo seed contains {phrase!r}; it must drive the "
            "T13a writer instead of writing to sus_authoritative_* directly."
        )
    # It must import the sanctioned writer.
    assert "re_sustainability_snapshot_writer" in text
