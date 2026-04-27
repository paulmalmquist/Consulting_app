#!/usr/bin/env python3
"""seed_hallboys_pitch.py — Seed a Hallboys Pitch Forge demo project.

Seeds:
- 1 pitch project (Hallboys Holdings)
- 5 sources (from deep research and questionnaire)
- ~20 claims (facts, constraints, inferences, gaps, risks)
- 1 iteration with 5 candidate use cases (each with a known flaw)

Usage:
    python scripts/seed_hallboys_pitch.py --env-id <env_id> --business-id <business_id>
    python scripts/seed_hallboys_pitch.py --slug hall-boys  # resolves env automatically

Run from repo root.
"""
from __future__ import annotations

import argparse
import os
import sys

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
from uuid import UUID

from app.db import get_cursor
from app.services import pitch_forge as pf_db


# ---------------------------------------------------------------------------
# Hallboys seed data
# ---------------------------------------------------------------------------

HALLBOYS_SOURCES = [
    {
        "source_type": "deep_research",
        "label": "Hallboys Deep Research Report (2026-04)",
        "content": (
            "Hall Boys Holdings is a family-owned construction services holding company "
            "operating 5 portfolio brands across the Southeast: The Beam Team (GC), "
            "Hallway Plumbing, QEM (equipment logistics), Pro Marketing Sales, Advantage HVAC. "
            "~300 employees. Centralized shared services including a 3-person IT team. "
            "ERP: Acumatica. Single AP clerk. CFO/CIO: Sarat Vemuri. "
            "Public signals: attended AI retreat exploring AP automation, sales tools, field ops. "
            "QEM coordinates equipment/dumpster/lift/container logistics across nationwide retailer rollouts "
            "for clients. $3M saved via single invoicing documented publicly. "
            "1,000+ vetted haulers, 48 states served."
        ),
        "confidence": "high",
    },
    {
        "source_type": "questionnaire",
        "label": "Hallboys AI Discovery Questionnaire (2026-04)",
        "content": (
            "Existing Claude Cowork seats active. Top uses: document drafting, data synthesis. "
            "Dropped: employees abandoned Claude when output lacked construction-specific context. "
            "Primary concern: AI produces bad output when it lacks context about the project. "
            "No prior automation systems (Procore AI, Document Crunch, etc.) deployed. "
            "Sarat specifically does not want a white paper. Wants bullet-point case-study style. "
            "No appetite for custom software builds. Wants to use existing tools (Claude, Acumatica). "
            "Single AP clerk handles all AP across multiple OpCos."
        ),
        "confidence": "high",
    },
    {
        "source_type": "public_record",
        "label": "QEM Published Purchase Terms + Operations Description",
        "content": (
            "QEM provides single-invoicing, manages delivery-to-removal lifecycle for equipment. "
            "Dispatch includes hauler coordination with text-before-pickup process. "
            "Invoice dispute windows and scheduling coordination documented in purchase terms. "
            "High volume of service requests across multiple concurrent retailer rollout projects."
        ),
        "confidence": "high",
    },
    {
        "source_type": "deep_research",
        "label": "The Beam Team GC Operations Profile",
        "content": (
            "Integrated full-service GC serving major retailers, hotels, clinics, C-stores, grocers. "
            "98.5% on-time turnover rate. <1.0 MOD Rating. Pre-construction, construction management, "
            "lean construction cited. Heavy document + deadline workflows: RFIs, submittals, "
            "meeting minutes, change events, closeout packages. "
            "Industry RFI processing cost: ~$1,080/RFI. Average cycle time: 6-10 days."
        ),
        "confidence": "medium",
    },
    {
        "source_type": "inference",
        "label": "Inference: Workflow fragmentation across OpCos",
        "content": (
            "Multi-brand holding company with separate operating histories likely has "
            "fragmented process tooling: different email workflows, Acumatica used inconsistently "
            "across OpCos, spreadsheets still active in scheduling and AP reconciliation. "
            "No confirmed evidence — inference from portfolio structure and industry norms."
        ),
        "confidence": "low",
    },
]

