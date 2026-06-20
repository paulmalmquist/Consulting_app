"""Incident state machine for ADE Ops (PR 6B) — records + remediation, never act.

A watcher verdict of `degraded` or `rollback_recommended` (PR 6A) — or any
failed/stale outcome — can open a governed incident. The incident moves through a
validated state machine and links back to the approval / recommendation / target /
evidence that triggered it. It does NOT roll back a provider, mutate production, or
page anyone; it is a record + remediation artifact, and it cannot be closed without
a resolution note + evidence (enforced here and at the schema level).

Decoupling: this module takes the watcher verdict as a plain string + evidence
list, NOT a `watcher.py` import — so incidents are independent of PR 6A's merge
order and can't drag the watcher's evaluation logic into the incident path.
"""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class IncidentState(StrEnum):
    DETECTED = "detected"
    TRIAGED = "triaged"
    OWNER_NOTIFIED = "owner_notified"
    MITIGATION_PLANNED = "mitigation_planned"
    RESOLVED = "resolved"
    CLOSED = "closed"


# Allowed forward transitions. No skipping straight to closed; no reopening a
# closed incident (a new incident is opened instead).
_TRANSITIONS: dict[IncidentState, set[IncidentState]] = {
    IncidentState.DETECTED: {IncidentState.TRIAGED},
    IncidentState.TRIAGED: {IncidentState.OWNER_NOTIFIED, IncidentState.MITIGATION_PLANNED},
    IncidentState.OWNER_NOTIFIED: {IncidentState.MITIGATION_PLANNED},
    IncidentState.MITIGATION_PLANNED: {IncidentState.RESOLVED},
    IncidentState.RESOLVED: {IncidentState.CLOSED},
    IncidentState.CLOSED: set(),
}

# Watcher verdicts that justify opening an incident.
OPENABLE_VERDICTS = frozenset({"degraded", "rollback_recommended"})


class IncidentTransitionError(Exception):
    pass


class Incident(BaseModel):
    id: str | None = None
    approval_id: str | None = None
    source_verdict: str | None = None
    provider: str | None = None
    target_ref: str | None = None
    recommendation_id: str | None = None
    title: str
    severity: str = "medium"
    state: IncidentState = IncidentState.DETECTED
    owner: str | None = None
    mitigation_plan: str | None = None
    resolution_note: str | None = None
    evidence: list[dict] = Field(default_factory=list)

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


def can_open_from_verdict(verdict: str | None) -> bool:
    return (verdict or "") in OPENABLE_VERDICTS


def open_from_verdict(
    *, verdict: str, approval_id: str | None, provider: str | None, target_ref: str | None,
    recommendation_id: str | None, evidence: list[dict], severity: str = "medium",
) -> Incident:
    """Open a `detected` incident from a watcher verdict. Refuses verdicts that
    don't justify an incident (e.g. accepted / still_observing)."""
    if not can_open_from_verdict(verdict):
        raise IncidentTransitionError(f"verdict_not_incident_worthy:{verdict}")
    sev = "high" if verdict == "rollback_recommended" else severity
    title = f"{verdict} on {provider or 'unknown'}:{target_ref or 'unknown'}"
    return Incident(
        approval_id=approval_id, source_verdict=verdict, provider=provider,
        target_ref=target_ref, recommendation_id=recommendation_id, evidence=evidence,
        title=title, severity=sev, state=IncidentState.DETECTED)


def transition(
    incident: Incident, to_state: IncidentState, *,
    owner: str | None = None, mitigation_plan: str | None = None,
    resolution_note: str | None = None, evidence: list[dict] | None = None,
) -> Incident:
    """Move the incident to `to_state` if the transition is valid. Enforces the
    no-silent-close rule: resolving/closing requires a resolution note, and closing
    requires evidence on the incident. Never executes any provider action."""
    allowed = _TRANSITIONS.get(incident.state, set())
    if to_state not in allowed:
        raise IncidentTransitionError(f"invalid_transition:{incident.state.value}->{to_state.value}")

    if to_state is IncidentState.OWNER_NOTIFIED:
        incident.owner = owner or incident.owner
        if not incident.owner:
            raise IncidentTransitionError("owner_required")
    if to_state is IncidentState.MITIGATION_PLANNED:
        incident.mitigation_plan = mitigation_plan or incident.mitigation_plan
        if not incident.mitigation_plan:
            raise IncidentTransitionError("mitigation_plan_required")
    if to_state in (IncidentState.RESOLVED, IncidentState.CLOSED):
        incident.resolution_note = resolution_note or incident.resolution_note
        if not incident.resolution_note:
            raise IncidentTransitionError("resolution_note_required")
    if evidence:
        incident.evidence = [*incident.evidence, *evidence]
    if to_state is IncidentState.CLOSED and not incident.evidence:
        raise IncidentTransitionError("evidence_required_to_close")

    incident.state = to_state
    return incident
