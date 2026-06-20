"""Recommendation artifacts for ADE Ops (PR 4) — observations → governed advice.

PR 4 turns normalized freshness/cost/compute observations into one common
`AdeOpsRecommendation` artifact: evidence, confidence, risk, expected impact, an
explicit next step, and (when a Tier-2 action is implied) a **text-only** dry-run
artifact + a local import-ready ADO ticket payload.

The line PR 4 holds: it produces ARTIFACTS, never actions. A recommendation may
say "candidate" — it never executes a provider command, never mutates anything,
generates no real ticket (the payload is import-ready only, routed through the
approved intake path separately), and carries no rollback/execution logic. The
``dry_run_artifact`` is descriptive text, explicitly labelled not-executed.

`risk_tier` on the artifact describes the *recommended action's* tier (1 = pure
recommendation, 2 = a dry-run artifact was produced), NOT the command's tier —
the command that produced it stays tier-1 read-only.
"""
from __future__ import annotations

import re
from enum import StrEnum

from pydantic import BaseModel, Field

from app.services.ade_ops.models import OpsConfidence, OpsStatus, RiskTier


class RecCategory(StrEnum):
    FRESHNESS = "freshness"
    COST = "cost"
    COMPUTE = "compute"
    QUALITY = "quality"
    TRUST = "trust"


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "none"


class AdeOpsRecommendation(BaseModel):
    """One governed recommendation artifact. Common shape across all categories."""

    recommendation_id: str
    command_name: str
    target_ref: str | None = None
    target_type: str | None = None
    provider: str | None = None
    status: OpsStatus
    category: RecCategory
    finding: str | None = None
    recommendation: str | None = None
    confidence: OpsConfidence | None = None
    risk_tier: RiskTier = RiskTier.RECOMMENDATION
    expected_impact: str | None = None
    evidence: list[dict] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    null_reason: str | None = None
    dry_run_artifact: str | None = None      # TEXT only; never executed
    approval_required: bool = False
    next_step: str | None = None
    observation_window: str | None = None
    rollback_required: bool = False

    def to_dict(self) -> dict:
        return self.model_dump(mode="json")


def make_recommendation(
    *, command_name: str, category: RecCategory, status: OpsStatus,
    target_ref: str | None = None, target_type: str | None = None,
    provider: str | None = None, finding: str | None = None,
    recommendation: str | None = None, confidence: OpsConfidence | None = None,
    expected_impact: str | None = None, evidence: list[dict] | None = None,
    assumptions: list[str] | None = None, null_reason: str | None = None,
    dry_run_artifact: str | None = None, next_step: str | None = None,
    observation_window: str | None = None,
) -> AdeOpsRecommendation:
    """Build a recommendation. risk_tier is derived: a dry-run artifact ⇒ Tier 2
    (the implied action is a write that would need approval); otherwise Tier 1."""
    tier = RiskTier.DRY_RUN if dry_run_artifact else RiskTier.RECOMMENDATION
    rid = f"aderec-{category.value}-{_slug(command_name)}-{_slug(target_ref or 'na')}"
    return AdeOpsRecommendation(
        recommendation_id=rid, command_name=command_name, target_ref=target_ref,
        target_type=target_type, provider=provider, status=status, category=category,
        finding=finding, recommendation=recommendation, confidence=confidence,
        risk_tier=tier, expected_impact=expected_impact, evidence=evidence or [],
        assumptions=assumptions or [], null_reason=null_reason,
        dry_run_artifact=dry_run_artifact,
        approval_required=bool(dry_run_artifact),          # any dry-run implies an approval gate
        next_step=next_step, observation_window=observation_window,
        rollback_required=bool(dry_run_artifact),          # a write-implying rec would need rollback
    )


def dry_run_text(title: str, lines: list[str]) -> str:
    """A clearly-labelled, NON-EXECUTED dry-run description (text only)."""
    body = "\n".join(f"  - {ln}" for ln in lines)
    return (f"DRY-RUN (NOT EXECUTED) — {title}\n{body}\n"
            "This is a description of a proposed change for human review. ADE Ops "
            "does not execute it; apply only through the approved execution path (PR 5).")


def ado_ticket_payload(rec: AdeOpsRecommendation) -> dict:
    """A local, import-ready ADO ticket payload. NOT pushed to the board here —
    creating a real work item routes through the approved azure-devops-intake path."""
    return {
        "_meta": {"import_ready": True, "pushed": False,
                  "note": "Create via azure-devops-intake; not auto-created by ADE Ops."},
        "type": "Task",
        "title": f"[ADE Ops] {rec.category.value}: {rec.finding or rec.recommendation_id}",
        "description": (rec.recommendation or "") + (
            f"\n\nExpected impact: {rec.expected_impact}" if rec.expected_impact else ""),
        "tags": ["ade_ops", f"category:{rec.category.value}",
                 f"tier{int(rec.risk_tier)}", f"confidence:{rec.confidence.value if rec.confidence else 'na'}"],
        "evidence": rec.evidence,
        "approval_required": rec.approval_required,
    }


# ── Boring, explainable rules ─────────────────────────────────────────────────

