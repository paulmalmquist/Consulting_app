"""Route tests for the History Rhymes Morning Book endpoint.

Patches `app.routes.hr_morning_book.get_cursor` with the shared FakeCursor
(local to this module — minimal blast radius, per the route-test convention).
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

import pytest

from tests.conftest import FakeCursor


@pytest.fixture
def mb_cur():
    cur = FakeCursor()

    @contextmanager
    def _mock():
        yield cur

    p = patch("app.routes.hr_morning_book.get_cursor", _mock)
    p.start()
    yield cur
    p.stop()


def _brief_row(brief_id: str, brief_date: str, *, regime="late_cycle", confidence=0.70):
    return {
        "brief_id": brief_id,
        "brief_date": brief_date,
        "parsed_json": {"regime_call": regime, "confidence": confidence, "degraded": False},
        "confidence": confidence,
        "freshness_score": 0.9,
        "created_at": datetime(2026, 5, 18, 12, 0, 0),
    }


def test_morning_book_full_delta(client, mb_cur):
    # Query 1: two briefs (latest first). Query 2: candidates.
    mb_cur.push_result([
        _brief_row("b2", "2026-05-18", regime="crisis", confidence=0.55),
        _brief_row("b1", "2026-05-11", regime="late_cycle", confidence=0.72),
    ])
    mb_cur.push_result([
        {
            "candidate_id": "c1", "brief_id": "b2", "title": "New signal gap",
            "priority": "high", "status": "new", "adversarial_verdict": "FAIL",
            "confidence": None, "created_at": datetime(2026, 5, 18),
        },
    ])

    resp = client.get("/api/hr/v1/research/morning-book")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["current_regime"] == "crisis"
    assert body["triage"] == "Act Now"           # regime change + FAIL risk
    assert body["confidence"]["status"] == "deteriorating"
    assert any("Regime call shifted" in b for b in body["what_changed"])
    assert "New signal gap" in body["top_risks"]


def test_morning_book_single_brief_initialization(client, mb_cur):
    mb_cur.push_result([_brief_row("b1", "2026-05-18")])
    mb_cur.push_result([])  # no candidates

    resp = client.get("/api/hr/v1/research/morning-book")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["triage"] == "Research Only"
    assert any("initialization mode" in w for w in body["warnings"])


def test_morning_book_no_briefs(client, mb_cur):
    mb_cur.push_result([])  # no briefs → candidate query skipped

    resp = client.get("/api/hr/v1/research/morning-book")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["current_regime"] is None
    assert body["triage"] == "Research Only"
    assert any("No research briefs found" in w for w in body["warnings"])


def test_morning_book_response_shape(client, mb_cur):
    mb_cur.push_result([
        _brief_row("b2", "2026-05-18"),
        _brief_row("b1", "2026-05-11"),
    ])
    mb_cur.push_result([])

    resp = client.get("/api/hr/v1/research/morning-book")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body.keys()) == {
        "current_regime", "what_changed", "confidence", "freshness",
        "top_risks", "top_new_enhancements", "triage", "warnings",
    }
    assert isinstance(body["what_changed"], list) and body["what_changed"]
    assert body["freshness"]["latest_brief_date"] == "2026-05-18"
