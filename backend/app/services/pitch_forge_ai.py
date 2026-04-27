"""pitch_forge_ai.py — AI orchestration layer for the Pitch Forge pipeline.

Wraps the prompt templates from pitch_forge_prompts.py and calls the
instrumented OpenAI client. Returns parsed, validated dicts.

Every function:
- Takes explicit typed inputs
- Validates the AI response against the expected contract
- Returns a dict that the route layer can immediately store or return
- Raises ValueError on structural failures (caller handles retry/abort)
"""
from __future__ import annotations

import json
import re

from app.services.ai_client import get_instrumented_sync_client
from app.services import pitch_forge as pf_db
from app.services.pitch_forge_prompts import (
    BANNED_PHRASES,
    research_synthesis_prompt,
    use_case_generation_prompt,
    red_team_critique_prompt,
    research_gap_refill_prompt,
    proposal_rebuild_prompt,
    final_client_output_prompt,
    sarat_mode_critique_prompt,
    presentation_generation_prompt,
)


_MODEL = "gpt-4o"
_TEMPERATURE = 0.2  # Low — we want deterministic, not creative


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
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()
    # Find first { or [ and match to closing
    for start_char, end_char in [('{', '}'), ('[', ']')]:
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
                            return json.loads(cleaned[idx:i+1])
                        except json.JSONDecodeError as exc:
                            raise ValueError(f"JSON parse error in {context}: {exc}") from exc
    raise ValueError(f"No JSON found in {context} response")


def check_banned_phrases(text: str) -> list[str]:
    """Return list of banned phrases found in the text."""
    found = []
    lower = text.lower()
    for phrase in BANNED_PHRASES:
        if phrase.lower() in lower:
            found.append(phrase)
    return found


# ---------------------------------------------------------------------------
# 1. Synthesize research into structured claims
# ---------------------------------------------------------------------------

def synthesize_research(
    *,
    client_name: str,
    raw_research: str,
    known_constraints: list[str],
) -> dict:
    """
    Returns:
        {
          "facts": [...],
          "constraints": [...],
          "inferences": [...],
          "gaps": [...],
          "risks": [...]
        }
    """
    prompt = research_synthesis_prompt(
        client_name=client_name,
        raw_research=raw_research,
        known_constraints=known_constraints,
    )
    raw = _chat(prompt)
    result = _parse_json(raw, "research_synthesis")

    if not isinstance(result, dict):
        raise ValueError("research_synthesis must return a JSON object")
    for key in ("facts", "constraints", "inferences", "gaps", "risks"):
        if key not in result:
            result[key] = []

    return result


# ---------------------------------------------------------------------------
# 2. Generate use cases from research
# ---------------------------------------------------------------------------

def generate_use_cases(
    *,
    client_name: str,
    facts: list[dict],
    constraints: list[dict],
    inferences: list[dict],
    gaps: list[dict],
) -> list[dict]:
    """
    Returns list of use case dicts, each with:
    workflow_name, current_pain, proposed_intervention, who_uses_it,
    change_tomorrow, estimated_impact, impact_confidence, dependencies,
    novendor_credibility, evidence_used, flaw
    """
    prompt = use_case_generation_prompt(
        client_name=client_name,
        facts=facts,
        constraints=constraints,
        inferences=inferences,
        gaps=gaps,
    )
    raw = _chat(prompt)
    parsed = _parse_json(raw, "use_case_generation")

    if isinstance(parsed, dict) and "use_cases" in parsed:
        use_cases = parsed["use_cases"]
    elif isinstance(parsed, list):
        use_cases = parsed
    else:
        raise ValueError("use_case_generation must return {use_cases: [...]} or a list")

    # Validate required fields
    required = {"workflow_name", "current_pain", "proposed_intervention",
                "who_uses_it", "change_tomorrow", "estimated_impact"}
    for i, uc in enumerate(use_cases):
        missing = required - set(uc.keys())
        if missing:
            raise ValueError(f"Use case {i} missing required fields: {missing}")
        if not uc.get("estimated_impact", "").strip():
            raise ValueError(f"Use case '{uc['workflow_name']}' has empty estimated_impact")

    return use_cases


# ---------------------------------------------------------------------------
# 3. Run red team critique
# ---------------------------------------------------------------------------

