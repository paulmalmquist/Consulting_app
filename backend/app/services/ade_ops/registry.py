"""The ADE Ops skill catalog — pure data the supervisor reads.

Every entry is metadata only; none carries an executable shell/command string.
Tier 0-1 entries are ``executable=True`` (the PR 1 read-only commands). Tier >= 2
entries are registered for visibility but ``executable=False`` — the supervisor
refuses to run them in PR 1.
"""
from __future__ import annotations

from app.services.ade_ops.models import OpsMode, OpsSkillDef, RiskTier


class OpsSkillRegistry:
    def __init__(self) -> None:
        self._skills: dict[str, OpsSkillDef] = {}

    def register(self, skill: OpsSkillDef) -> None:
        if skill.name in self._skills:
            raise ValueError(f"Duplicate ADE Ops skill: {skill.name}")
        # Tier-executability invariant, enforced at registration so it can never
        # drift: only tiers 0-1 may be executable.
        if skill.executable and skill.risk_tier >= RiskTier.DRY_RUN:
            raise ValueError(
                f"{skill.name}: tier {int(skill.risk_tier)} cannot be executable in PR 1"
            )
        self._skills[skill.name] = skill

    def get(self, name: str) -> OpsSkillDef | None:
        return self._skills.get(name)

    def list_all(self) -> list[OpsSkillDef]:
        return list(self._skills.values())

    def describe_all(self) -> list[dict]:
        return [s.manifest() for s in self._skills.values()]


def _build_registry() -> OpsSkillRegistry:
    reg = OpsSkillRegistry()

    # ── The 5 PR-1 commands (tier 0-1, executable, read-only) ──────────────
    reg.register(OpsSkillDef(
        name="ade.inventory.scan_pipelines",
        family="inventory", description="Inventory governed ops + MCP skills and recent governed activity. Cloud pipeline inventory is not configured in PR 1.",
        risk_tier=RiskTier.INVENTORY, mode=OpsMode.READ_ONLY, executable=True,
        approval_required=False, lane="reliability",
        input_fields=["env_id", "platform", "include_cloud_inventory"],
    ))
    reg.register(OpsSkillDef(
        name="ade.lineage.trust_number",
        family="lineage", description="Assess whether a number can be trusted, from governed grounding/receipt signal. External lineage is not configured in PR 1.",
        risk_tier=RiskTier.RECOMMENDATION, mode=OpsMode.RECOMMENDATION_ONLY, executable=True,
        approval_required=False, lane="lineage",
        input_fields=["metric_name", "metric_ref", "dashboard_id", "env_id"],
    ))
    reg.register(OpsSkillDef(
        name="ade.freshness.assess",
        family="freshness", description="Assess data-product freshness and recommend a refresh cadence. Needs warehouse as-of telemetry (PR 2).",
        risk_tier=RiskTier.RECOMMENDATION, mode=OpsMode.RECOMMENDATION_ONLY, executable=True,
        approval_required=False, lane="freshness",
        input_fields=["table_name", "data_product_id", "platform"],
    ))
    reg.register(OpsSkillDef(
        name="ade.cost.show_hotspots",
        family="cost", description="Surface cost hotspots by data product. Needs platform billing/usage (PR 3).",
        risk_tier=RiskTier.RECOMMENDATION, mode=OpsMode.RECOMMENDATION_ONLY, executable=True,
        approval_required=False, lane="cost",
        input_fields=["platform", "lookback_days"],
    ))
    reg.register(OpsSkillDef(
        name="ade.compute.recommend_rightsize",
        family="compute", description="Recommend compute right-sizing from utilization. Needs warehouse metering/query history (PR 3-4).",
        risk_tier=RiskTier.RECOMMENDATION, mode=OpsMode.RECOMMENDATION_ONLY, executable=True,
        approval_required=False, lane="compute",
        input_fields=["platform", "resource_id", "lookback_days"],
    ))

    # ── Tier >= 2 skills: registered, visible, NOT executable in PR 1 ──────
    for name, family, tier, mode, lane, desc in [
        ("ade.compute.create_rightsize_patch", "compute", RiskTier.DRY_RUN, OpsMode.DRY_RUN, "changes", "Generate a dry-run right-size patch + ticket."),
        ("ade.contracts.assess_breaking_change", "contracts", RiskTier.DRY_RUN, OpsMode.DRY_RUN, "changes", "Assess a proposed schema change for breaking impact."),
        ("ade.backfill.execute", "backfill", RiskTier.PROD_WRITE, OpsMode.WRITE_GATED, "changes", "Execute an approved backfill."),
        ("ade.execution.apply_approved_sql", "execution", RiskTier.PROD_WRITE, OpsMode.WRITE_GATED, "changes", "Apply an approved allowlisted SQL change."),
        ("ade.execution.rollback", "execution", RiskTier.ROLLBACK, OpsMode.ROLLBACK, "changes", "Roll back a prior change to its saved state."),
    ]:
        reg.register(OpsSkillDef(
            name=name, family=family, description=desc, risk_tier=tier, mode=mode,
            executable=False, approval_required=True, lane=lane,
        ))

    return reg


ops_registry = _build_registry()
