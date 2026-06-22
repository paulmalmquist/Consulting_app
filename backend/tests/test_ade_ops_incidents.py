"""ADE Ops PR 6B — incident state machine. Records + remediation; never act."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

import pytest  # noqa: E402

from app.services.ade_ops import incidents  # noqa: E402
from app.services.ade_ops.incidents import (  # noqa: E402
    IncidentState,
    IncidentTransitionError,
)

EV = [{"label": "observed", "value": 150, "source": "bq"}]


def _open(verdict="rollback_recommended"):
    return incidents.open_from_verdict(
        verdict=verdict, approval_id="ap-1", provider="snowflake",
        target_ref="ADE_OPS_NONPROD_WH", recommendation_id="rec-1", evidence=EV)


# ── open from verdict ─────────────────────────────────────────────────────────

def test_open_from_rollback_recommended_is_high_severity():
    inc = _open("rollback_recommended")
    assert inc.state is IncidentState.DETECTED and inc.severity == "high"
    assert inc.source_verdict == "rollback_recommended" and inc.evidence == EV


def test_open_from_degraded():
    inc = _open("degraded")
    assert inc.state is IncidentState.DETECTED


def test_non_incident_verdicts_refused():
    for v in ("accepted", "still_observing", "insufficient_evidence", ""):
        assert incidents.can_open_from_verdict(v) is False
        with pytest.raises(IncidentTransitionError):
            incidents.open_from_verdict(verdict=v, approval_id=None, provider=None,
                                        target_ref=None, recommendation_id=None, evidence=[])


# ── valid + invalid transitions ───────────────────────────────────────────────

def test_full_happy_path():
    inc = _open()
    incidents.transition(inc, IncidentState.TRIAGED)
    incidents.transition(inc, IncidentState.OWNER_NOTIFIED, owner="paul")
    incidents.transition(inc, IncidentState.MITIGATION_PLANNED, mitigation_plan="raise auto_suspend")
    incidents.transition(inc, IncidentState.RESOLVED, resolution_note="restored prior value")
    incidents.transition(inc, IncidentState.CLOSED, resolution_note="verified stable")
    assert inc.state is IncidentState.CLOSED


def test_cannot_skip_states():
    inc = _open()
    with pytest.raises(IncidentTransitionError) as e:
        incidents.transition(inc, IncidentState.CLOSED, resolution_note="x", evidence=EV)
    assert "invalid_transition" in str(e.value)


def test_cannot_reopen_closed():
    inc = _open()
    for to in (IncidentState.TRIAGED, IncidentState.MITIGATION_PLANNED):
        incidents.transition(inc, to, mitigation_plan="p")
    incidents.transition(inc, IncidentState.RESOLVED, resolution_note="done")
    incidents.transition(inc, IncidentState.CLOSED, resolution_note="done")
    with pytest.raises(IncidentTransitionError):
        incidents.transition(inc, IncidentState.TRIAGED)


def test_owner_required_for_notified():
    inc = _open()
    incidents.transition(inc, IncidentState.TRIAGED)
    with pytest.raises(IncidentTransitionError) as e:
        incidents.transition(inc, IncidentState.OWNER_NOTIFIED)  # no owner
    assert "owner_required" in str(e.value)


def test_mitigation_plan_required():
    inc = _open()
    incidents.transition(inc, IncidentState.TRIAGED)
    with pytest.raises(IncidentTransitionError) as e:
        incidents.transition(inc, IncidentState.MITIGATION_PLANNED)  # no plan
    assert "mitigation_plan_required" in str(e.value)


# ── no silent close ───────────────────────────────────────────────────────────

def test_resolve_requires_resolution_note():
    inc = _open()
    incidents.transition(inc, IncidentState.TRIAGED)
    incidents.transition(inc, IncidentState.MITIGATION_PLANNED, mitigation_plan="p")
    with pytest.raises(IncidentTransitionError) as e:
        incidents.transition(inc, IncidentState.RESOLVED)  # no note
    assert "resolution_note_required" in str(e.value)


def test_close_requires_evidence():
    # An incident opened with no evidence cannot be closed silently.
    inc = incidents.open_from_verdict(verdict="degraded", approval_id=None, provider=None,
                                      target_ref=None, recommendation_id=None, evidence=[])
    incidents.transition(inc, IncidentState.TRIAGED)
    incidents.transition(inc, IncidentState.MITIGATION_PLANNED, mitigation_plan="p")
    incidents.transition(inc, IncidentState.RESOLVED, resolution_note="note")
    with pytest.raises(IncidentTransitionError) as e:
        incidents.transition(inc, IncidentState.CLOSED, resolution_note="note")  # no evidence
    assert "evidence_required_to_close" in str(e.value)


# ── never acts on a provider ──────────────────────────────────────────────────

def test_no_execution_token_in_incidents_module():
    import ast
    import inspect
    tree = ast.parse(inspect.getsource(incidents))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            b = node.body
            if b and isinstance(b[0], ast.Expr) and isinstance(getattr(b[0], "value", None), ast.Constant) \
                    and isinstance(b[0].value.value, str):
                b[0].value.value = ""
    code = ast.unparse(tree).lower()
    for tok in ("subprocess", "execute_auto_suspend", "client.execute", "alter warehouse",
                "snowflake.connector", "rollback_execute", "undeploy"):
        assert tok not in code, f"incidents must not act on a provider; found {tok!r}"


def test_incident_serializes():
    d = _open().to_dict()
    assert d["state"] == "detected" and d["severity"] == "high" and d["source_verdict"] == "rollback_recommended"
