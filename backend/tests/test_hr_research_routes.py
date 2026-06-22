"""Route tests for the History Rhymes research → planning bridge.

Patches `app.routes.hr_research.get_cursor` with the shared FakeCursor (kept
local to this module — no change to the shared conftest target list, minimal
blast radius).
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from tests.conftest import FakeCursor

FIXTURE = Path(__file__).parent / "fixtures" / "hr_weekly_brief_sample.md"

SKELETAL = """# HR Weekly Brief — 2026-04-20

**Regime call:** late_cycle
**Confidence:** 0.72
**Freshness score:** 0.88

## Themes
- **CRE stress rising** — CMBS delinquency +40bps QoQ

## Source
seed
"""


@pytest.fixture
def hr_cur():
    cur = FakeCursor()

    @contextmanager
    def _mock():
        yield cur

    p = patch("app.routes.hr_research.get_cursor", _mock)
    p.start()
    yield cur
    p.stop()


def _sample() -> str:
    return FIXTURE.read_text(encoding="utf-8")


# ── POST /briefs ──────────────────────────────────────────────────────────────


def test_create_brief_persists_and_creates_candidates(client, hr_cur):
    now = datetime(2026, 5, 18, 12, 0, 0)
    hr_cur.push_result([{"run_id": "run-1"}])  # _insert_run
    hr_cur.push_result([{"brief_id": "brief-1", "created_at": now}])  # brief insert
    hr_cur.push_result([{"candidate_id": "c1", "status": "new", "created_at": now}])
    hr_cur.push_result([{"candidate_id": "c2", "status": "new", "created_at": now}])
    hr_cur.push_result([{"candidate_id": "c3", "status": "new", "created_at": now}])

    resp = client.post(
        "/api/hr/v1/research/briefs",
        json={
            "brief_date": "2026-05-18",
            "week_type": "Week 1",
            "pillar_name": "Novel Signals & Data Sources",
            "source_filename": "HR_Weekly_Brief_2026-05-18.md",
            "markdown_content": _sample(),
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["degraded"] is False
    assert body["brief"]["brief_id"] == "brief-1"
    assert body["confidence"] == 1.0
    assert len(body["candidates"]) == 3
    titles = [c["title"] for c in body["candidates"]]
    assert "Add MVRV-Z divergence signal" in titles
    # Run lifecycle: insert + brief + 3 candidates + run update.
    sql = " ".join(q[0] for q in hr_cur.queries)
    assert "INSERT INTO hr_research_runs" in sql
    assert "INSERT INTO hr_research_briefs" in sql
    assert "INSERT INTO hr_enhancement_candidates" in sql
    assert "UPDATE hr_research_runs" in sql


def test_create_brief_degraded_still_persists_no_500(client, hr_cur):
    now = datetime(2026, 4, 20, 12, 0, 0)
    hr_cur.push_result([{"run_id": "run-2"}])
    hr_cur.push_result([{"brief_id": "brief-2", "created_at": now}])

    resp = client.post(
        "/api/hr/v1/research/briefs",
        json={
            "brief_date": "2026-04-20",
            "week_type": "Week 1",
            "pillar_name": "Novel Signals & Data Sources",
            "markdown_content": SKELETAL,
        },
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["degraded"] is True
    assert body["candidates"] == []
    assert body["warnings"]
    assert body["brief"]["brief_id"] == "brief-2"


def test_create_brief_rejects_empty_markdown(client, hr_cur):
    resp = client.post(
        "/api/hr/v1/research/briefs",
        json={
            "brief_date": "2026-05-18",
            "week_type": "Week 1",
            "pillar_name": "Novel Signals",
            "markdown_content": "",
        },
    )
    assert resp.status_code == 422  # pydantic min_length


# ── GET /briefs/latest ────────────────────────────────────────────────────────


def test_get_latest_brief(client, hr_cur):
    now = datetime(2026, 5, 18, 12, 0, 0)
    hr_cur.push_result(
        [
            {
                "brief_id": "brief-1",
                "brief_date": datetime(2026, 5, 18).date(),
                "week_type": "Week 1",
                "pillar_name": "Novel Signals & Data Sources",
                "title": "HR Weekly Brief — 2026-05-18",
                "parsed_json": {"found_sections": ["enhancement_path"]},
                "confidence": 1.0,
                "freshness_score": 0.88,
                "source_filename": "x.md",
                "created_at": now,
            }
        ]
    )
    hr_cur.push_result([{"n": 3}])

    resp = client.get("/api/hr/v1/research/briefs/latest")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["brief_id"] == "brief-1"
    assert body["candidate_count"] == 3
    assert body["confidence"] == 1.0


def test_get_latest_brief_404_when_none(client, hr_cur):
    hr_cur.push_result([])
    resp = client.get("/api/hr/v1/research/briefs/latest")
    assert resp.status_code == 404


# ── GET /enhancement-candidates ───────────────────────────────────────────────


def test_list_candidates(client, hr_cur):
    hr_cur.push_result(
        [
            {
                "candidate_id": "c1",
                "brief_id": "brief-1",
                "title": "Add MVRV-Z divergence signal",
                "category": "signal",
                "what": "Add feature",
                "why": "hit rate",
                "effort_days": 3,
                "expected_impact": "High",
                "dependencies": ["FRED loader"],
                "priority": "high",
                "confidence": None,
                "adversarial_verdict": "PASS",
                "status": "new",
                "created_at": datetime(2026, 5, 18),
            }
        ]
    )
    resp = client.get("/api/hr/v1/research/enhancement-candidates")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 1
    assert body["candidates"][0]["adversarial_verdict"] == "PASS"


def test_list_candidates_rejects_bad_status(client, hr_cur):
    resp = client.get("/api/hr/v1/research/enhancement-candidates?status=bogus")
    assert resp.status_code == 400


# ── promote / discard ─────────────────────────────────────────────────────────


def test_promote_candidate(client, hr_cur):
    hr_cur.push_result(
        [{"candidate_id": "c1", "title": "Add MVRV-Z", "status": "promoted"}]
    )
    resp = client.post("/api/hr/v1/research/enhancement-candidates/c1/promote")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "promoted"
    assert "UPDATE hr_enhancement_candidates" in hr_cur.queries[-1][0]


def test_discard_candidate(client, hr_cur):
    hr_cur.push_result(
        [{"candidate_id": "c1", "title": "Add MVRV-Z", "status": "discarded"}]
    )
    resp = client.post("/api/hr/v1/research/enhancement-candidates/c1/discard")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "discarded"


def test_promote_missing_candidate_404(client, hr_cur):
    hr_cur.push_result([])
    resp = client.post("/api/hr/v1/research/enhancement-candidates/missing/promote")
    assert resp.status_code == 404


# ── planning-markdown ─────────────────────────────────────────────────────────


def test_get_planning_markdown(client, hr_cur):
    hr_cur.push_result(
        [
            {
                "candidate_id": "c1",
                "title": "Add MVRV-Z divergence signal",
                "category": "signal",
                "what": "Add feature",
                "why": "hit rate",
                "effort_days": 3,
                "expected_impact": "High",
                "dependencies": ["FRED loader"],
                "priority": "high",
                "confidence": None,
                "adversarial_verdict": "PASS",
                "planning_markdown": "# Objective\nstored plan\n",
            }
        ]
    )
    resp = client.get(
        "/api/hr/v1/research/enhancement-candidates/c1/planning-markdown"
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["planning_markdown"] == "# Objective\nstored plan\n"


def test_get_planning_markdown_regenerates_when_null(client, hr_cur):
    hr_cur.push_result(
        [
            {
                "candidate_id": "c1",
                "title": "Regen candidate",
                "category": None,
                "what": "do the thing",
                "why": None,
                "effort_days": None,
                "expected_impact": None,
                "dependencies": [],
                "priority": "medium",
                "confidence": None,
                "adversarial_verdict": None,
                "planning_markdown": None,
            }
        ]
    )
    resp = client.get(
        "/api/hr/v1/research/enhancement-candidates/c1/planning-markdown"
    )
    assert resp.status_code == 200, resp.text
    md = resp.json()["planning_markdown"]
    assert "# Objective" in md
    assert "# Future Extensions" in md
    assert "Regen candidate" in md


def test_get_planning_markdown_404(client, hr_cur):
    hr_cur.push_result([])
    resp = client.get(
        "/api/hr/v1/research/enhancement-candidates/missing/planning-markdown"
    )
    assert resp.status_code == 404
