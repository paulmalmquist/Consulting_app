"""Structured reviewer verdict: extraction and hand validation.

The reviewer must answer with exactly one JSON object:

    {
      "status": "pass" | "continue" | "blocked" | "risk_escalation",
      "summary": "...",
      "criteria_status": [
        {"id": "S1", "section": "Screen", "text": "...",
         "status": "met" | "unmet" | "unknown" | "not_applicable",
         "evidence": "..."}
      ],
      "required_next_steps": ["..."],
      "plan_refinements": ["..."],
      "tests_to_run_next": ["..."],
      "risk_flags": ["..."],
      "should_open_pr": true
    }

Validation is hand-rolled (stdlib only; jsonschema lives in the backend
venv, which the relay must not depend on). Parse failure is never treated
as success: the loop retries once with a return-only-JSON nudge, then
treats the review as blocked.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

STATUSES = ("pass", "continue", "blocked", "risk_escalation")
CRITERION_STATUSES = ("met", "unmet", "unknown", "not_applicable")

FENCED_JSON_RE = re.compile(r"```(?:json)?\s*\n(.*?)```", re.DOTALL)


@dataclass
class Verdict:
    status: str
    summary: str
    criteria_status: list = field(default_factory=list)
    required_next_steps: list = field(default_factory=list)
    plan_refinements: list = field(default_factory=list)
    tests_to_run_next: list = field(default_factory=list)
    risk_flags: list = field(default_factory=list)
    should_open_pr: bool = False
    raw_text: str = ""

    def to_payload(self) -> dict:
        d = dict(self.__dict__)
        d.pop("raw_text", None)
        return d


REQUIRED_KEYS = (
    "status", "summary", "criteria_status", "required_next_steps",
    "plan_refinements", "tests_to_run_next", "risk_flags", "should_open_pr",
)


def _full_shape(obj: dict) -> bool:
    return all(k in obj for k in REQUIRED_KEYS)


def extract_json_object(text: str) -> dict | None:
    """Extract the verdict object, hardened against decoys.

    1. If the whole output is one JSON object, take it (the contract).
    2. Otherwise scan fenced blocks and raw candidates, but accept only
       objects carrying EVERY required schema key, and take the LAST one.
       A quoted example like {"status": "pass", "summary": "ok"} embedded
       in prose lacks the other keys and can never win.
    """
    try:
        obj = json.loads(text.strip())
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    last: dict | None = None
    for block in FENCED_JSON_RE.findall(text):
        try:
            obj = json.loads(block)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and _full_shape(obj):
            last = obj
    decoder = json.JSONDecoder()
    idx = text.find("{")
    while idx != -1:
        try:
            obj, _ = decoder.raw_decode(text, idx)
        except json.JSONDecodeError:
            obj = None
        if isinstance(obj, dict) and _full_shape(obj):
            last = obj
        idx = text.find("{", idx + 1)
    return last


def _str_list(value) -> list:
    if not isinstance(value, list):
        return []
    return [str(v) for v in value if isinstance(v, (str, int, float))]


def parse_verdict(text: str) -> Verdict | None:
    """Validate the reviewer output into a Verdict, or None on any
    structural failure. None must be handled as not-approved."""
    obj = extract_json_object(text)
    if obj is None:
        return None
    status = obj.get("status")
    if status not in STATUSES:
        return None
    summary = obj.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        return None
    criteria: list = []
    raw_criteria = obj.get("criteria_status")
    if isinstance(raw_criteria, list):
        for entry in raw_criteria:
            if not isinstance(entry, dict):
                continue
            c_status = entry.get("status")
            if c_status not in CRITERION_STATUSES:
                c_status = "unknown"
            criteria.append(
                {
                    "id": str(entry.get("id", "?")),
                    "section": str(entry.get("section", "")),
                    "text": str(entry.get("text", "")),
                    "status": c_status,
                    "evidence": str(entry.get("evidence", "")),
                }
            )
    return Verdict(
        status=status,
        summary=summary.strip(),
        criteria_status=criteria,
        required_next_steps=_str_list(obj.get("required_next_steps")),
        plan_refinements=_str_list(obj.get("plan_refinements")),
        tests_to_run_next=_str_list(obj.get("tests_to_run_next")),
        risk_flags=_str_list(obj.get("risk_flags")),
        should_open_pr=bool(obj.get("should_open_pr", False)),
        raw_text=text,
    )


RETRY_NUDGE = (
    "\n\nYour previous response was not a single valid JSON object matching "
    "the required schema. Return ONLY the JSON object now. No prose, no "
    "markdown fences, no text before or after it."
)