def run_red_team(
    *,
    client_name: str,
    constraints: list[dict],
    use_cases: list[dict],
    iteration_num: int,
    max_iterations: int = 3,
) -> dict:
    """
    Returns the full red team review dict including score, verdict,
    kill_list, weak_spots, missing_evidence, research_refill,
    fatal_issues, fixable_issues, acceptable_weaknesses, missing_inputs.
    """
    prompt = red_team_critique_prompt(
        client_name=client_name,
        constraints=constraints,
        use_cases=use_cases,
        iteration_num=iteration_num,
        max_iterations=max_iterations,
    )
    raw = _chat(prompt)
    review = _parse_json(raw, "red_team_critique")

    if not isinstance(review, dict):
        raise ValueError("red_team_critique must return a JSON object")

    # Validate score + verdict
    score = review.get("score")
    if not isinstance(score, int) or not (0 <= score <= 100):
        raise ValueError(f"red_team score must be int 0–100, got {score!r}")

    verdict = review.get("verdict")
    if verdict not in ("pass", "rebuild", "research_refill", "fail"):
        raise ValueError(f"Invalid verdict: {verdict!r}")

    # Enforce: if at max iterations and score < 80, verdict must be fail
    if iteration_num >= max_iterations and score < 80 and verdict != "fail":
        review["verdict"] = "fail"
        review["verdict_reason"] = (
            f"Maximum iterations ({max_iterations}) reached with score {score}/80. "
            + review.get("verdict_reason", "")
        )

    # Validate: every kill must have a reason
    for kill in review.get("kill_list", []):
        if not kill.get("reason", "").strip():
            raise ValueError(
                f"Red team killed '{kill.get('use_case')}' without a specific reason. "
                "Every kill must cite a criterion and explain specifically why."
            )

    return review


# ---------------------------------------------------------------------------
# 4. Resolve research gaps
# ---------------------------------------------------------------------------

def resolve_research_gaps(
    *,
    client_name: str,
    gaps: list[dict],
    missing_from_red_team: list[dict],
    existing_sources: list[str],
) -> dict:
    """
    Returns:
        {
          "resolved_gaps": [...],
          "unresolved_gaps": [...]
        }
    """
    if not gaps and not missing_from_red_team:
        return {"resolved_gaps": [], "unresolved_gaps": []}

    prompt = research_gap_refill_prompt(
        client_name=client_name,
        gaps=gaps,
        missing_from_red_team=missing_from_red_team,
        existing_sources=existing_sources,
    )
    raw = _chat(prompt)
    result = _parse_json(raw, "research_gap_refill")

    if not isinstance(result, dict):
        raise ValueError("research_gap_refill must return a JSON object")
    result.setdefault("resolved_gaps", [])
    result.setdefault("unresolved_gaps", [])
    return result


# ---------------------------------------------------------------------------
# 5. Rebuild proposal after red team
# ---------------------------------------------------------------------------

def rebuild_proposal(
    *,
    client_name: str,
    previous_use_cases: list[dict],
    red_team_review: dict,
    resolved_gaps: list[dict],
    constraints: list[dict],
    iteration_num: int,
) -> list[dict]:
    """Returns a new list of use case dicts after applying red team fixes."""
    prompt = proposal_rebuild_prompt(
        client_name=client_name,
        previous_use_cases=previous_use_cases,
        red_team_review=red_team_review,
        resolved_gaps=resolved_gaps,
        constraints=constraints,
        iteration_num=iteration_num,
    )
    raw = _chat(prompt)
    parsed = _parse_json(raw, "proposal_rebuild")

    if isinstance(parsed, dict) and "use_cases" in parsed:
        use_cases = parsed["use_cases"]
    elif isinstance(parsed, list):
        use_cases = parsed
    else:
        raise ValueError("proposal_rebuild must return {use_cases: [...]} or a list")

    return use_cases


# ---------------------------------------------------------------------------
# 6. Generate final client output
# ---------------------------------------------------------------------------

def generate_final_output(
    *,
    client_name: str,
    use_cases: list[dict],
    score: int,
    format: str = "bullet_email",
) -> str:
    """
    Returns plain text ready to paste into email/deck/talking points.
    Raises ValueError if banned phrases are found.
    """
    prompt = final_client_output_prompt(
        client_name=client_name,
        use_cases=use_cases,
        score=score,
        format=format,
    )
    raw = _chat(prompt, temperature=0.15)  # Even lower — final output must be tight

    banned = check_banned_phrases(raw)
    if banned:
        raise ValueError(
            f"Final output contains banned phrases: {banned}. "
            "The output must be revised before delivery."
        )

    return raw