def freshness_recommendation(*, product_label: str, status: str, age_seconds: float | None,
                             target_seconds: int, evidence: list[dict],
                             reason: str | None) -> AdeOpsRecommendation:
    """stale-beyond-target → cadence-change candidate; failed → incident follow-up;
    no as_of → blocked durable_source_unavailable."""
    cmd, cat = "ade.freshness.assess", RecCategory.FRESHNESS
    if age_seconds is None:
        return make_recommendation(
            command_name=cmd, category=cat, status=OpsStatus.BLOCKED,
            target_ref=product_label, target_type="data_product",
            finding="No authoritative as-of available.", null_reason="durable_source_unavailable",
            next_step="Confirm the product's freshness contract emits an as_of before assessing cadence.")
    if status == "failed":
        return make_recommendation(
            command_name=cmd, category=cat, status=OpsStatus.DEGRADED,
            target_ref=product_label, target_type="data_product", confidence=OpsConfidence.HIGH,
            finding=f"Pipeline reports failed: {reason or 'no reason given'}.",
            recommendation="Open an incident-style follow-up; refresh is not completing.",
            expected_impact="Restores trust in a product downstream decisions depend on.",
            evidence=evidence,
            next_step="Triage the failing refresh (owner review); do not rely on this product until green.",
            observation_window="next 3 refresh cycles")
    if status == "stale" or (age_seconds > 2 * target_seconds):
        return make_recommendation(
            command_name=cmd, category=cat, status=OpsStatus.DEGRADED,
            target_ref=product_label, target_type="data_product", confidence=OpsConfidence.MEDIUM,
            finding=f"Data is {int(age_seconds)}s old vs a {target_seconds}s target.",
            recommendation="Cadence-change candidate: recommend owner review of the refresh schedule.",
            expected_impact="Closes the staleness gap for decisions that read this product.",
            evidence=evidence,
            next_step="Owner reviews whether to restore/raise the refresh cadence.",
            observation_window="next 3 refresh cycles")
    return make_recommendation(
        command_name=cmd, category=cat, status=OpsStatus.OK,
        target_ref=product_label, target_type="data_product", confidence=OpsConfidence.MEDIUM,
        finding=f"Fresh: {int(age_seconds)}s old, within {target_seconds}s target.",
        recommendation="No cadence change recommended.", evidence=evidence)


def cost_recommendation(*, provider: str, cost_observation_available: bool,
                        null_reason: str | None, evidence: list[dict]) -> AdeOpsRecommendation:
    """cost observations present → rank hotspots (candidate only); missing billing
    evidence → degraded/blocked with NO savings estimate."""
    cmd, cat = "ade.cost.show_hotspots", RecCategory.COST
    if not cost_observation_available:
        return make_recommendation(
            command_name=cmd, category=cat, status=OpsStatus.BLOCKED, provider=provider,
            finding="No billing/cost-usage evidence for this provider.",
            null_reason=(null_reason or "data_source_not_configured"),
            next_step="Wire read-only billing/usage telemetry before any cost ranking.",
            evidence=evidence,
            assumptions=["No savings estimate is produced without billing evidence."])
    return make_recommendation(
        command_name=cmd, category=cat, status=OpsStatus.DEGRADED, provider=provider,
        confidence=OpsConfidence.LOW,
        finding="Cost observation is available for this provider.",
        recommendation="Candidate: rank cost hotspots from observed usage. No savings figure asserted in PR 4.",
        evidence=evidence,
        assumptions=["Ranking only; PR 4 does not estimate dollar savings or recommend a resize."],
        next_step="Review ranked hotspots; a right-size candidate (if any) is a separate recommendation.")


def rightsize_recommendation(*, provider: str, target_ref: str | None,
                             runtime: bool, cost: bool, utilization: bool,
                             evidence: list[dict]) -> AdeOpsRecommendation:
    """runtime+cost+utilization present → CANDIDATE (with text-only dry-run);
    missing any → degraded/blocked, NO resize recommendation."""
    cmd, cat = "ade.compute.recommend_rightsize", RecCategory.COMPUTE
    missing = [n for n, present in (("runtime", runtime), ("cost", cost), ("utilization", utilization)) if not present]
    if missing:
        return make_recommendation(
            command_name=cmd, category=cat, status=OpsStatus.BLOCKED, provider=provider,
            target_ref=target_ref, target_type="compute_resource",
            finding=f"Missing required evidence: {', '.join(missing)}.",
            null_reason="data_source_not_configured",
            assumptions=["No resize is recommended without runtime + cost + utilization evidence."],
            next_step="Collect the missing read-only telemetry before assessing right-sizing.",
            evidence=evidence)
    dry = dry_run_text(
        f"right-size candidate for {target_ref}",
        ["Proposed: review for downsize based on observed low utilization.",
         "No size value asserted; a concrete target requires PR 5 validation against SLA margin."])
    return make_recommendation(
        command_name=cmd, category=cat, status=OpsStatus.DEGRADED, provider=provider,
        target_ref=target_ref, target_type="compute_resource", confidence=OpsConfidence.LOW,
        finding="Runtime, cost, and utilization evidence are present.",
        recommendation="Right-size CANDIDATE only — flag for human review, do not apply.",
        expected_impact="Potential cost reduction if utilization is durably low (unquantified in PR 4).",
        evidence=evidence,
        assumptions=["Candidate only. No provider command is issued. SLA-margin check is PR 5."],
        dry_run_artifact=dry,
        next_step="Human reviews the candidate; concrete sizing + approval-gated apply is PR 5.",
        observation_window="14-day utilization window",
    )