HALLBOYS_CLAIMS = [
    # Hard constraints
    {"claim_text": "Sarat does not want a white paper. Output must be bullet-point, case-study style.", "claim_category": "constraint", "is_available": True},
    {"claim_text": "No custom software builds. Must use or extend existing tools (Claude Cowork, Acumatica).", "claim_category": "constraint", "is_available": True},
    {"claim_text": "Do not assume the single AP clerk will be eliminated. Frame as capacity increase or error reduction.", "claim_category": "constraint", "is_available": True},
    {"claim_text": "3-person IT team. Low capacity for new system integrations or maintenance.", "claim_category": "constraint", "is_available": True},
    {"claim_text": "No generic AI consulting language. Every idea must tie to a specific Hallboys workflow.", "claim_category": "constraint", "is_available": True},

    # Verified facts
    {"claim_text": "Acumatica is the ERP across Hallboys entities.", "claim_category": "fact", "is_available": True},
    {"claim_text": "~300 employees across 5 portfolio companies.", "claim_category": "fact", "is_available": True},
    {"claim_text": "Single AP clerk handles accounts payable across multiple OpCos.", "claim_category": "fact", "is_available": True},
    {"claim_text": "QEM manages equipment logistics across 48 states with 1,000+ haulers.", "claim_category": "fact", "is_available": True},
    {"claim_text": "Claude Cowork is already deployed. Employees have active seats.", "claim_category": "fact", "is_available": True},
    {"claim_text": "Employees dropped Claude when it lacked construction-specific context.", "claim_category": "fact", "is_available": True},
    {"claim_text": "AI retreat covered AP automation, sales tools, and field ops — buyer is not new to the concept.", "claim_category": "fact", "is_available": True},
    {"claim_text": "QEM saved $3M via single invoicing model (publicly documented).", "claim_category": "fact", "is_available": True},
    {"claim_text": "The Beam Team maintains 98.5% on-time project turnover.", "claim_category": "fact", "is_available": True},

    # Inferences
    {"claim_text": "[INFERENCE] Quote comparison across 3-5 sub bids is likely manual and inconsistent across OpCos.", "claim_category": "inference", "is_available": True},
    {"claim_text": "[INFERENCE] Project closeout documentation is likely managed via email and spreadsheet, not a unified system.", "claim_category": "inference", "is_available": True},

    # Gaps (not available)
    {"claim_text": "Current AP invoice volume per week across all OpCos.", "claim_category": "gap", "is_available": False, "unavailable_reason": "Not disclosed in research. Required to size the AP triage opportunity."},
    {"claim_text": "How many subcontractor bids are leveled per month on Beam Team GC projects.", "claim_category": "gap", "is_available": False, "unavailable_reason": "Not confirmed. Needed to quantify the quote comparison opportunity."},
    {"claim_text": "Number of concurrent equipment dispatch events managed by QEM per week.", "claim_category": "gap", "is_available": False, "unavailable_reason": "Not publicly available. Needed to size the scheduling risk monitor."},

    # Risks
    {"claim_text": "Risk: AI output without Acumatica context will repeat prior failure pattern (employees abandoned Claude).", "claim_category": "risk", "is_available": True},
    {"claim_text": "Risk: 3-person IT team cannot support solutions requiring ongoing custom integration maintenance.", "claim_category": "risk", "is_available": True},
]