# ---------------------------------------------------------------------------
# Orchestrated pipeline steps (used by route handlers)
# ---------------------------------------------------------------------------

def run_proposal_generation_step(
    *,
    env_id: str,
    business_id,
    project_id,
    client_name: str,
) -> dict:
    """
    Full generation step:
    1. Load claims from DB
    2. Generate use cases via AI
    3. Store iteration + use cases
    4. Return iteration summary
    """
    from uuid import UUID

    # Load research from DB
    claims = pf_db.list_claims(
        env_id=env_id, business_id=business_id, project_id=project_id
    )
    facts = [{"text": c["claim_text"], "confidence": "high", "source": "db"} for c in claims if c["claim_category"] == "fact"]
    constraints = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "constraint"]
    inferences = [{"text": c["claim_text"], "basis": "existing research"} for c in claims if c["claim_category"] == "inference"]
    gaps = [
        {"text": c["claim_text"], "why_it_matters": c.get("unavailable_reason", "unknown"), "available": False, "unavailable_reason": c.get("unavailable_reason", "")}
        for c in claims if not c["is_available"]
    ]

    # Increment iteration counter (enforces max 3)
    proj = pf_db.increment_iteration_count(
        env_id=env_id, business_id=business_id, project_id=project_id
    )
    iteration_num = proj["iteration_count"]

    # Create iteration record
    iteration = pf_db.create_iteration(
        env_id=env_id, business_id=business_id,
        project_id=project_id, iteration_num=iteration_num,
    )

    # Generate use cases
    use_cases = generate_use_cases(
        client_name=client_name,
        facts=facts,
        constraints=constraints,
        inferences=inferences,
        gaps=gaps,
    )

    # Store use cases
    stored_ucs = pf_db.bulk_insert_use_cases(
        env_id=env_id, business_id=business_id,
        project_id=project_id, iteration_id=iteration["id"],
        use_cases=use_cases,
    )

    # Update iteration with raw proposal text
    raw_text = _use_cases_to_text(use_cases)
    iteration = pf_db.update_iteration(
        env_id=env_id, business_id=business_id,
        iteration_id=iteration["id"],
        status="draft",
        raw_proposal=raw_text,
    )

    pf_db.update_project_status(
        env_id=env_id, business_id=business_id,
        project_id=project_id, status="red_team",
    )

    return {"iteration": iteration, "use_cases": stored_ucs}


def run_red_team_step(
    *,
    env_id: str,
    business_id,
    project_id,
    iteration_id,
    client_name: str,
) -> dict:
    """
    Full red team step:
    1. Load iteration + use cases
    2. Run red team critique via AI
    3. Store review + update use case statuses
    4. Determine verdict and update project
    5. Return review
    """
    # Load data
    claims = pf_db.list_claims(env_id=env_id, business_id=business_id, project_id=project_id)
    constraints = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "constraint"]

    use_cases = pf_db.list_use_cases(
        env_id=env_id, business_id=business_id, iteration_id=iteration_id, include_killed=True
    )
    proj = pf_db.get_project(env_id=env_id, business_id=business_id, project_id=project_id)

    # Convert DB rows to dicts for AI
    uc_dicts = [dict(uc) for uc in use_cases]

    review = run_red_team(
        client_name=client_name,
        constraints=constraints,
        use_cases=uc_dicts,
        iteration_num=proj["iteration_count"],
        max_iterations=3,
    )

    # Store review
    stored_review = pf_db.create_red_team_review(
        env_id=env_id, business_id=business_id,
        project_id=project_id, iteration_id=iteration_id,
        review=review,
    )

    # Update use case statuses based on kill list
    kill_names = {k["use_case"] for k in review.get("kill_list", [])}
    for uc in use_cases:
        name = uc["workflow_name"]
        if name in kill_names:
            kill_entry = next((k for k in review["kill_list"] if k["use_case"] == name), {})
            pf_db.update_use_case_status(
                env_id=env_id, business_id=business_id,
                use_case_id=uc["id"],
                status="killed",
                kill_reason=f"[{kill_entry.get('criterion','')}] {kill_entry.get('reason','')}",
            )

    # Update iteration
    pf_db.update_iteration(
        env_id=env_id, business_id=business_id,
        iteration_id=iteration_id,
        status="red_teamed",
        score=review["score"],
        score_breakdown=review.get("score_breakdown", {}),
    )

    # Map verdict to project status
    verdict = review["verdict"]
    if verdict == "pass":
        new_status = "passed"
    elif verdict in ("rebuild", "research_refill"):
        new_status = "rebuilding"
    else:
        new_status = "failed"

    pf_db.update_project_status(
        env_id=env_id, business_id=business_id,
        project_id=project_id,
        status=new_status,
        current_score=review["score"],
        fail_reason=review["verdict_reason"] if verdict == "fail" else None,
    )

    return {"review": stored_review, "verdict": verdict, "score": review["score"]}



