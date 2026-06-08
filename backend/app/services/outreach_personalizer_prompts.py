"""outreach_personalizer_prompts.py — Deterministic prompt templates for the
Outreach Personalizer pipeline.

Every template:
- Takes typed, explicit inputs
- Produces a strict JSON output contract
- Reuses the shared anti-AI-style banned-phrase / writing-rule blocks from
  pitch_forge_prompts so personalized outreach copy is held to the same bar.

Themes (Artemis Real Estate Partners and REPE/asset-management firms generally):
- real estate investment management / REPE data readiness
- investor reporting and portfolio intelligence
- pipeline / asset management / operating insight
- AI as controlled internal operational infrastructure, not chatbot hype
- Novendor as a builder of controlled internal systems and demos
"""
from __future__ import annotations

import json

from app.services.pitch_forge_prompts import WRITING_RULES


_PROFILE_GUIDANCE = """
Use only the operator-supplied profile fields and firm name below. Do not invent
private facts. Public, firm-level observations are acceptable ONLY when framed as
likely / research-derived using cautious language ("likely", "firms of this
profile typically", "based on public positioning"). If a fact is not given and
not safely inferable, do not state it.

If the profile includes a `positioning_notes` field, treat it as the operator's
intended framing for this firm and align the output to that angle. Never treat
operator notes as verified private facts — they are framing, not claims.
""".strip()


def _profile_block(firm_name: str, sector: str, profile: dict) -> str:
    return (
        f"FIRM: {firm_name}\n"
        f"SECTOR: {sector or 'real estate investment management / real estate private equity'}\n"
        f"OPERATOR-SUPPLIED PROFILE (JSON):\n{json.dumps(profile, indent=2, default=str)}"
    )


def insight_generation_prompt(*, firm_name: str, sector: str, profile: dict) -> str:
    return f"""You are preparing a personalized business-development case for {firm_name},
a real estate investment management / REPE firm. Novendor builds controlled internal
operational systems and working demos (data readiness, investor reporting, portfolio
intelligence, pipeline and asset-management operating insight) — not generic chatbots.

{_PROFILE_GUIDANCE}

{_profile_block(firm_name, sector, profile)}

Produce 3–4 sharp, specific insights that would make {firm_name} pay attention. Each
insight should connect a likely operating reality of a firm with this profile to a
concrete Novendor-shaped intervention. Tie every insight to one of: REPE data
readiness, investor reporting / portfolio intelligence, pipeline / asset-management
operating insight, or AI as controlled internal infrastructure.

{WRITING_RULES}

Return ONLY valid JSON in exactly this shape:
{{
  "insights": [
    {{
      "title": "<= 8 words, specific",
      "observation": "1-2 sentences. Cautious framing for any non-given fact.",
      "novendor_angle": "1-2 sentences. What Novendor would build/show, concretely.",
      "confidence": "high | medium | low | speculative"
    }}
  ]
}}"""


def loom_script_prompt(*, firm_name: str, sector: str, profile: dict, insights: list[dict]) -> str:
    insight_titles = [i.get("title", "") for i in insights if i.get("title")]
    return f"""Write a short personal-video (Loom) script for an outbound message to
{firm_name}. The speaker is from Novendor. Tone: human, specific, peer-to-peer, no
hype, no "AI will replace your team" language. 45–75 seconds spoken.

{_PROFILE_GUIDANCE}

{_profile_block(firm_name, sector, profile)}

NAMED INSIGHTS (reference at least one by its idea, not as a list):
{json.dumps(insight_titles, indent=2)}

The script must: open with something specific to {firm_name}, name one concrete
operating problem a firm of this profile likely faces, describe one controlled
system/demo Novendor would build, and close with a low-pressure ask.

{WRITING_RULES}

Return ONLY valid JSON in exactly this shape:
{{
  "script": "<the spoken script as plain prose, 90-150 words>",
  "duration_seconds_estimate": <integer>,
  "references_insight": "<the insight idea referenced>"
}}"""


def cold_email_prompt(*, firm_name: str, sector: str, profile: dict, insights: list[dict]) -> str:
    insight_titles = [i.get("title", "") for i in insights if i.get("title")]
    return f"""Write ONE cold outbound email to {firm_name} from Novendor.

HARD RULES (violating any is grounds for rejection):
- The email body is EXACTLY 4 sentences. Not 3, not 5. Four.
- It must reference at least one of the NAMED INSIGHTS below, by its specific idea.
- It must sound like a specific human wrote it to this firm. No spam, no hype, no
  "AI will replace your team", no generic consulting filler.
- No fabricated private facts. Cautious framing for any non-given observation.

{_PROFILE_GUIDANCE}

{_profile_block(firm_name, sector, profile)}

NAMED INSIGHTS:
{json.dumps(insight_titles, indent=2)}

{WRITING_RULES}

Return ONLY valid JSON in exactly this shape:
{{
  "subject": "<= 7 words, specific, no clickbait>",
  "body": "<exactly 4 sentences>",
  "references_insight": "<the named insight referenced>"
}}"""
