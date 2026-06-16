"""Tests for the Event Analytics read service + route (dashboard surface).

No BigQuery, no credentials. Covers the fail-closed contract (BQ off / no
project → available=False, never raises), the route always-200 behavior, and
the structural guarantee that this surface cannot read the raw events table.
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import events_analytics as svc


client = TestClient(app)


# ── fail-closed ──────────────────────────────────────────────────────────────

def test_dashboard_unavailable_when_bq_disabled():
    with patch.object(svc, "BQ_ENABLED", False):
        out = svc.get_dashboard()
    assert out["available"] is False
    assert "not enabled" in out["reason"].lower()


def test_dashboard_unavailable_when_no_project():
    with patch.object(svc, "BQ_ENABLED", True), patch.object(svc, "BQ_PROJECT_ID", ""):
        out = svc.get_dashboard()
    assert out["available"] is False
    assert "project" in out["reason"].lower()


def test_dashboard_unavailable_when_client_import_fails():
    with patch.object(svc, "BQ_ENABLED", True), \
         patch.object(svc, "BQ_PROJECT_ID", "proj"), \
         patch.object(svc, "_get_bq_client", side_effect=ImportError("no bq")):
        out = svc.get_dashboard()
    assert out["available"] is False
    assert "not installed" in out["reason"].lower()


def test_dashboard_unavailable_when_query_raises():
    class _Boom:
        def query(self, *_a, **_k):
            raise RuntimeError("network down")
    with patch.object(svc, "BQ_ENABLED", True), \
         patch.object(svc, "BQ_PROJECT_ID", "proj"), \
         patch.object(svc, "_get_bq_client", return_value=_Boom()):
        out = svc.get_dashboard()
    assert out["available"] is False
    assert "failed" in out["reason"].lower() or "unavailable" in out["reason"].lower()


# ── route always 200, never leaks a 500 on BQ-off ────────────────────────────

def test_route_returns_200_with_unavailable_when_bq_off():
    with patch.object(svc, "BQ_ENABLED", False):
        resp = client.get("/api/events/v1/analytics/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is False
    assert "reason" in body


# ── raw-table read is structurally forbidden ─────────────────────────────────

def test_only_whitelisted_views_are_readable():
    # The raw events table must never be an allowed read target here.
    assert "events" not in svc.ALLOWED_VIEWS
    assert "events_deduped" in svc.ALLOWED_VIEWS
    # Volume comes from a view, not a direct raw-table read.
    assert "event_volume_summary" in svc.ALLOWED_VIEWS
    for view in svc.ALLOWED_VIEWS:
        # every allowed view resolves to the ANALYTICS dataset
        fqn = svc._view_fqn(view)
        assert svc.BQ_ANALYTICS_DATASET in fqn
        assert "winston_events_raw.events`" not in fqn


def test_view_fqn_rejects_raw_table():
    with pytest.raises(ValueError, match="forbidden"):
        svc._view_fqn("events")  # the raw table name
    with pytest.raises(ValueError):
        svc._view_fqn("winston_events_raw.events")


# ── credential resolution: inline JSON (Railway) vs ADC default ──────────────

def test_bq_client_uses_inline_json_credentials_when_set():
    """On a host without a key file (Railway), inline SA JSON builds the client."""
    captured = {}

    class _FakeCreds:
        pass

    class _FakeSAModule:
        class Credentials:
            @staticmethod
            def from_service_account_info(info):
                captured["info"] = info
                return _FakeCreds()

    class _FakeBQ:
        class Client:
            def __init__(self, project=None, credentials=None):
                captured["project"] = project
                captured["credentials"] = credentials

    import sys
    inline = '{"type":"service_account","project_id":"novendor-events-prod","client_email":"x@y.iam"}'
    with patch.object(svc, "BQ_PROJECT_ID", "novendor-events-prod"), \
         patch.dict(os.environ, {"GOOGLE_APPLICATION_CREDENTIALS_JSON": inline}), \
         patch.dict(sys.modules, {
             "google.cloud": type(sys)("google.cloud"),
             "google.oauth2": type(sys)("google.oauth2"),
         }):
        sys.modules["google.cloud"].bigquery = _FakeBQ  # type: ignore[attr-defined]
        sys.modules["google.oauth2"].service_account = _FakeSAModule  # type: ignore[attr-defined]
        svc._get_bq_client()

    assert captured["project"] == "novendor-events-prod"
    assert isinstance(captured["credentials"], _FakeCreds)
    assert captured["info"]["project_id"] == "novendor-events-prod"


def test_bq_client_falls_back_to_adc_without_inline_json():
    """No inline JSON → plain Client(project=...) (ADC / key-file / Workload Identity)."""
    captured = {}

    class _FakeBQ:
        class Client:
            def __init__(self, project=None, credentials=None):
                captured["project"] = project
                captured["credentials"] = credentials

    import sys
    env = dict(os.environ)
    env.pop("GOOGLE_APPLICATION_CREDENTIALS_JSON", None)
    with patch.object(svc, "BQ_PROJECT_ID", "p"), \
         patch.dict(os.environ, env, clear=True), \
         patch.dict(sys.modules, {"google.cloud": type(sys)("google.cloud")}):
        sys.modules["google.cloud"].bigquery = _FakeBQ  # type: ignore[attr-defined]
        svc._get_bq_client()

    assert captured["project"] == "p"
    assert captured["credentials"] is None  # ADC path, no explicit creds


def test_happy_path_payload_shape_with_mocked_client():
    """A mocked BQ client returns rows; payload carries observability_only + volume."""
    class _Job:
        def __init__(self, rows): self._rows = rows
        def result(self): return self._rows

    # Map each distinct query to a canned result by inspecting the SQL.
    def _query(sql, *_a, **_k):
        if "raw_rows" in sql:
            return _Job([{"raw_rows": 22, "deduped_rows": 17, "dead_letter_rows": 2}])
        if "GROUP BY source" in sql:
            return _Job([{"source": "backend", "event_count": 3}])
        if "execution_events_daily" in sql:
            return _Job([{"event_date": "2026-06-10", "event_type": "execution.completed",
                          "source": "backend", "event_count": 3}])
        if "hr_signal_latest" in sql:
            return _Job([{"signal_name": "mvrv_z", "signal_value": "1.4",
                          "staleness_status": "fresh", "as_of_date": "2026-06-15",
                          "ingested_at": "2026-06-15T00:00:00+00:00"}])
        if "hr_signal_freshness_summary" in sql:
            return _Job([{"staleness_status": "fresh", "signal_count": 6}])
        if "hr_dead_letters" in sql:
            return _Job([{"ingested_at": "2026-06-15T00:00:00+00:00", "source": "sink_worker",
                          "dead_letter_reason": "missing required fields", "raw_payload": "{}"}])
        return _Job([])

    class _Client:
        def query(self, sql, *a, **k): return _query(sql, *a, **k)

    with patch.object(svc, "BQ_ENABLED", True), \
         patch.object(svc, "BQ_PROJECT_ID", "proj"), \
         patch.object(svc, "_get_bq_client", return_value=_Client()):
        out = svc.get_dashboard()

    assert out["available"] is True
    assert out["observability_only"] is True
    assert out["volume"]["raw_rows"] == 22
    assert out["volume"]["deduped_rows"] == 17
    assert out["volume"]["replay_duplicates_collapsed"] == 5
    assert out["hr_signal_latest"][0]["signal_name"] == "mvrv_z"