def _use_cases_to_text(use_cases: list[dict]) -> str:
    lines = []
    for uc in use_cases:
        lines.append(f"## {uc.get('workflow_name', 'Use Case')}")
        lines.append(f"Pain: {uc.get('current_pain', '')}")
        lines.append(f"Intervention: {uc.get('proposed_intervention', '')}")
        lines.append(f"Impact: {uc.get('estimated_impact', '')} [{uc.get('impact_confidence', '')}]")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# 7. Sarat Mode red team critique
# ---------------------------------------------------------------------------

def run_sarat_red_team(
    *,
    client_name: str,
    presentation_content: str,
    iteration_num: int,
    max_iterations: int = 3,
    known_constraints: list[dict] | None = None,
) -> dict:
    """
    Runs the Sarat Mode red team — a CFO/CIO persona critique with 6 required
    lenses. Returns a structured dict including:
      - section_verdicts: {section_name: "PASS" | "WEAK" | "REJECT"}
      - objection_scores: {criterion: 0-10}
      - overall_verdict: "PASS" | "WEAK" | "REJECT"
      - sarat_voice_summary: 2-4 sentences in Sarat's voice
      - kill_list, fixable_issues, fatal_issues
      - score: int 0-100
    """
    prompt = sarat_mode_critique_prompt(
        client_name=client_name,
        presentation_content=presentation_content,
        iteration_num=iteration_num,
        max_iterations=max_iterations,
        known_constraints=known_constraints or [],
    )
    raw = _chat(prompt)
    review = _parse_json(raw, "sarat_mode_critique")

    if not isinstance(review, dict):
        raise ValueError("sarat_mode_critique must return a JSON object")

    # Validate overall_verdict
    overall = review.get("overall_verdict")
    if overall not in ("PASS", "WEAK", "REJECT"):
        raise ValueError(f"sarat_mode overall_verdict must be PASS/WEAK/REJECT, got {overall!r}")

    # Validate section_verdicts if present
    sv = review.get("section_verdicts", {})
    for section, verdict in sv.items():
        if verdict not in ("PASS", "WEAK", "REJECT"):
            raise ValueError(
                f"sarat_mode section_verdict for '{section}' must be PASS/WEAK/REJECT, got {verdict!r}"
            )

    # Validate score
    score = review.get("score")
    if not isinstance(score, (int, float)) or not (0 <= score <= 100):
        raise ValueError(f"sarat_mode score must be 0-100, got {score!r}")
    review["score"] = int(score)

    # Ensure sarat_voice_summary is present
    if not review.get("sarat_voice_summary", "").strip():
        raise ValueError("sarat_mode critique must include a non-empty sarat_voice_summary")

    # Enforce: every kill must have a reason
    for kill in review.get("kill_list", []):
        if not kill.get("reason", "").strip():
            raise ValueError(
                f"Sarat killed '{kill.get('section')}' without a reason. "
                "Every kill must cite a lens and explain specifically why."
            )

    return review


# ---------------------------------------------------------------------------
# 8. Generate presentation deck
# ---------------------------------------------------------------------------

def generate_presentation_deck(
    *,
    client_name: str,
    topic: str,
    facts: list[dict],
    constraints: list[dict],
    inferences: list[dict],
    gaps: list[dict],
    iteration_num: int,
    previous_critique: dict | None = None,
) -> str:
    """
    Generates a 12-slide PowerPoint-style presentation in markdown format.
    Returns the full markdown string. Raises ValueError if banned phrases found.
    """
    prompt = presentation_generation_prompt(
        client_name=client_name,
        topic=topic,
        facts=facts,
        constraints=constraints,
        inferences=inferences,
        gaps=gaps,
        iteration_num=iteration_num,
        previous_critique=previous_critique,
    )
    raw = _chat(prompt, temperature=0.15)

    banned = check_banned_phrases(raw)
    if banned:
        raise ValueError(
            f"Presentation contains banned phrases: {banned}. Must be revised before delivery."
        )

    return raw