HALLBOYS_USE_CASES = [
    {
        "workflow_name": "Subcontractor Quote Comparison",
        "current_pain": (
            "On Beam Team GC projects, a PM or estimator manually reads through 3–5 sub bids "
            "line by line to find scope gaps, price discrepancies, and missing items. "
            "This takes 2–4 hours per trade package and is done inconsistently — "
            "some reviewers catch scope gaps others miss, leading to mid-project change orders."
        ),
        "proposed_intervention": (
            "Use Claude to extract and align line items across uploaded bid PDFs, "
            "flag scope gaps (items present in one bid but absent in others), "
            "and produce a comparison table with highlighted discrepancies. "
            "Human makes the award decision. Claude only organizes and flags."
        ),
        "who_uses_it": "Beam Team estimators and project managers during bid leveling",
        "change_tomorrow": (
            "The PM uploads 3 sub bids, Claude returns a comparison table with gaps flagged "
            "in under 5 minutes. PM reviews and makes the award call. "
            "No manual spreadsheet setup required."
        ),
        "estimated_impact": (
            "Reduce per-package bid leveling time from 2–4 hours to 30–45 minutes. "
            "On 10 GC projects/year with 5 trade packages each, that is 75–175 hours recovered. "
            "Secondary: fewer missed scope gaps reduces mid-project change orders."
        ),
        "impact_confidence": "medium",
        "dependencies": (
            "Sub bids must be in PDF or text format (most are already). "
            "Claude Cowork already deployed — no new tool required. "
            "PM must define standard scope categories per trade type."
        ),
        "novendor_credibility": (
            "Novendor has run bid comparison workflows using Claude on construction documents. "
            "We can show a working demo with anonymized Beam Team-style scope categories within 1 week."
        ),
        # Intentional flaw: impact estimate uses industry hours not confirmed Beam Team volume
        "flaw": "Estimated impact assumes 10 GC projects/year and 5 trade packages each — these numbers are not confirmed from Hallboys. Could be significantly higher or lower.",
    },
    {
        "workflow_name": "QEM Multi-Site Scheduling Risk Monitor",
        "current_pain": (
            "QEM coordinates equipment delivery and pickup across dozens of concurrent retailer "
            "rollout sites. Schedule conflicts, late pickups, and missed delivery windows "
            "are currently caught reactively — a site calls when equipment hasn't arrived. "
            "No proactive flag system exists across the active dispatch board."
        ),
        "proposed_intervention": (
            "Build a daily monitoring prompt in Claude Cowork that reads the active schedule "
            "(pasted from Acumatica or a shared spreadsheet), identifies sites with "
            "delivery/pickup windows within 48 hours, flags any that lack confirmed hauler "
            "assignments, and surfaces the top 3 risks each morning. "
            "Dispatcher reviews and acts. No automated dispatch — human closes every loop."
        ),
        "who_uses_it": "QEM dispatcher and operations lead, reviewed each morning",
        "change_tomorrow": (
            "Dispatcher pastes or uploads the day's schedule, Claude returns a flagged list "
            "of at-risk sites and missing confirmations in under 2 minutes. "
            "Same tool, no new system — just a structured Claude workflow."
        ),
        "estimated_impact": (
            "Catch scheduling gaps 24–48 hours earlier than reactive process. "
            "On QEM's volume (estimated 100+ concurrent site dispatches), "
            "even reducing 5 missed or delayed dispatches/month saves client relationship risk "
            "and avoids emergency hauler premiums ($500–$2,000/incident)."
        ),
        "impact_confidence": "low",
        "dependencies": (
            "QEM must have a daily schedule exportable from Acumatica or a shared tracker. "
            "Dispatcher must commit to a 10-minute morning review ritual. "
            "Schedule format must be consistent enough for Claude to parse reliably."
        ),
        "novendor_credibility": (
            "Novendor built dispatch exception monitoring workflows for logistics operations. "
            "We can prototype this using QEM's published operational model within 2 weeks."
        ),
        # Intentional flaw: impact is speculative — dispatch volume not confirmed
        "flaw": "Impact estimate uses speculative dispatch volume (100+ sites). QEM has not confirmed actual concurrent site count. Real impact could be much lower or higher.",
    },
    {
        "workflow_name": "Acumatica AP Exception Triage",
        "current_pain": (
            "The single AP clerk processes invoices across all Hallboys OpCos. "
            "Invoice review is manual: match to PO, check amounts, flag discrepancies, "
            "route for approval. High-volume periods create a backlog. "
            "The clerk spends time on both routine matching (low judgment) and "
            "genuine exceptions (high judgment) — the work is not separated."
        ),
        "proposed_intervention": (
            "Use Claude to pre-screen invoices before the clerk touches them: "
            "extract vendor, amount, line items, and PO reference; "
            "flag mismatches, duplicate patterns, or unusual amounts; "
            "tag each invoice as routine (likely clean) or exception (needs human review). "
            "The clerk reviews exceptions first. Routine invoices get a faster pass. "
            "No automated posting — every invoice still touches a human before it hits Acumatica."
        ),
        "who_uses_it": "Single AP clerk and whoever approves AP at each OpCo",
        "change_tomorrow": (
            "Clerk receives a pre-screened summary each morning: "
            "X invoices flagged as exceptions with specific reasons, "
            "Y invoices tagged routine. "
            "Clerk starts with exceptions, moves to routine. No context switching."
        ),
        "estimated_impact": (
            "Estimated 30–40% reduction in time spent on routine invoice review, "
            "freeing 5–8 hours/week for exception handling and backlog clearance. "
            "Secondary: fewer missed discrepancies that become disputes downstream."
        ),
        "impact_confidence": "medium",
        "dependencies": (
            "Invoices must be receivable in a format Claude can read (PDF, email, CSV export). "
            "Acumatica PO data must be accessible for matching (export or manual input). "
            "Approval workflow remains unchanged — this is a pre-screening layer only."
        ),
        "novendor_credibility": (
            "AP exception triage is one of the three workflows covered in Hallboys' own AI retreat. "
            "Novendor has run invoice pre-screening pilots in similar multi-OpCo environments."
        ),
        # Intentional flaw: no Acumatica API integration assumed — uses manual export
        "flaw": "This workflow requires either a manual Acumatica export step or an API connection. Neither has been confirmed as feasible with Hallboys' 3-person IT team. If export is manual, the daily setup cost may offset the time savings.",
    },
    {
        "workflow_name": "Project Closeout Document Checklist",
        "current_pain": (
            "At the end of Beam Team GC projects, PMs must assemble a closeout package: "
            "as-builts, warranties, O&M manuals, punch list sign-offs, final lien waivers, "
            "certificates of substantial completion. "
            "These are currently tracked via email threads and personal spreadsheets. "
            "Missing items are discovered at client handoff, creating last-minute delays "
            "and, in worst cases, delayed final payment release."
        ),
        "proposed_intervention": (
            "Create a standard closeout checklist template in Claude Cowork. "
            "PM uploads the project contract scope and Claude generates a "
            "project-specific checklist of required closeout documents. "
            "PM updates status weekly. Claude flags overdue items and "
            "drafts follow-up requests to subs for missing documents."
        ),
        "who_uses_it": "Beam Team project managers, 30 days before project completion",
        "change_tomorrow": (
            "PM runs the checklist generator on their next active project. "
            "Receives a checklist within 5 minutes tailored to that project's scope. "
            "No new software — runs inside Claude Cowork they already have."
        ),
        "estimated_impact": (
            "Eliminate last-minute closeout discovery on 80%+ of projects. "
            "On projects where delayed closeout holds final payment, "
            "faster completion has measurable cash flow impact. "
            "Exact dollar value depends on average contract size and payment terms — not confirmed."
        ),
        "impact_confidence": "medium",
        "dependencies": (
            "PMs must have access to project contract scope documents. "
            "Checklist must be reviewed and validated by Beam Team QC lead before use. "
            "Consistent use requires PM adoption — depends on change management."
        ),
        "novendor_credibility": (
            "Document checklist workflows are among the simplest to prototype. "
            "Novendor can deliver a working template for Beam Team GC closeout within 1 week."
        ),
        # Intentional flaw: adoption risk is the real blocker — not surfaced enough
        "flaw": "This idea lives or dies on PM adoption. If PMs don't update the checklist weekly, the tool has no value. Adoption enforcement mechanism is not addressed.",
    },
    {
        "workflow_name": "Claude Governance and Reusable Skill Library",
        "current_pain": (
            "Hallboys employees already use Claude Cowork but output quality is inconsistent. "
            "The documented failure: employees abandoned Claude when it lacked construction context. "
            "Each user starts from scratch with no shared prompts, no context templates, "
            "and no quality standards. This creates two problems: "
            "wasted time rediscovering good prompts, and mistrust when bad prompts produce bad output."
        ),
        "proposed_intervention": (
            "Build a shared Hallboys Claude skill library: "
            "5–10 reusable prompt templates for the highest-frequency tasks "
            "(bid comparison, RFI drafting, AP review, schedule review, closeout checklist). "
            "Each template includes the right context (project type, trade, Acumatica fields). "
            "Novendor trains the initial set and documents a governance process for adding new ones. "
            "IT team approves additions — 3-person team can handle this with a simple review form."
        ),
        "who_uses_it": "All Hallboys employees with Claude Cowork seats, curated by IT and ops leads",
        "change_tomorrow": (
            "Employees open the shared template library instead of starting from a blank prompt. "
            "Each template is pre-loaded with Hallboys-specific context. "
            "Output quality is consistent from the first use."
        ),
        "estimated_impact": (
            "Estimated 50% reduction in time-to-useful-output for new Claude users. "
            "Secondary: rebuilds trust with employees who abandoned Claude due to bad output. "
            "Exact ROI depends on active seat count and task frequency — not quantified."
        ),
        "impact_confidence": "medium",
        "dependencies": (
            "Must identify 5–10 highest-frequency tasks across OpCos. "
            "Requires 2–4 hours of time from one ops lead per OpCo to validate templates. "
            "IT must define a lightweight governance process (form + review). "
            "Claude Cowork already deployed — no new licensing."
        ),
        "novendor_credibility": (
            "Building governed Claude skill libraries is Novendor's core offering. "
            "We have done this in 3 prior client environments and can show working examples."
        ),
        # Intentional flaw: impact estimate ("50% reduction") has no backing data
        "flaw": "The 50% reduction in time-to-useful-output is an estimate with no supporting data from Hallboys. This number will be challenged by a CFO and has no grounding.",
    },
]


