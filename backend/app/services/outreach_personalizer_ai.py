"""outreach_personalizer_ai.py — AI orchestration for the Outreach Personalizer.

Mirrors pitch_forge_ai.py:
- get_instrumented_sync_client(), _chat(), _parse_json()
- model gpt-4o, temperature 0.2, strict JSON, raises ValueError on contract failures

Difference from pitch_forge (resolved decision for ticket 0003): the seed flow has
a deterministic fallback. When OPENAI_API_KEY is not configured, generate_asset_pack
returns a hand-authored, clearly-labeled deterministic pack
(payload source = "deterministic_seed") so the Phase 1 vertical slice is demoable and
testable offline. regenerate_asset() has NO fallback — it fails closed (AI required)
to preserve pitch_forge parity.
"""
from __future__ import annotations

import json
import re

from app.config import OPENAI_API_KEY
from app.services.ai_client import get_instrumented_sync_client
from app.services.outreach_personalizer_prompts import (
    insight_generation_prompt,
    loom_script_prompt,
    cold_email_prompt,
)

_MODEL = "gpt-4o"
_TEMPERATURE = 0.2  # Low — deterministic, not creative

ASSET_TYPES = ("insight", "loom_script", "cold_email")


def ai_available() -> bool:
    """True when an OpenAI key is configured. Tests run with it unset → fallback."""
    return bool(OPENAI_API_KEY)


def _chat(prompt: str, *, temperature: float = _TEMPERATURE) -> str:
    """Single-turn chat call. Returns the text content of the first choice."""
    client = get_instrumented_sync_client()
    response = client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=4096,
    )
    return response.choices[0].message.content.strip()


def _parse_json(raw: str, context: str) -> dict | list:
    """Extract and parse the first JSON block from a raw string."""
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    for start_char, end_char in [("{", "}"), ("[", "]")]:
        idx = cleaned.find(start_char)
        if idx != -1:
            depth = 0
            for i, ch in enumerate(cleaned[idx:], start=idx):
                if ch == start_char:
                    depth += 1
                elif ch == end_char:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(cleaned[idx : i + 1])
                        except json.JSONDecodeError as exc:
                            raise ValueError(f"JSON parse error in {context}: {exc}") from exc
    raise ValueError(f"No JSON found in {context} response")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def count_sentences(text: str) -> int:
    """Count sentences by terminal punctuation. Colons/semicolons do not split."""
    stripped = (text or "").strip()
    if not stripped:
        return 0
    parts = [p for p in re.split(r"(?<=[.!?])\s+", stripped) if p.strip()]
    return len(parts)


def _validate_cold_email(email: dict, insights: list[dict]) -> dict:
    """Enforce: exactly 4 sentences, references a named insight (by title + token)."""
    body = (email.get("body") or "").strip()
    n = count_sentences(body)
    if n != 4:
        raise ValueError(
            f"Cold email must be exactly 4 sentences, found {n}."
        )
    titles = [str(i.get("title", "")).strip() for i in insights if i.get("title")]
    ref = (email.get("references_insight") or "").strip()
    if not ref or ref not in titles:
        raise ValueError(
            "Cold email must set references_insight to one of the generated insight titles."
        )
    # The body must actually reference the insight, not just claim to.
    tokens = [w.lower() for w in re.findall(r"[A-Za-z]{5,}", ref)]
    body_l = body.lower()
    if tokens and not any(t in body_l for t in tokens):
        raise ValueError(
            "Cold email body does not reference the named insight it claims to."
        )
    return email


# ---------------------------------------------------------------------------
# AI generation
# ---------------------------------------------------------------------------

def generate_insights(*, firm_name: str, sector: str, profile: dict) -> list[dict]:
    raw = _chat(insight_generation_prompt(firm_name=firm_name, sector=sector, profile=profile))
    data = _parse_json(raw, "insight_generation")
    insights = data.get("insights") if isinstance(data, dict) else None
    if not isinstance(insights, list) or not insights:
        raise ValueError("insight_generation returned no insights")
    return insights


def generate_loom_script(
    *, firm_name: str, sector: str, profile: dict, insights: list[dict]
) -> dict:
    raw = _chat(
        loom_script_prompt(
            firm_name=firm_name, sector=sector, profile=profile, insights=insights
        )
    )
    data = _parse_json(raw, "loom_script")
    if not isinstance(data, dict) or not data.get("script"):
        raise ValueError("loom_script returned no script")
    return data


def generate_cold_email(
    *, firm_name: str, sector: str, profile: dict, insights: list[dict]
) -> dict:
    raw = _chat(
        cold_email_prompt(
            firm_name=firm_name, sector=sector, profile=profile, insights=insights
        )
    )
    data = _parse_json(raw, "cold_email")
    if not isinstance(data, dict):
        raise ValueError("cold_email returned a non-object")
    return _validate_cold_email(data, insights)


# ---------------------------------------------------------------------------
# Deterministic fallback pack (seed path only — clearly labeled)
# ---------------------------------------------------------------------------

