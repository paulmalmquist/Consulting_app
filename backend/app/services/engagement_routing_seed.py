"""Engagement Routing seed — three demo engagements (RED/YELLOW/GREEN).

Creates synthetic crm_account + cro_client + cro_engagement rows, plus the
appropriate contract / revenue stream / attribution / events to drive the
target routing health for each. Idempotent: skips if engagements with the
seeded names already exist for the env.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.engagement_routing import (
    NOVENDOR_ENTITY,
    add_attribution,
    add_contract,
    add_revenue_stream,
    create_engagement,
)


_SEED_NAMES = {
    "red": "Enterprise Data Platform Contractor Role",
    "yellow": "Hall Boys Holdings — AI Operations Diagnostic",
    "green": "Example REPE Operator — Winston REPE Pilot",
}


def _engagement_exists(cur, env_id: str, business_id: UUID, name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM cro_engagement WHERE env_id = %s AND business_id = %s AND name = %s LIMIT 1",
        (env_id, str(business_id), name),
    )
    return cur.fetchone() is not None


def seed_engagement_routing(*, env_id: str, business_id: UUID) -> dict:
    """Seed RED / YELLOW / GREEN demo engagements. Returns counts."""
    with get_cursor() as cur:
        existing = {
            color
            for color, name in _SEED_NAMES.items()
            if _engagement_exists(cur, env_id, business_id, name)
        }

    to_seed = [c for c in ("red", "yellow", "green") if c not in existing]
    counts = {"red": 0, "yellow": 0, "green": 0}

    today = date.today()

    if "red" in to_seed:
        detail = create_engagement(
            env_id=env_id,
            business_id=business_id,
            payload={
                "name": _SEED_NAMES["red"],
                "client_name": "Enterprise Data Platform Contractor Role",
                "contracting_entity": "Paul Malmquist (personal)",
                "originated_by_user_id": "paul",
                "relationship_owner_user_id": "paul",
                "delivery_owner_user_id": "paul",
                "lead_source": "personal_network",
                "routing_status": "active",
                "engagement_type": "advisory",
                "expected_start_date": today.isoformat(),
                "current_pain": "Demo seed: contract is signed personally, not through Novendor LLC.",
                "marketing_permission_status": "internal_only",
                "next_action_text": "Ask whether contract can route through Novendor",
                "next_action_due_date": (today + timedelta(days=2)).isoformat(),
                "notes": "DEMO DATA — illustrative example of a personal/non-compounding deal.",
            },
        )
        counts["red"] = 1

    if "yellow" in to_seed:
        detail = create_engagement(
            env_id=env_id,
            business_id=business_id,
            payload={
                "name": _SEED_NAMES["yellow"],
                "client_name": "Hall Boys Holdings",
                "contracting_entity": NOVENDOR_ENTITY,
                "originated_by_user_id": "paul",
                "relationship_owner_user_id": "paul",
                "delivery_owner_user_id": "paul",
                "lead_source": "personal_network",
                "routing_status": "active",
                "engagement_type": "ai_diagnostic",
                "expected_start_date": today.isoformat(),
                "current_pain": "Manual ops reporting — diagnostic phase to identify the highest-leverage automation",
                "what_winston_replaces": "TBD after diagnostic",
                "expected_roi_angle": "Time savings on ops reporting",
                "marketing_permission_status": "internal_only",
                "next_action_text": "Define economics split and send structured questionnaire",
                "next_action_due_date": (today + timedelta(days=3)).isoformat(),
                "notes": "DEMO DATA — illustrative example of a routed engagement with gaps.",
            },
        )
        eng_id = UUID(str(detail["engagement"]["id"]))
        # Add a draft (unsigned) contract
        add_contract(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "contract_type": "SOW",
                "status": "draft",
                "signed_by_client": False,
                "signed_by_novendor": False,
                "billing_terms": "milestone",
            },
        )
        # Add a revenue stream but no economics split (yellow trigger)
        add_revenue_stream(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "revenue_type": "fixed",
                "total_contract_value": Decimal("12000"),
                "billing_frequency": "milestone",
                "margin_split_json": {},
                "revenue_notes": "Diagnostic phase — final value pending scope confirmation",
            },
        )
        counts["yellow"] = 1

    if "green" in to_seed:
        detail = create_engagement(
            env_id=env_id,
            business_id=business_id,
            payload={
                "name": _SEED_NAMES["green"],
                "client_name": "Example REPE Operator",
                "contracting_entity": NOVENDOR_ENTITY,
                "originated_by_user_id": "paul",
                "relationship_owner_user_id": "paul",
                "delivery_owner_user_id": "paul",
                "lead_source": "referral",
                "routing_status": "active",
                "engagement_type": "winston_pilot",
                "expected_start_date": today.isoformat(),
                "expected_end_date": (today + timedelta(days=90)).isoformat(),
                "current_pain": "LP reporting takes two weeks per quarter and pulls senior staff off deal work.",
                "what_winston_replaces": "Manual reporting workflow that spans Excel + AppFolio + email threads.",
                "expected_roi_angle": "Cut LP package prep from 2 weeks to 2 days",
                "marketing_permission_status": "approved_logo",
                "next_action_text": "Prepare delivery kickoff",
                "next_action_due_date": (today + timedelta(days=5)).isoformat(),
                "notes": "DEMO DATA — illustrative example of a fully-routed Novendor engagement.",
            },
        )
        eng_id = UUID(str(detail["engagement"]["id"]))
        add_contract(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "contract_type": "SOW",
                "status": "fully_signed",
                "signed_by_client": True,
                "signed_by_novendor": True,
                "effective_date": today.isoformat(),
                "expiration_date": (today + timedelta(days=120)).isoformat(),
                "billing_terms": "milestone",
            },
        )
        add_revenue_stream(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "revenue_type": "fixed",
                "total_contract_value": Decimal("35000"),
                "billing_frequency": "milestone",
                "margin_split_json": {"paul": 0.7, "rich": 0.3},
                "revenue_notes": "Pilot fee — split reflects originator/relationship/delivery weight",
                "start_date": today.isoformat(),
                "end_date": (today + timedelta(days=90)).isoformat(),
            },
        )
        add_attribution(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "operator_name": "Paul",
                "user_id": "paul",
                "role": "originator",
                "credit_percentage": Decimal("1.0"),
                "economics_percentage": Decimal("0.7"),
            },
        )
        add_attribution(
            env_id=env_id,
            business_id=business_id,
            engagement_id=eng_id,
            payload={
                "operator_name": "Rich",
                "user_id": "rich",
                "role": "delivery_support",
                "credit_percentage": Decimal("0.0"),
                "economics_percentage": Decimal("0.3"),
            },
        )
        counts["green"] = 1

    emit_log(
        level="info",
        service="backend",
        action="engagement_routing.seed_completed",
        message=f"Seeded engagement routing demo data: {counts}",
        context={"env_id": env_id, "business_id": str(business_id)},
    )
    return {
        "seeded": counts,
        "skipped": list(existing),
    }


if __name__ == "__main__":
    import os
    import sys

    env_id = os.environ.get("SEED_ENV_ID")
    business_id_raw = os.environ.get("SEED_BUSINESS_ID")
    if not env_id or not business_id_raw:
        print("SEED_ENV_ID and SEED_BUSINESS_ID env vars required", file=sys.stderr)
        sys.exit(1)
    result = seed_engagement_routing(
        env_id=env_id, business_id=UUID(business_id_raw)
    )
    print(json.dumps(result, default=str, indent=2))
