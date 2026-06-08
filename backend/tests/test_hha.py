"""Tests for the Healthcare Subscription Analytics (hha) module.

Covers the read serving layer (KPI building, money cast at the edge, RLS scope
preamble), and the seed pack (determinism, small-cell suppression, integer money,
and a hard no-PHI guard over both the seeded SQL and the schema file).
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID


class FakeCursor:
    def __init__(self):
        self.executions: list[tuple[str, tuple | None]] = []
        self._fetchone_queue: list[dict | None] = []

    def push_fetchone(self, row: dict | None):
        self._fetchone_queue.append(row)
        return self

    def execute(self, sql: str, params=None):
        self.executions.append((sql.strip(), params))

    def fetchone(self):
        if self._fetchone_queue:
            return self._fetchone_queue.pop(0)
        return None

    @property
    def queries(self) -> list[str]:
        return [q for q, _ in self.executions]


@contextmanager
def cursor_ctx(cursor: FakeCursor):
    yield cursor


# Forbidden PHI-shaped identifiers — none of these may appear in hha_ columns or seeds.
_PHI_TOKENS = [
    "email", "phone", "ssn", "address", "date_of_birth", " dob ", "dob_",
    "first_name", "last_name", "patient_name", "full_name", "diagnosis",
    "prescription", "lab_result_value", "lab_value", "icd", "mrn",
]


def _overview_row() -> dict:
    return {
        "as_of_date": __import__("datetime").date(2026, 5, 31),
        "active_members": 4250,
        "new_members_mtd": 520,
        "mrr_minor_units": 50_150_000,
        "arr_minor_units": 601_800_000,
        "arpu_minor_units": 11_800,
        "blended_cac_minor_units": 31_000,
        "ltv_minor_units": 264_000,
        "ltv_cac_ratio": 8.5160,
        "payback_months": 8.60,
        "trial_to_paid_pct": 0.62,
        "activation_rate_pct": 0.71,
        "gross_churn_pct": 0.041,
        "net_churn_pct": -0.012,
        "nrr_pct": 1.112,
        "grr_pct": 0.959,
        "month3_retention_pct": 0.78,
        "lab_sla_pct": 0.93,
        "consult_sla_pct": 0.88,
        "source_freshness_at": __import__("datetime").datetime(2026, 5, 31, 6, 0, 0),
        "provenance_label": "synthetic gold rollup (seeded) · hha_starter v1",
    }


def test_overview_builds_kpis_casts_money_and_sets_rls_scope(monkeypatch):
    from app.services import hha as svc

    fake = FakeCursor()
    fake.push_fetchone(_overview_row())
    monkeypatch.setattr(svc, "get_cursor", lambda: cursor_ctx(fake))

    out = svc.get_overview(env_id="env-test-123")

    # RLS scope preamble issued with the env id.
    assert any("set_config('app.env_id'" in q for q in fake.queries)
    set_calls = [p for q, p in fake.executions if "set_config('app.env_id'" in q]
    assert set_calls and set_calls[0] == ("env-test-123",)
    # Read is explicitly scoped by env_id too (defense in depth).
    assert any("WHERE env_id = %s" in q for q in fake.queries)

    kpis = {k.key: k for k in out.kpis}
    # Money cast from integer minor units to decimal dollars at the edge.
    assert kpis["mrr"].value == 501_500.0
    assert kpis["arr"].value == 6_018_000.0
    assert kpis["arpu"].value == 118.0
    # Rates pass through as [0,1] fractions.
    assert kpis["nrr"].value == 1.112
    assert kpis["net_churn"].value == -0.012
    # Every KPI carries a governed definition.
    assert all(k.definition.formula for k in out.kpis)
    assert out.synthetic is True and out.phi is False
    assert "no PHI" in out.disclaimer or "no real patients" in out.disclaimer


def test_overview_empty_when_no_rows(monkeypatch):
    from app.services import hha as svc

    fake = FakeCursor()  # fetchone returns None
    monkeypatch.setattr(svc, "get_cursor", lambda: cursor_ctx(fake))

    out = svc.get_overview(env_id="env-empty")
    assert out.kpis == []
    assert out.as_of_date is None
    assert out.phi is False


def test_health_reports_row_counts_and_ok(monkeypatch):
    from app.services import hha as svc

    fake = FakeCursor()
    for _ in svc._TABLES:
        fake.push_fetchone({"n": 7})
    fake.push_fetchone({
        "source_freshness_at": None,
        "provenance_label": "synthetic gold rollup (seeded) · hha_starter v1",
    })
    monkeypatch.setattr(svc, "get_cursor", lambda: cursor_ctx(fake))

    out = svc.get_health(env_id="env-test-123")
    assert out.ok is True
    assert out.row_counts["hha_overview_metrics"] == 7
    assert any("set_config('app.env_id'" in q for q in fake.queries)
    assert out.phi is False


def test_seed_pack_is_deterministic_suppresses_small_cells_and_uses_integer_money():
    from app.services.environment_seed_packs_v2 import hha_starter

    # Deterministic business_id from env_id.
    b1 = hha_starter._business_id_for("env-abc")
    b2 = hha_starter._business_id_for("env-abc")
    assert b1 == b2
    UUID(b1)  # parses as a uuid
    assert hha_starter._business_id_for("env-xyz") != b1

    # At least one cohort trips small-cell suppression (<11), and it is honest.
    rows = hha_starter._cohort_rows()
    suppressed = [r for r in rows if r["is_suppressed"]]
    assert suppressed, "expected at least one suppressed small-cell cohort"
    assert all(r["cohort_size"] < 11 for r in suppressed)
    assert all(r["cohort_size"] >= 11 for r in rows if not r["is_suppressed"])

    # Money constants are integers (minor units), never floats.
    assert isinstance(hha_starter._OVERVIEW["mrr_minor_units"], int)
    for _k, _n, _t, _p, price, _i in hha_starter._PLANS:
        assert isinstance(price, int)


def test_seed_pack_apply_runs_and_emits_no_phi_columns():
    from app.services.environment_seed_packs_v2 import hha_starter

    fake = FakeCursor()
    result = hha_starter.apply(fake, "env-test-123", "", actor="test")

    # Scope set before any insert; business_id synthesized (param[0] is env_id).
    assert "set_config('app.env_id'" in fake.executions[0][0]
    assert result.pack_name == "hha_starter"
    assert result.rows_created.get("hha_overview_metrics") == 1
    assert result.rows_created.get("hha_plans") == len(hha_starter._PLANS)

    blob = " ".join(q.lower() for q in fake.queries)
    for token in _PHI_TOKENS:
        assert token not in blob, f"PHI-shaped token {token!r} leaked into seeded SQL"


def test_schema_file_has_no_phi_columns_and_full_rls():
    schema = (
        Path(__file__).resolve().parents[2]
        / "repo-b" / "db" / "schema" / "10013_hha_healthcare_subscription_core.sql"
    )
    raw = schema.read_text(encoding="utf-8").lower()

    # Scan DDL identifiers only — strip line comments and string literals so the
    # forbidden-token check can't trip on descriptive prose (comments / COMMENT ON
    # text / template copy that legitimately names what is excluded).
    ddl = re.sub(r"--[^\n]*", "", raw)
    ddl = re.sub(r"'[^']*'", "''", ddl)
    for token in _PHI_TOKENS:
        assert token not in ddl, f"PHI-shaped token {token!r} present as a schema identifier"

    # Every hha_ table enables RLS with a tenant-isolation policy on app.env_id.
    tables = re.findall(r"create table if not exists (hha_\w+)", raw)
    assert len(tables) == 5
    for t in tables:
        assert f"alter table {t} enable row level security" in raw
    assert raw.count("current_setting('app.env_id', true)") >= len(tables)