# ---------------------------------------------------------------------------
# Seed runner
# ---------------------------------------------------------------------------

def seed(env_id: str, business_id: UUID) -> None:
    print(f"\nSeeding Hallboys Pitch Forge project...")
    print(f"  env_id:      {env_id}")
    print(f"  business_id: {business_id}")

    # Check for existing project
    existing = pf_db.get_project_by_slug(
        env_id=env_id, business_id=business_id, client_slug="hallboys-holdings"
    )
    if existing:
        print(f"\n  Project already exists (id={existing['id']}). Skipping create.")
        project = existing
    else:
        project = pf_db.create_project(
            env_id=env_id,
            business_id=business_id,
            payload={
                "client_name": "Hall Boys Holdings",
                "client_slug": "hallboys-holdings",
                "notes": (
                    "Demo project. Seeded for Pitch Forge walkthrough. "
                    "Hallboys: ~300 employees, 5 OpCos, Acumatica ERP, single AP clerk, "
                    "3-person IT team, active Claude Cowork seats, skeptical of custom builds."
                ),
            },
        )
        print(f"\n  Created project: {project['id']}")

    project_id = UUID(str(project["id"]))

    # Sources
    print("\n  Adding sources...")
    for s in HALLBOYS_SOURCES:
        src = pf_db.add_source(
            env_id=env_id, business_id=business_id, project_id=project_id, payload=s
        )
        print(f"    + source: {src['label'][:60]}")

    # Claims
    print("\n  Adding claims...")
    for c in HALLBOYS_CLAIMS:
        claim = pf_db.add_claim(
            env_id=env_id, business_id=business_id, project_id=project_id, payload=c
        )
        avail = "" if claim["is_available"] else " [NOT AVAILABLE]"
        print(f"    + [{claim['claim_category']}]{avail} {claim['claim_text'][:60]}...")

    # Iteration 1 + use cases
    print("\n  Creating iteration 1 with seeded use cases...")

    pf_db.update_project_status(
        env_id=env_id, business_id=business_id, project_id=project_id, status="red_team"
    )
    # Manually set iteration_count to 1 since we're seeding
    with get_cursor() as cur:
        cur.execute(
            "UPDATE pf_project SET iteration_count = 1, updated_at = now() WHERE id = %s::uuid",
            (str(project_id),),
        )

    iteration = pf_db.create_iteration(
        env_id=env_id, business_id=business_id,
        project_id=project_id, iteration_num=1,
    )
    print(f"  Iteration id: {iteration['id']}")

    use_cases = pf_db.bulk_insert_use_cases(
        env_id=env_id, business_id=business_id,
        project_id=project_id, iteration_id=UUID(str(iteration["id"])),
        use_cases=HALLBOYS_USE_CASES,
    )
    for uc in use_cases:
        print(f"    + use case: {uc['workflow_name']}")

    # Store a raw proposal snapshot
    raw_text = "\n\n".join(
        f"## {uc['workflow_name']}\nPain: {uc['current_pain'][:80]}...\nImpact: {uc['estimated_impact'][:80]}..."
        for uc in use_cases
    )
    pf_db.update_iteration(
        env_id=env_id, business_id=business_id,
        iteration_id=UUID(str(iteration["id"])),
        status="draft",
        raw_proposal=raw_text,
    )

    print("\n  Seed complete.")
    print(f"\n  Project ID:   {project['id']}")
    print(f"  Iteration ID: {iteration['id']}")
    print(f"\n  Demo path:")
    print(f"    1. Open /lab/env/<envId>/pitch-forge")
    print(f"    2. Click on the Hallboys project")
    print(f"    3. View Research Board (5 sources, 20 claims, 3 gaps)")
    print(f"    4. Click 'Run Red Team' on iteration 1")
    print(f"    5. Watch flawed use cases get killed with specific reasons")
    print(f"    6. Click 'Rebuild' to generate iteration 2")
    print(f"    7. Export final output once score ≥ 80")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Hallboys Pitch Forge demo project")
    parser.add_argument("--env-id", required=True, help="Environment ID (UUID or slug)")
    parser.add_argument("--business-id", required=True, help="Business ID (UUID)")
    args = parser.parse_args()

    try:
        business_id = UUID(args.business_id)
    except ValueError:
        print(f"Error: --business-id must be a valid UUID, got: {args.business_id}")
        sys.exit(1)

    seed(env_id=args.env_id, business_id=business_id)


if __name__ == "__main__":
    main()
