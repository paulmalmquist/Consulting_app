"""NCF Grant Friction service tests.

Covers the service-layer contract:
    - row parsing (happy path)
    - fail-closed behavior when no row exists (null_reason='model_not_available')
    - tolerant JSON parsing for top_drivers
    - band validation in list_grants_at_risk

The DB layer is mocked at `get_cursor`. These are unit tests; integration tests
live separately and require a seeded Supabase.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services.ncf_grant_friction_service import (
    GrantFrictionScore,
    _parse_drivers,
    get_grant_friction_score,
    get_summary,
    list_grants_at_risk,
)


# ── helpers ──────────────────────────────────────────────────────────────────


def _make_row(
    grant_id="11111111-1111-1111-1111-111111111111",
    risk_score=0.73,
    risk_band="high",
    top_drivers='[{"feature":"office_exception_rate_90d","direction":"+","contribution":0.41}]',
    ts=None,
    model_version="ncf_grant_friction@v1.0.0",
    brier=0.18,
    confidence_note=None,
    null_reason=None,
):
    return (
        grant_id, risk_score, risk_band, top_drivers,
        ts or datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
        model_version, brier, confidence_note, null_reason,
    )


def _cursor_cm(rows=None, row=None):
    """Return a context-manager mock whose cursor.fetch* returns the given data."""
    cur = MagicMock()
    cur.fetchone.return_value = row
    cur.fetchall.return_value = rows or []
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=cur)
    cm.__exit__ = MagicMock(return_value=False)
    return cm, cur


# ── _parse_drivers ───────────────────────────────────────────────────────────


def test_parse_drivers_accepts_list():
    assert _parse_drivers([{"feature": "x"}]) == [{"feature": "x"}]


def test_parse_drivers_accepts_json_string():
    assert _parse_drivers('[{"feature":"x"}]') == [{"feature": "x"}]


def test_parse_drivers_tolerates_malformed_json():
    assert _parse_drivers("not json") == []


def test_parse_drivers_handles_none():
    assert _parse_drivers(None) == []


def test_parse_drivers_rejects_non_list_json():
    assert _parse_drivers('{"not":"a list"}') == []


# ── get_grant_friction_score ─────────────────────────────────────────────────


def test_get_grant_friction_score_happy_path():
    cm, _ = _cursor_cm(row=_make_row())
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        score = get_grant_friction_score(
            env_id="22222222-2222-2222-2222-222222222222",
            grant_id="11111111-1111-1111-1111-111111111111",
        )
    assert isinstance(score, GrantFrictionScore)
    assert score.risk_score == pytest.approx(0.73)
    assert score.risk_band == "high"
    assert score.null_reason is None
    assert score.top_drivers[0]["feature"] == "office_exception_rate_90d"


def test_get_grant_friction_score_fail_closed_when_missing():
    cm, _ = _cursor_cm(row=None)
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        score = get_grant_friction_score(
            env_id="22222222-2222-2222-2222-222222222222",
            grant_id="99999999-9999-9999-9999-999999999999",
        )
    assert score.risk_score is None
    assert score.risk_band is None
    assert score.null_reason == "model_not_available"
    assert score.top_drivers == []


def test_get_grant_friction_score_malformed_drivers_tolerated():
    cm, _ = _cursor_cm(row=_make_row(top_drivers="garbage{not json"))
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        score = get_grant_friction_score(
            env_id="22222222-2222-2222-2222-222222222222",
            grant_id="11111111-1111-1111-1111-111111111111",
        )
    assert score.top_drivers == []
    assert score.risk_score == pytest.approx(0.73)


# ── list_grants_at_risk ──────────────────────────────────────────────────────


def test_list_grants_at_risk_happy_path():
    rows = [_make_row(risk_score=0.9, risk_band="high"),
            _make_row(risk_score=0.82, risk_band="high")]
    cm, _ = _cursor_cm(rows=rows)
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        scores = list_grants_at_risk(
            env_id="22222222-2222-2222-2222-222222222222", band="high", limit=10,
        )
    assert len(scores) == 2
    assert all(s.risk_band == "high" for s in scores)


def test_list_grants_at_risk_rejects_invalid_band():
    with pytest.raises(ValueError):
        list_grants_at_risk(
            env_id="22222222-2222-2222-2222-222222222222", band="bogus",
        )


def test_list_grants_at_risk_allows_none_band():
    cm, cur = _cursor_cm(rows=[])
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        scores = list_grants_at_risk(
            env_id="22222222-2222-2222-2222-222222222222", band=None,
        )
    assert scores == []
    # Assert the WHERE clause omitted the band filter.
    executed_sql = cur.execute.call_args.args[0]
    assert "risk_band = %s" not in executed_sql
    assert "risk_band IS NOT NULL" in executed_sql


# ── get_summary ──────────────────────────────────────────────────────────────


def test_get_summary_happy_path():
    ts = datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc)
    cm, _ = _cursor_cm(row=(3, 7, 40, 50, ts, "ncf_grant_friction@v1.0.0"))
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        summary = get_summary(env_id="22222222-2222-2222-2222-222222222222")
    assert summary.count_high == 3
    assert summary.count_watch == 7
    assert summary.count_low == 40
    assert summary.count_scored == 50
    assert summary.latest_prediction_at == "2026-04-15T12:00:00+00:00"
    assert summary.model_version == "ncf_grant_friction@v1.0.0"


def test_get_summary_empty():
    cm, _ = _cursor_cm(row=(0, 0, 0, 0, None, None))
    with patch("app.services.ncf_grant_friction_service.get_cursor", return_value=cm):
        summary = get_summary(env_id="22222222-2222-2222-2222-222222222222")
    assert summary.count_scored == 0
    assert summary.latest_prediction_at is None
    assert summary.model_version is None
