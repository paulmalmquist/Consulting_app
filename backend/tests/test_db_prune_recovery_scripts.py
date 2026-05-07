from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_script(name: str):
    path = REPO_ROOT / "scripts" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def test_phase0a_classifies_backend_rows_browser_empty_as_runtime_gap():
    audit = _load_script("db_prune_recovery_audit")
    backend = audit.ResponseSummary(
        status=200,
        env_id="env-1",
        business_id="biz-1",
        quarter="2026Q2",
        fund_rows_length=2,
        diagnostics_length=0,
    )
    browser = audit.ResponseSummary(
        status=200,
        env_id="env-1",
        business_id="biz-1",
        quarter="2026Q2",
        fund_rows_length=0,
        diagnostics_length=0,
    )

    classes = audit.classify_phase0a(
        browser=browser,
        backend=backend,
        expected_quarter="2026Q2",
    )

    assert "RUNTIME_ENV_MISMATCH" in classes
    assert "DATA_DELETED" not in classes


def test_phase0a_classifies_quarter_drift_as_period_mismatch():
    audit = _load_script("db_prune_recovery_audit")
    backend = audit.ResponseSummary(
        status=200,
        env_id="env-1",
        business_id="biz-1",
        quarter="2026Q2",
        fund_rows_length=2,
        diagnostics_length=0,
    )
    browser = audit.ResponseSummary(
        status=200,
        env_id="env-1",
        business_id="biz-1",
        quarter="2026Q3",
        fund_rows_length=0,
        diagnostics_length=0,
    )

    classes = audit.classify_phase0a(
        browser=browser,
        backend=backend,
        expected_quarter="2026Q2",
    )

    assert "PERIOD_MISMATCH" in classes


def test_prune_guard_blocks_authoritative_and_binding_tables():
    guard = _load_script("repe_prune_guard")
    blocked = guard.static_blocks([
        {"table": "app.env_business_bindings"},
        {"table": "re_authoritative_fund_state_qtr"},
        {"table": "rag_chunks"},
    ])

    blocked_tables = {row["table"] for row in blocked}
    assert "app.env_business_bindings" in blocked_tables
    assert "re_authoritative_fund_state_qtr" in blocked_tables
    assert "rag_chunks" not in blocked_tables
