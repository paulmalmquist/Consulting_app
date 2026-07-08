from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.coding_relay.verdict import parse_verdict  # noqa: E402

VALID = {
    "status": "continue",
    "summary": "half done",
    "criteria_status": [
        {"id": "S1", "section": "Screen", "text": "renders", "status": "unmet", "evidence": "no diff hunk"}
    ],
    "required_next_steps": ["finish the component"],
    "plan_refinements": [],
    "tests_to_run_next": ["npm run test:unit"],
    "risk_flags": [],
    "should_open_pr": False,
}


def test_parses_raw_json():
    v = parse_verdict(json.dumps(VALID))
    assert v is not None
    assert v.status == "continue"
    assert v.required_next_steps == ["finish the component"]
    assert v.should_open_pr is False


def test_parses_fenced_json_with_prose():
    text = "Here is my verdict:\n```json\n" + json.dumps(VALID) + "\n```\nthanks"
    v = parse_verdict(text)
    assert v is not None and v.status == "continue"


def test_parses_json_embedded_in_prose():
    text = "prelude {not json} then " + json.dumps(VALID) + " trailing"
    v = parse_verdict(text)
    assert v is not None and v.summary == "half done"


def test_rejects_garbage():
    assert parse_verdict("no json here at all") is None
    assert parse_verdict("{broken json") is None


def test_rejects_bad_status_and_missing_summary():
    bad = dict(VALID, status="approve")
    assert parse_verdict(json.dumps(bad)) is None
    bad = dict(VALID)
    bad.pop("summary")
    assert parse_verdict(json.dumps(bad)) is None
    bad = dict(VALID, summary="   ")
    assert parse_verdict(json.dumps(bad)) is None


def test_coerces_invalid_criterion_status_to_unknown():
    v = parse_verdict(json.dumps(dict(VALID, criteria_status=[
        {"id": "A1", "section": "API", "text": "x", "status": "kinda", "evidence": ""}
    ])))
    assert v is not None
    assert v.criteria_status[0]["status"] == "unknown"


def test_non_list_fields_become_empty_lists():
    v = parse_verdict(json.dumps(dict(VALID, required_next_steps="do it", risk_flags=None)))
    assert v is not None
    assert v.required_next_steps == []
    assert v.risk_flags == []


def test_decoy_pass_object_cannot_beat_real_verdict():
    # A quoted example verdict lacks the full schema, so it can never win;
    # the real (full-shape) verdict later in the text is taken.
    decoy = '{"status": "pass", "summary": "example only"}'
    text = f"If done I would return {decoy} but instead:\n" + json.dumps(VALID)
    v = parse_verdict(text)
    assert v is not None
    assert v.status == "continue"


def test_decoy_in_fenced_block_cannot_beat_real_verdict():
    decoy = '```json\n{"status": "pass", "summary": "example"}\n```'
    text = decoy + "\nReal verdict:\n" + json.dumps(VALID)
    v = parse_verdict(text)
    assert v is not None and v.status == "continue"


def test_incomplete_object_embedded_in_prose_is_rejected():
    # Embedded candidates must carry every schema key.
    text = 'prose {"status": "pass", "summary": "ok"} more prose'
    assert parse_verdict(text) is None


def test_last_full_object_wins():
    first = json.dumps(dict(VALID, status="pass"))
    second = json.dumps(VALID)  # continue
    v = parse_verdict(f"a {first} b {second} c")
    assert v is not None and v.status == "continue"