def _deterministic_insights(firm_name: str) -> list[dict]:
    return [
        {
            "title": "Investor reporting runs on spreadsheets",
            "observation": (
                f"Firms of {firm_name}'s profile typically assemble quarterly investor "
                "reporting from fund-level spreadsheets and asset-manager inputs, which "
                "is slow to reconcile and hard to audit."
            ),
            "novendor_angle": (
                "Novendor builds a controlled internal reporting layer that pulls the "
                "same inputs into one reconciled, audit-traceable view, demoed on your "
                "own structure."
            ),
            "confidence": "medium",
        },
        {
            "title": "Pipeline and portfolio data sit in silos",
            "observation": (
                "Deal pipeline, asset operating data, and portfolio analytics likely "
                "live across separate systems, so portfolio-level questions are "
                "expensive to answer."
            ),
            "novendor_angle": (
                "Novendor wires a single internal queryable layer over those silos so "
                "the investment team gets portfolio answers without a data project."
            ),
            "confidence": "medium",
        },
        {
            "title": "AI adoption needs control not chatbots",
            "observation": (
                "Real estate investment managers face pressure to use AI but need "
                "controlled, auditable internal systems with clear provenance."
            ),
            "novendor_angle": (
                "Novendor delivers narrow internal AI operations with provenance and "
                "fail-closed behavior, shown as a working demo before any commitment."
            ),
            "confidence": "high",
        },
    ]


def _deterministic_pack(firm_name: str, sector: str, profile: dict) -> dict:
    insights = _deterministic_insights(firm_name)
    loom = {
        "script": (
            f"Hi, I put this together specifically for {firm_name}. Looking at how "
            "real estate investment managers your size run quarterly investor "
            "reporting, the same pattern shows up: fund-level spreadsheets stitched "
            "together under deadline, with reconciliation done by hand. Novendor "
            "builds a controlled internal layer that reconciles those same inputs into "
            "one audit-traceable view, and we show it as a working demo on your own "
            "structure before any commitment. It stays narrow and auditable, scoped to "
            "one workflow. If it is useful, I will walk you through the working "
            "version, no pitch attached."
        ),
        "duration_seconds_estimate": 58,
        "references_insight": "Investor reporting runs on spreadsheets",
    }
    email = {
        "subject": "Investor reporting without the spreadsheet scramble",
        "body": (
            f"Hi, I have been looking at how firms like {firm_name} handle quarterly "
            "investor reporting, and the pattern is almost always the same: fund-level "
            "spreadsheets stitched together under deadline. Novendor builds a "
            "controlled internal reporting layer that reconciles those same inputs into "
            "one audit-traceable view, shown as a working demo on your own structure "
            "before any commitment. It is a narrow internal system with provenance and "
            "fail-closed behavior, scoped to one workflow rather than a broad platform. "
            "If that is useful, I will send a short personal walkthrough of the working "
            "version."
        ),
        "references_insight": "Investor reporting runs on spreadsheets",
    }
    # Same contract the AI path must satisfy — fail loudly if the seed regresses.
    _validate_cold_email(email, insights)
    return {"insights": insights, "loom_script": loom, "cold_email": email}


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def generate_asset_pack(*, firm_name: str, sector: str, profile: dict) -> dict:
    """Generate all three assets. AI when configured, deterministic seed otherwise.

    Returns {"source": "ai"|"deterministic_seed",
             "insights": [...], "loom_script": {...}, "cold_email": {...}}
    """
    if not ai_available():
        pack = _deterministic_pack(firm_name, sector, profile)
        return {"source": "deterministic_seed", **pack}

    insights = generate_insights(firm_name=firm_name, sector=sector, profile=profile)
    loom = generate_loom_script(
        firm_name=firm_name, sector=sector, profile=profile, insights=insights
    )
    email = generate_cold_email(
        firm_name=firm_name, sector=sector, profile=profile, insights=insights
    )
    return {
        "source": "ai",
        "insights": insights,
        "loom_script": loom,
        "cold_email": email,
    }


def regenerate_asset(
    *, asset_type: str, firm_name: str, sector: str, profile: dict, insights: list[dict]
) -> dict | list:
    """Regenerate one asset. AI REQUIRED — fails closed (pitch_forge parity)."""
    if asset_type not in ASSET_TYPES:
        raise ValueError(f"Unknown asset_type '{asset_type}'")
    if not ai_available():
        raise ValueError(
            "AI is not configured. Asset regeneration requires OPENAI_API_KEY. "
            "(Seeding a target still works via the deterministic pack.)"
        )
    if asset_type == "insight":
        return generate_insights(firm_name=firm_name, sector=sector, profile=profile)
    if asset_type == "loom_script":
        return generate_loom_script(
            firm_name=firm_name, sector=sector, profile=profile, insights=insights
        )
    return generate_cold_email(
        firm_name=firm_name, sector=sector, profile=profile, insights=insights
    )


def regenerate_pack(*, firm_name: str, sector: str, profile: dict) -> dict:
    """Phase 4 — regenerate the FULL 3-asset pack in one call.

    AI REQUIRED — fails closed (parity with regenerate_asset). Unlike
    generate_asset_pack there is NO deterministic fallback: regeneration is an
    explicit operator action, and a half-deterministic / half-AI result would
    be misleading. Insights are generated first, then loom_script and
    cold_email derive from those fresh insights, so the returned pack is
    internally consistent (the UI never shows a mixed old/new state).

    Returns {"source": "ai", "insights": [...], "loom_script": {...},
             "cold_email": {...}} — the same shape as generate_asset_pack.
    """
    if not ai_available():
        raise ValueError(
            "AI is not configured. Regenerating microsite copy requires "
            "OPENAI_API_KEY. (Seeding a target still works via the "
            "deterministic pack.)"
        )
    insights = generate_insights(firm_name=firm_name, sector=sector, profile=profile)
    loom = generate_loom_script(
        firm_name=firm_name, sector=sector, profile=profile, insights=insights
    )
    email = generate_cold_email(
        firm_name=firm_name, sector=sector, profile=profile, insights=insights
    )
    return {
        "source": "ai",
        "insights": insights,
        "loom_script": loom,
        "cold_email": email,
    }
