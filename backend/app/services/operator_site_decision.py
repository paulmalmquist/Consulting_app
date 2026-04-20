"""Operator Site Decision service.

Builds a decision-grade payload for a Hall Boys development site: recommendation,
conviction, fail-condition, quantified risks, what-changed event log, portfolio
fit, and workstream rollup. Derives everything from the existing Hall Boys
fixture (read via app.services.operator) — no new schema or migrations.

Scoped to Hall Boys (multi_entity_operator) only. Does not touch REPE code.

Fail-loud: upstream fields that cannot be derived return ``None`` alongside a
``null_reason`` so the UI can render "Not available — {reason}" rather than
fabricate a number.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable
from uuid import UUID

_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "winston_demo"
    / "hall_boys_operator_seed.json"
)

# Heuristic IRR impact table for risk severities (basis points).
# v1 values keyed by constraint category; null_reason used for unknowns.
_IRR_BPS_BY_CATEGORY = {
    "blocking": -320,
    "setback": -280,
    "parking": -180,
    "cost_impact": -140,
    "delaying": -100,
    "environmental": -220,
    "historic": -260,
    "variance": -220,
}

# Hurdle used for Base IRR KPI traffic light.
DEFAULT_IRR_HURDLE_PCT = 15.0
# Assumed capital structure when fixture doesn't specify.
DEFAULT_DEBT_RATIO = 0.65


class OperatorSiteDecisionError(LookupError):
    """Site not found in the Hall Boys fixture."""


@lru_cache(maxsize=1)
def _fixture() -> dict[str, Any]:
    return json.loads(_FIXTURE_PATH.read_text())


def _by_id(rows: Iterable[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    return {row[key]: row for row in rows if key in row}


def _find_site(site_id: str) -> dict[str, Any]:
    for site in _fixture().get("sites", []):
        if site.get("id") == site_id:
            return site
    raise OperatorSiteDecisionError(f"Site {site_id} not found in Hall Boys fixture")


def _feasibility_for(site_id: str) -> dict[str, Any] | None:
    for fa in _fixture().get("feasibility_assessments", []):
        if fa.get("site_id") == site_id:
            return fa
    return None


def _scenarios_for(site_id: str) -> dict[str, Any] | None:
    for sc in _fixture().get("development_scenarios", []):
        if sc.get("site_id") == site_id:
            return sc
    return None


def _municipality_for(site: dict[str, Any]) -> dict[str, Any] | None:
    muni_id = site.get("municipality_id")
    if not muni_id:
        return None
    for muni in _fixture().get("municipalities", []):
        if muni.get("id") == muni_id:
            return muni
    return None


def _events_for(site_id: str) -> list[dict[str, Any]]:
    return [
        evt
        for evt in _fixture().get("rule_change_events", [])
        if site_id in (evt.get("affected_site_ids") or [])
    ]


def _comparable_projects_for(comparable_ids: list[str]) -> list[dict[str, Any]]:
    by_id = _by_id(_fixture().get("comparable_projects", []))
    return [by_id[cid] for cid in comparable_ids if cid in by_id]


def _rule(rule_id: str) -> dict[str, Any] | None:
    for rule in _fixture().get("ordinance_rules", []):
        if rule.get("id") == rule_id:
            return rule
    return None


# ---------------------------------------------------------------------------
# Derivations
# ---------------------------------------------------------------------------


def _derive_recommendation(
    site: dict[str, Any],
    feasibility: dict[str, Any] | None,
    scenarios: dict[str, Any] | None,
) -> tuple[str, int]:
    """Return (recommendation, conviction 0-100).

    Weighted blend:
      feasibility_score (0-1)   → 45%
      (1 - risk_score) (0-1)    → 35%  (risk_score inverted)
      scenario_headroom (0-1)   → 20%  (base IRR vs hurdle, clamped)
    """
    feas = float(feasibility.get("risk_score", 0.5)) if feasibility else 0.5
    feasibility_score = float(site.get("feasibility_score", feas))
    risk_score = float(feasibility.get("risk_score", 0.5)) if feasibility else 0.5

    headroom = 0.5
    if scenarios:
        base = next((p for p in scenarios.get("presets", []) if p.get("id") == "base"), None)
        if base:
            base_irr = float(base.get("outputs", {}).get("irr_pct") or 0)
            # Linear: hurdle → 0.5, hurdle+10pt → 1.0, hurdle-10pt → 0.0
            headroom = max(0.0, min(1.0, 0.5 + (base_irr - DEFAULT_IRR_HURDLE_PCT) / 20.0))

    conviction_raw = 0.45 * feasibility_score + 0.35 * (1 - risk_score) + 0.20 * headroom
    conviction = round(conviction_raw * 100)

    blockers_exist = bool(
        feasibility
        and any(c.get("impact") == "blocking" for c in feasibility.get("constraints", []))
    )

    if conviction >= 75 and not blockers_exist:
        rec = "proceed"
    elif conviction >= 55:
        rec = "proceed_with_conditions"
    elif conviction >= 35:
        rec = "hold"
    else:
        rec = "reject"

    return rec, conviction


def _derive_fail_condition(scenarios: dict[str, Any] | None) -> str | None:
    if not scenarios:
        return None
    presets = {p["id"]: p for p in scenarios.get("presets", [])}
    conservative = presets.get("conservative")
    base = presets.get("base")
    if not (conservative and base):
        return None
    cons_timeline = conservative.get("outputs", {}).get("timeline_days")
    cons_cost = conservative.get("outputs", {}).get("total_dev_cost_usd")
    base_irr = base.get("outputs", {}).get("irr_pct")
    hurdle = DEFAULT_IRR_HURDLE_PCT
    # Fail boundary is framed as "beyond conservative assumptions" because
    # conservative already shows the thinnest profitable scenario.
    parts = []
    if cons_timeline:
        parts.append(f"approval runs past {int(cons_timeline)}d")
    if cons_cost:
        parts.append(f"total dev cost exceeds ${cons_cost / 1_000_000:.1f}M")
    if base_irr is not None and base_irr < hurdle:
        parts.append(f"base IRR falls below the {hurdle:.0f}% hurdle (currently {base_irr:.1f}%)")
    if not parts:
        return None
    return "Deal fails if " + " OR ".join(parts)


def _classify_constraint(constraint: dict[str, Any]) -> tuple[str, int | None, str | None]:
    """Return (severity, irr_impact_bps, null_reason)."""
    impact = (constraint.get("impact") or "").lower()
    rule_id = constraint.get("rule_id") or ""
    severity = "red" if impact == "blocking" else "amber"
    # Look up by keyword first (rule_id carries semantic hints), then by impact type.
    bps = None
    for keyword, value in _IRR_BPS_BY_CATEGORY.items():
        if keyword in rule_id.lower():
            bps = value
            break
    if bps is None:
        bps = _IRR_BPS_BY_CATEGORY.get(impact)
    null_reason = None if bps is not None else "no historical IRR mapping for this constraint"
    return severity, bps, null_reason


def _derive_risks(
    feasibility: dict[str, Any] | None,
    scenarios: dict[str, Any] | None,
    events: list[dict[str, Any]],
    owner: str | None,
) -> list[dict[str, Any]]:
    risks: list[dict[str, Any]] = []

    # 1. Constraint-driven risks from feasibility assessment
    if feasibility:
        for idx, constraint in enumerate(feasibility.get("constraints", [])):
            severity, bps, null_reason = _classify_constraint(constraint)
            rule = _rule(constraint.get("rule_id") or "")
            label = (rule.get("title") if rule else None) or constraint.get("rule_id") or "Constraint"
            risks.append(
                {
                    "risk_id": f"fc-{idx}-{constraint.get('rule_id') or 'unknown'}",
                    "label": label,
                    "severity": severity,
                    "irr_impact_bps": bps,
                    "null_reason": null_reason,
                    "confidence": constraint.get("confidence", "medium"),
                    "owner": owner,
                    "due_date": None,
                    "required_action": constraint.get("note") or "Assess and mitigate.",
                    "context_task_id": None,
                }
            )

    # 2. Active ordinance impact on this site's scenarios
    active = (scenarios or {}).get("active_ordinance_impact")
    if active:
        delta = active.get("delta_vs_base") or {}
        irr_delta_pct = delta.get("irr_pct")
        bps = int(round(irr_delta_pct * 100)) if irr_delta_pct is not None else None
        risks.append(
            {
                "risk_id": f"ord-{active.get('ordinance_event_id', 'active')}",
                "label": active.get("description") or "Active ordinance impact",
                "severity": "red" if (bps is not None and bps <= -300) else "amber",
                "irr_impact_bps": bps,
                "null_reason": None if bps is not None else "ordinance delta not quantified",
                "confidence": delta.get("confidence", "medium"),
                "owner": owner,
                "due_date": active.get("event_effective_date"),
                "required_action": "Re-run scenarios under new ordinance; file variance if viable.",
                "context_task_id": None,
            }
        )

    # 3. Non-impact rule-change events (municipality-wide signals affecting site)
    for evt in events:
        if any(r["risk_id"].startswith(f"ord-{evt.get('id')}") for r in risks):
            continue  # already covered above
        impact = evt.get("impact") or {}
        cost = impact.get("estimated_cost_usd") or 0
        bps = -round(cost / 20000) if cost else None  # heuristic: $20K = 1bp IRR
        risks.append(
            {
                "risk_id": f"evt-{evt.get('id', 'unknown')}",
                "label": evt.get("summary") or "Rule change event",
                "severity": "amber" if (evt.get("severity") or "") == "cost_impact" else "red",
                "irr_impact_bps": bps,
                "null_reason": None if bps is not None else "cost impact not yet quantified",
                "confidence": evt.get("confidence", "medium"),
                "owner": owner,
                "due_date": evt.get("effective_date"),
                "required_action": "Model cost impact and update underwriting.",
                "context_task_id": None,
            }
        )

    # Sort by severity (red first) then by |bps| descending, cap at 5
    def _sort_key(r: dict[str, Any]) -> tuple[int, int]:
        sev_rank = 0 if r["severity"] == "red" else 1
        bps_val = abs(r["irr_impact_bps"] or 0)
        return (sev_rank, -bps_val)

    risks.sort(key=_sort_key)
    return risks[:5]


def _derive_event_log(
    site_id: str,
    events: list[dict[str, Any]],
    feasibility: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    log: list[dict[str, Any]] = []
    for evt in events:
        impact = evt.get("impact") or {}
        cost = impact.get("estimated_cost_usd") or 0
        delay = impact.get("estimated_delay_days") or 0
        magnitude_parts: list[str] = []
        if cost:
            magnitude_parts.append(f"+${cost/1000:.0f}K cost")
        if delay:
            magnitude_parts.append(f"+{delay}d delay")
        magnitude = " · ".join(magnitude_parts) if magnitude_parts else None
        log.append(
            {
                "event_id": evt.get("id"),
                "ts": evt.get("effective_date"),
                "source": "ordinance",
                "change": evt.get("summary"),
                "magnitude": magnitude,
                "changes_recommendation": (evt.get("severity") or "") in ("blocking", "cost_impact"),
            }
        )
    if feasibility and feasibility.get("generated_at"):
        log.append(
            {
                "event_id": feasibility.get("id"),
                "ts": feasibility.get("generated_at"),
                "source": "assumption",
                "change": feasibility.get("summary"),
                "magnitude": None,
                "changes_recommendation": False,
            }
        )
    log.sort(key=lambda e: e.get("ts") or "", reverse=True)
    return log


def _derive_portfolio_fit(site_id: str) -> dict[str, Any]:
    sites = _fixture().get("sites", [])
    scenarios_by_site = {s["site_id"]: s for s in _fixture().get("development_scenarios", [])}
    munis_by_id = _by_id(_fixture().get("municipalities", []))

    scored: list[dict[str, Any]] = []
    for s in sites:
        sid = s.get("id")
        scn = scenarios_by_site.get(sid, {})
        base = next((p for p in scn.get("presets", []) if p.get("id") == "base"), None)
        base_irr = float(base.get("outputs", {}).get("irr_pct") or 0) if base else 0
        timeline = float(base.get("outputs", {}).get("timeline_days") or 0) if base else 0
        muni = munis_by_id.get(s.get("municipality_id") or "") or {}
        friction = float(muni.get("overall_friction_score") or 0)
        scored.append(
            {"site_id": sid, "name": s.get("name"), "irr": base_irr, "timeline": timeline, "friction": friction}
        )

    total = len(scored)
    if not total:
        return {
            "rank_by_irr": {"rank": 0, "of": 0},
            "rank_by_timeline": {"rank": 0, "of": 0},
            "rank_by_friction": {"rank": 0, "of": 0},
            "headline": "Not available — no comparable sites in portfolio",
            "peers": [],
        }

    def _rank_of(site_id_: str, key: str, reverse: bool) -> int:
        ordered = sorted(scored, key=lambda r: r[key], reverse=reverse)
        for idx, r in enumerate(ordered, start=1):
            if r["site_id"] == site_id_:
                return idx
        return 0

    rank_irr = _rank_of(site_id, "irr", reverse=True)
    rank_timeline = _rank_of(site_id, "timeline", reverse=False)  # shorter is better
    rank_friction = _rank_of(site_id, "friction", reverse=True)  # higher friction = higher risk → rank 1 = riskiest

    headline_parts = [f"Ranks {rank_irr} of {total} in base IRR"]
    if rank_friction == 1:
        headline_parts.append("highest municipality friction in portfolio")
    elif rank_timeline == 1:
        headline_parts.append("fastest projected approval path")
    return {
        "rank_by_irr": {"rank": rank_irr, "of": total},
        "rank_by_timeline": {"rank": rank_timeline, "of": total},
        "rank_by_friction": {"rank": rank_friction, "of": total},
        "headline": ", ".join(headline_parts) + ".",
        "peers": scored,
    }


def _derive_workstreams(
    site: dict[str, Any],
    feasibility: dict[str, Any] | None,
    events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    muni = _municipality_for(site) or {}
    approval_low = site.get("approval_timeline_days_low")
    approval_high = site.get("approval_timeline_days_high")

    blockers_from_feasibility = [
        c.get("note") for c in (feasibility.get("constraints", []) if feasibility else [])
        if c.get("impact") == "blocking"
    ]

    entitlement_status = "blocked" if blockers_from_feasibility else (
        "at_risk" if (muni.get("risk_level") == "high") else "on_track"
    )

    return [
        {
            "name": "Entitlement",
            "owner": site.get("owner") or "Acquisitions Lead",
            "status": entitlement_status,
            "next_milestone": "File variance or confirm as-of-right",
            "next_milestone_due": None,
            "last_completed_step": "Zoning desk review" if feasibility else None,
            "blockers": [b for b in blockers_from_feasibility if b],
            "task_ids": [],
        },
        {
            "name": "Diligence",
            "owner": site.get("owner") or "Acquisitions Lead",
            "status": "at_risk" if events else "on_track",
            "next_milestone": "Re-run scenarios under latest ordinance",
            "next_milestone_due": None,
            "last_completed_step": f"Feasibility generated {feasibility['generated_at']}" if feasibility else None,
            "blockers": [],
            "task_ids": [],
        },
        {
            "name": "Capital",
            "owner": "CFO",
            "status": "on_track",
            "next_milestone": "Confirm equity + debt stack assumptions",
            "next_milestone_due": None,
            "last_completed_step": None,
            "blockers": [],
            "task_ids": [],
        },
        {
            "name": "Design",
            "owner": site.get("owner") or "Acquisitions Lead",
            "status": "at_risk" if blockers_from_feasibility else "on_track",
            "next_milestone": f"Target entitlement window {approval_low or '—'}–{approval_high or '—'} days",
            "next_milestone_due": None,
            "last_completed_step": None,
            "blockers": [],
            "task_ids": [],
        },
    ]


def _derive_decision_summary(
    site: dict[str, Any],
    scenarios: dict[str, Any] | None,
    risks: list[dict[str, Any]],
    recommendation: str,
) -> str:
    name = site.get("name", "This site")
    zoning = site.get("zoning") or "zoning"
    project_type = site.get("target_project_type") or "project"
    base = None
    if scenarios:
        base = next((p for p in scenarios.get("presets", []) if p.get("id") == "base"), None)
    base_irr = (base.get("outputs", {}).get("irr_pct") if base else None)
    base_margin = (base.get("outputs", {}).get("profit_margin_pct") if base else None)
    top_two = risks[:2]
    top_labels = " and ".join(r["label"] for r in top_two) if top_two else "no material risks flagged"
    rec_label = {
        "proceed": "proceed",
        "proceed_with_conditions": "proceed with conditions",
        "hold": "hold",
        "reject": "reject",
    }.get(recommendation, recommendation)
    base_frag = (
        f"Base case underwrites to {base_irr:.1f}% IRR and {base_margin:.1f}% margin"
        if (base_irr is not None and base_margin is not None)
        else "Base case scenario is not available"
    )
    return (
        f"Recommendation: **{rec_label}**. {name} ({zoning}, {project_type}) — "
        f"{base_frag}. The decision hinges on: {top_labels}."
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def get_site_decision(*, env_id: UUID, business_id: UUID, site_id: str) -> dict[str, Any]:
    _ = env_id, business_id  # reserved for future scoping
    site = _find_site(site_id)
    feasibility = _feasibility_for(site_id)
    scenarios = _scenarios_for(site_id)
    events = _events_for(site_id)
    muni = _municipality_for(site)
    comparables = (
        _comparable_projects_for(feasibility.get("comparable_project_ids", [])) if feasibility else []
    )

    owner = site.get("owner") or "Acquisitions Lead"
    recommendation, conviction = _derive_recommendation(site, feasibility, scenarios)
    fail_condition = _derive_fail_condition(scenarios)
    fail_condition_null_reason = None if fail_condition else "development scenarios not yet generated"
    risks = _derive_risks(feasibility, scenarios, events, owner)
    event_log = _derive_event_log(site_id, events, feasibility)
    portfolio_fit = _derive_portfolio_fit(site_id)
    workstreams = _derive_workstreams(site, feasibility, events)
    decision_summary = _derive_decision_summary(site, scenarios, risks, recommendation)

    # KPI strip — 4 values with traffic-light hints
    base = next(
        (p for p in (scenarios or {}).get("presets", []) if p.get("id") == "base"), None
    )
    base_irr = base.get("outputs", {}).get("irr_pct") if base else None
    base_cost = base.get("outputs", {}).get("total_dev_cost_usd") if base else None
    comp_cycle_median = None
    if comparables:
        cycles = sorted(float(c.get("cycle_days") or 0) for c in comparables if c.get("cycle_days"))
        comp_cycle_median = cycles[len(cycles) // 2] if cycles else None

    top_risk = risks[0] if risks else None

    kpis = [
        {
            "key": "base_irr_vs_hurdle",
            "label": "Base IRR vs hurdle",
            "value_pct": base_irr,
            "hurdle_pct": DEFAULT_IRR_HURDLE_PCT,
            "tone": (
                "green" if (base_irr is not None and base_irr >= DEFAULT_IRR_HURDLE_PCT + 2)
                else "amber" if (base_irr is not None and base_irr >= DEFAULT_IRR_HURDLE_PCT)
                else "red" if (base_irr is not None) else "gray"
            ),
            "null_reason": None if base_irr is not None else "base scenario not available",
        },
        {
            "key": "dev_cost_vs_comps",
            "label": "Dev cost vs comps cycle",
            "value_usd": base_cost,
            "comp_cycle_days_median": comp_cycle_median,
            "tone": "gray" if base_cost is None else "amber",
            "null_reason": None if base_cost is not None else "base scenario not available",
        },
        {
            "key": "capital_required",
            "label": "Capital required",
            "value_usd": round(base_cost * (1 - DEFAULT_DEBT_RATIO)) if base_cost else None,
            "assumed_debt_ratio": DEFAULT_DEBT_RATIO,
            "tone": "gray",
            "null_reason": None if base_cost is not None else "base scenario not available",
        },
        {
            "key": "top_downside_risk",
            "label": "Top downside risk",
            "risk_label": top_risk["label"] if top_risk else None,
            "irr_impact_bps": top_risk["irr_impact_bps"] if top_risk else None,
            "tone": "red" if top_risk and top_risk["severity"] == "red" else "amber" if top_risk else "gray",
            "null_reason": None if top_risk else "no risks surfaced",
        },
    ]

    return {
        "site_id": site_id,
        "site": {
            "site_id": site_id,
            "name": site.get("name"),
            "municipality_id": site.get("municipality_id"),
            "municipality_name": (muni or {}).get("name"),
            "municipality_friction_score": (muni or {}).get("overall_friction_score"),
            "address": site.get("address"),
            "parcel_id": site.get("parcel_id"),
            "zoning": site.get("zoning"),
            "acreage": site.get("acreage"),
            "status": site.get("status"),
            "buildable_units_low": site.get("buildable_units_low"),
            "buildable_units_high": site.get("buildable_units_high"),
            "height_limit_ft": site.get("height_limit_ft"),
            "density_cap_du_per_acre": site.get("density_cap_du_per_acre"),
            "feasibility_score": site.get("feasibility_score"),
            "confidence": site.get("confidence"),
            "risk_level": site.get("risk_level"),
            "approval_timeline_days_low": site.get("approval_timeline_days_low"),
            "approval_timeline_days_high": site.get("approval_timeline_days_high"),
            "target_project_type": site.get("target_project_type"),
            "owner": owner,
        },
        "recommendation": recommendation,
        "conviction": conviction,
        "recommendation_owner": owner,
        "recommendation_updated_at": (feasibility or {}).get("generated_at")
        or datetime.now(tz=timezone.utc).date().isoformat(),
        "decision_summary": decision_summary,
        "fail_condition": fail_condition,
        "fail_condition_null_reason": fail_condition_null_reason,
        "kpis": kpis,
        "scenarios": scenarios,  # raw pass-through for ScenarioBlock composition
        "risks": risks,
        "event_log": event_log,
        "portfolio_fit": portfolio_fit,
        "workstreams": workstreams,
        "evidence": {
            "comparable_projects": comparables,
            "feasibility": feasibility,
            "municipality": muni,
            "ordinance_rules": [
                rule for rule in (_fixture().get("ordinance_rules") or [])
                if rule.get("municipality_id") == site.get("municipality_id")
            ][:6],
        },
    }


def generate_decision_memo(*, env_id: UUID, business_id: UUID, site_id: str) -> dict[str, Any]:
    """Generate a markdown IC-style memo grounded in the decision payload.

    Deterministic (no LLM) so the demo works offline; can be upgraded to call
    the AI gateway later without changing the response shape.
    """
    payload = get_site_decision(env_id=env_id, business_id=business_id, site_id=site_id)
    site = payload["site"]
    rec_label = {
        "proceed": "PROCEED",
        "proceed_with_conditions": "PROCEED WITH CONDITIONS",
        "hold": "HOLD",
        "reject": "REJECT",
    }.get(payload["recommendation"], payload["recommendation"].upper())

    lines: list[str] = []
    lines.append(f"# {site['name']} — Investment Committee Memo")
    lines.append("")
    lines.append(f"**Recommendation:** {rec_label}  ")
    lines.append(f"**Conviction:** {payload['conviction']}/100  ")
    lines.append(f"**Owner:** {payload['recommendation_owner']}  ")
    lines.append(f"**As of:** {payload['recommendation_updated_at']}")
    lines.append("")

    lines.append("## Decision")
    lines.append(payload["decision_summary"])
    lines.append("")

    lines.append("## Fail Conditions")
    lines.append(payload["fail_condition"] or "Not available — development scenarios not yet generated.")
    lines.append("")

    lines.append("## Top Risks")
    if payload["risks"]:
        for risk in payload["risks"]:
            bps = risk["irr_impact_bps"]
            bps_str = f"{bps:+d} bps IRR" if bps is not None else f"impact not quantified ({risk.get('null_reason', '—')})"
            lines.append(f"- **{risk['label']}** — {risk['severity'].upper()} · {bps_str} · confidence {risk['confidence']}")
            lines.append(f"  - Required action: {risk['required_action']}")
    else:
        lines.append("_No material risks surfaced._")
    lines.append("")

    lines.append("## Scenario Economics")
    scn = payload.get("scenarios")
    if scn and scn.get("presets"):
        lines.append("| Scenario | IRR | Margin | Timeline | Dev Cost |")
        lines.append("|---|---:|---:|---:|---:|")
        for preset in scn["presets"]:
            o = preset.get("outputs", {})
            lines.append(
                f"| {preset.get('label')} "
                f"| {o.get('irr_pct', '—')}% "
                f"| {o.get('profit_margin_pct', '—')}% "
                f"| {o.get('timeline_days', '—')}d "
                f"| ${(o.get('total_dev_cost_usd') or 0)/1_000_000:.1f}M |"
            )
    else:
        lines.append("_Scenarios not available._")
    lines.append("")

    lines.append("## Portfolio Fit")
    lines.append(payload["portfolio_fit"]["headline"])
    lines.append("")

    lines.append("## Next Actions")
    for ws in payload["workstreams"]:
        lines.append(f"- **{ws['name']}** ({ws['owner']}) — {ws['next_milestone']}")
    lines.append("")

    memo_md = "\n".join(lines)
    return {
        "memo_markdown": memo_md,
        "sections": {
            "Decision": payload["decision_summary"],
            "Fail Conditions": payload.get("fail_condition"),
            "Recommendation": rec_label,
        },
        "metadata": {
            "site_id": site_id,
            "site_name": site["name"],
            "recommendation": payload["recommendation"],
            "conviction": payload["conviction"],
        },
    }
