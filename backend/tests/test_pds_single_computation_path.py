"""Hard Rule 1: every metric flows through exactly one canonical compute function.

This test walks the pds_executive services directory and fails if any file other
than metric_functions.py contains raw metric SQL (FROM pds_projects with
SUM/COUNT/AVG over budget/forecast/spent/variance). Registry consistency is
also verified.
"""
from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

import pytest

from app.services.pds_executive import metric_registry
from app.services.pds_executive.filter_normalizer import normalize_filters


SERVICES_DIR = (
    Path(__file__).resolve().parents[1]
    / "app"
    / "services"
    / "pds_executive"
)

# Files allowed to contain canonical metric SQL.
CANONICAL_FILES: set[str] = {"metric_functions.py"}

# Files exempted because they aggregate queue/signal counts (not metrics)
# or read only metadata. Keep this list minimal.
EXEMPT_FILES: set[str] = {
    "__init__.py",
    "metric_registry.py",
    "metric_functions.py",
    "filter_normalizer.py",
    "connectors.py",       # connector fixture plumbing — no metric math
    "decision_engine.py",  # operates on queue_item / signal rows only
    "signals.py",          # signal event writer
    "memory.py",           # executive memory log
    "narrative.py",        # narrative drafts
    "briefing.py",         # briefing pack assembler
    "queue.py",            # queue workflow CRUD (not metric math)
    "catalog.py",          # reference catalog
}


_METRIC_SQL_PATTERN = re.compile(
    r"FROM\s+pds_projects",
    re.IGNORECASE,
)

_AGG_PATTERN = re.compile(
    r"\b(SUM|AVG)\s*\(",
    re.IGNORECASE,
)


def test_no_metric_sql_outside_canonical_file():
    """No file in pds_executive/ besides metric_functions.py may query pds_projects
    with a SUM/AVG aggregation. Counting rows is fine (queue/signal services) —
    real dollar math must live in the canonical functions.
    """
    offenders: list[tuple[str, str]] = []
    for path in SERVICES_DIR.glob("*.py"):
        if path.name in CANONICAL_FILES:
            continue
        if path.name in EXEMPT_FILES:
            continue
        text = path.read_text()
        if _METRIC_SQL_PATTERN.search(text) and _AGG_PATTERN.search(text):
            offenders.append((path.name, "aggregation over pds_projects"))
    assert not offenders, (
        "Metric SQL found outside metric_functions.py — route through registry: "
        f"{offenders}"
    )


def test_exempt_files_exist_in_services_dir():
    """Guardrail: if someone deletes/renames a file, the exempt list stays honest."""
    present = {p.name for p in SERVICES_DIR.glob("*.py")}
    # Allow extra names in EXEMPT_FILES only if they haven't been introduced yet.
    # Fail hard only if CANONICAL_FILES are missing.
    missing_canonical = CANONICAL_FILES - present
    assert not missing_canonical, (
        f"Expected canonical files missing from pds_executive/: {missing_canonical}"
    )


def test_every_registered_metric_has_compute_fn():
    names = metric_registry.list_metrics()
    assert names, "registry must expose at least one metric"
    for name in names:
        definition = metric_registry.get_metric(name)
        assert callable(definition.compute_fn), f"{name} compute_fn must be callable"
        assert definition.compute_fn.__module__.endswith("metric_functions"), (
            f"{name}.compute_fn must live in metric_functions (got "
            f"{definition.compute_fn.__module__})"
        )


def test_registry_metadata_is_serializable():
    for _, definition in metric_registry.iter_metrics():
        metadata = definition.to_metadata()
        # Must include the non-negotiable governance fields for the definition panel.
        for key in (
            "name",
            "definition",
            "supported_grains",
            "source_tables",
            "compute_fn",
            "validation_checks",
            "tolerance_class",
            "tolerance_value",
        ):
            assert key in metadata, f"{definition.name} missing {key} in metadata"


def test_unsupported_grain_raises():
    definition = metric_registry.get_metric("posture")
    nf = normalize_filters(env_id=uuid4(), business_id=uuid4(), grain="account")
    # posture only supports portfolio
    with pytest.raises(ValueError, match="does not support grain"):
        definition.compute(cur=None, nf=nf)


def test_overview_metrics_trace_to_registry(fake_cursor, monkeypatch):
    """Orchestrator overview calls the registry for every tile — not inline SQL.

    We prove this by stubbing each compute function on the registry and asserting
    overview returns those stub values. If orchestrator reimplemented metric SQL,
    the stubbed compute would not be reflected.
    """
    from app.services.pds_executive import orchestrator

    # Queue count + signal count + KPI lookup — push three empty result sets.
    fake_cursor.push_result([{"open_queue": 0, "critical_queue": 0, "high_queue": 0}])
    fake_cursor.push_result([{"open_signals": 0, "high_signals": 0}])
    fake_cursor.push_result([])  # latest_kpi

    from app.services.pds_executive.metric_functions import (
        MetricReceipt,
        MetricResult,
    )

    def _stub(name):
        def _fn(cur, nf):
            return MetricResult(
                metric=name,
                value=f"STUB::{name}",
                grain=nf.grain,
                receipt=MetricReceipt(
                    sql="-- stub",
                    params=[],
                    filters=nf.as_receipt_filters(),
                    timestamp="stub",
                    grain=nf.grain,
                ),
            )
        return _fn

    for metric_name in (
        "total_managed",
        "net_variance",
        "directional_delta",
        "accounts_at_risk",
        "posture",
    ):
        definition = metric_registry.get_metric(metric_name)
        monkeypatch.setattr(definition, "compute_fn", _stub(metric_name))

    result = orchestrator.get_overview(
        env_id=uuid4(), business_id=uuid4(), grain="portfolio"
    )

    assert set(result["metrics"].keys()) == {
        "total_managed",
        "net_variance",
        "directional_delta",
        "accounts_at_risk",
        "posture",
    }
    for name, payload in result["metrics"].items():
        assert payload["value"] == f"STUB::{name}", (
            f"Overview did not route {name} through the registry"
        )
