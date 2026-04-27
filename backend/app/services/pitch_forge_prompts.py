"""pitch_forge_prompts.py — Deterministic prompt templates for the Pitch Forge pipeline.

Every template:
- Takes typed, explicit inputs
- Produces a structured output contract
- Embeds hard constraints from anti-ai-style.md and client-specific rules
- Defines evaluation criteria so the caller can verify the result

Usage:
    from app.services.pitch_forge_prompts import (
        research_synthesis_prompt,
        use_case_generation_prompt,
        red_team_critique_prompt,
        research_gap_refill_prompt,
        proposal_rebuild_prompt,
        final_client_output_prompt,
    )
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Banned phrase list (from anti-ai-style.md)
# ---------------------------------------------------------------------------

BANNED_PHRASES: list[str] = [
    "streamline", "unlock", "empower", "holistic", "transformative", "robust",
    "leverage", "utilize", "harness", "seamless", "cutting-edge", "state-of-the-art",
    "world-class", "unparalleled", "unprecedented", "pivotal", "game-changer",
    "deep dive", "revolutionize", "reimagine", "supercharge", "spearhead",
    "orchestrate", "paradigm", "synergy", "ecosystem", "journey", "landscape",
    "tapestry", "cornerstone", "bedrock", "treasure trove", "plethora",
    "furthermore", "moreover", "in conclusion", "to summarize", "in essence",
    "ultimately", "at the end of the day", "when it comes to", "in the realm of",
    "needless to say", "it goes without saying", "it's important to note",
    "it's worth noting", "not just X but Y", "not only but also",
    "think of it like", "imagine this", "let's dive in", "let's explore",
    "i hope this helps", "feel free to", "certainly", "absolutely",
    "great question", "what a fascinating",
]

BANNED_PHRASE_LIST_STR = "\n".join(f"  - {p}" for p in BANNED_PHRASES)

# ---------------------------------------------------------------------------
# Score dimension weights (must sum to 100)
# ---------------------------------------------------------------------------
SCORE_WEIGHTS = {
    "specificity": 25,
    "economic_value": 25,
    "client_fit": 20,
    "evidence_quality": 15,
    "demo_readiness": 15,
}

# ---------------------------------------------------------------------------
# Shared writing rules injected into every prompt
# ---------------------------------------------------------------------------
WRITING_RULES = """
WRITING RULES (hard constraints — violating these is grounds for rejection):
1. No generic AI consulting language. Every statement must tie to the specific client.
2. Banned words and phrases — do not use any of these:
{banned}
3. No em-dash overuse. Use commas, periods, or restructure the sentence.
4. No "not X but Y" or "not only X but also Y" constructions.
5. State economic impact in concrete terms: hours, dollars, error count, headcount, cycle time.
   "Improved efficiency" is not acceptable. "Reduce quote comparison time from 4 hours to 45 minutes" is.
6. No white-paper prose. Write in clear declarative sentences or tight bullets.
7. Every claim of impact must have a confidence level: high / medium / low / speculative.
8. If data is missing or unverified, write "Not available: <reason>" — do not invent.
9. No assumption that Novendor will build custom software unless the client explicitly requested it.
10. No assumption that headcount will be reduced. Frame as capacity increase or error reduction.
""".strip().format(banned=BANNED_PHRASE_LIST_STR)


# ---------------------------------------------------------------------------
# 1. research_synthesis_prompt
# ---------------------------------------------------------------------------

def research_synthesis_prompt(
    *,
    client_name: str,
    raw_research: str,
    known_constraints: list[str],
) -> str:
    constraints_str = "\n".join(f"  - {c}" for c in known_constraints)
    return f"""You are a senior business analyst. Your task is to synthesize raw research on {client_name} into a structured knowledge base.

CLIENT: {client_name}
KNOWN CONSTRAINTS (do not violate these in any output):
{constraints_str}

RAW RESEARCH:
{raw_research}

---
{WRITING_RULES}
---

OUTPUT REQUIREMENTS:
Return a JSON object with this exact structure:
{{
  "facts": [
    {{"text": "<fact>", "confidence": "high|medium|low", "source": "<source label>"}}
  ],
  "constraints": [
    {{"text": "<hard constraint that limits what can be proposed>"}}
  ],
  "inferences": [
    {{"text": "<reasoned inference, clearly marked as inference>", "basis": "<what it is inferred from>"}}
  ],
  "gaps": [
    {{"text": "<missing data point>", "why_it_matters": "<what decision it would inform>", "available": false, "unavailable_reason": "<why we don't have it>"}}
  ],
  "risks": [
    {{"text": "<risk if we proceed without this>", "severity": "fatal|significant|minor"}}
  ]
}}

DO NOT invent facts. If you cannot confirm something from the research provided, record it as a gap with available=false.
"""


# ---------------------------------------------------------------------------
# 2. use_case_generation_prompt
# ---------------------------------------------------------------------------

def use_case_generation_prompt(
    *,
    client_name: str,
    facts: list[dict],
    constraints: list[dict],
    inferences: list[dict],
    gaps: list[dict],
) -> str:
    facts_str = "\n".join(f"  - [{f['confidence']}] {f['text']}" for f in facts)
    constraints_str = "\n".join(f"  - HARD CONSTRAINT: {c['text']}" for c in constraints)
    inferences_str = "\n".join(f"  - [INFERENCE] {i['text']}" for i in inferences)
    gaps_str = "\n".join(f"  - NOT AVAILABLE: {g['text']} — {g.get('unavailable_reason','unknown')}" for g in gaps)

    return f"""You are preparing a targeted proposal for {client_name}. Generate 3 to 5 candidate use cases based strictly on the research below.

CLIENT: {client_name}

VERIFIED FACTS:
{facts_str}

HARD CONSTRAINTS (every use case must respect all of these):
{constraints_str}

INFERENCES (treat as supporting context, not confirmed facts):
{inferences_str}

KNOWN DATA GAPS (reference these where relevant — do not fill them with invented data):
{gaps_str}

---
{WRITING_RULES}
---

For each use case, return a JSON object:
{{
  "use_cases": [
    {{
      "workflow_name": "<short name, 2-5 words, no buzzwords>",
      "current_pain": "<what the team does today and what goes wrong — be specific to {client_name}>",
      "proposed_intervention": "<what changes — describe the action, not the technology>",
      "who_uses_it": "<specific role(s) at {client_name}, not 'users' or 'employees'>",
      "change_tomorrow": "<what is different the next working morning after this is in place>",
      "estimated_impact": "<quantified: hours, dollars, error rate, cycle time — not 'improved efficiency'>",
      "impact_confidence": "high|medium|low|speculative",
      "dependencies": "<what must be true for this to work — systems, data access, process changes>",
      "novendor_credibility": "<why Novendor specifically is the right partner for this — cite relevant experience, not generic capability>",
      "evidence_used": ["<list of fact/inference IDs or labels that justify this use case>"],
      "flaw": "<honest statement of the weakest point of this use case — be specific>"
    }}
  ]
}}

VALIDATION RULES before you return:
- Every use case must reference at least one verified fact.
- estimated_impact cannot be empty or vague.
- who_uses_it cannot be "the team" or "employees" — name the role.
- change_tomorrow must describe a morning-of observable difference.
- flaw must be a real weakness, not a hedge. "We don't have confirmed data on X" is acceptable.
"""


# ---------------------------------------------------------------------------
# 3. red_team_critique_prompt
# ---------------------------------------------------------------------------

def red_team_critique_prompt(
    *,
    client_name: str,
    constraints: list[dict],
    use_cases: list[dict],
    iteration_num: int,
    max_iterations: int = 3,
) -> str:
    constraints_str = "\n".join(f"  - {c['text']}" for c in constraints)
    use_cases_str = "\n\n".join(
        f"USE CASE {i+1}: {uc.get('workflow_name','?')}\n"
        f"  Pain: {uc.get('current_pain','')}\n"
        f"  Intervention: {uc.get('proposed_intervention','')}\n"
        f"  Who: {uc.get('who_uses_it','')}\n"
        f"  Change tomorrow: {uc.get('change_tomorrow','')}\n"
        f"  Impact: {uc.get('estimated_impact','')} [{uc.get('impact_confidence','')}]\n"
        f"  Dependencies: {uc.get('dependencies','')}\n"
        f"  Credibility: {uc.get('novendor_credibility','')}\n"
        f"  Known flaw: {uc.get('flaw','')}"
        for i, uc in enumerate(use_cases)
    )

    return f"""You are a rigorous proposal reviewer. Your job is to critique this draft for {client_name} with the goal of producing something a skeptical CFO/CIO would take seriously.

This is iteration {iteration_num} of {max_iterations}. Do not give soft feedback. If something is weak, say exactly why.

CLIENT HARD CONSTRAINTS (any use case that violates these is automatically killed):
{constraints_str}

DRAFT USE CASES:
{use_cases_str}

---
{WRITING_RULES}
---

CRITIQUE CRITERIA — assess each use case against all of these:
1. generic_language — uses vague AI consulting terms rather than {client_name}-specific language
2. no_economic_delta — estimated_impact is vague, missing, or not quantified
3. violates_client_constraint — conflicts with a stated hard constraint
4. unrealistic_automation — assumes a level of automation {client_name} has not requested or cannot support
5. tool_first_not_workflow — pitches a product rather than describing a workflow change
6. fake_precision — claims a specific number with no basis (e.g., "save $50k" with no derivation)
7. unclear_buyer_value — the person who approves this cannot explain why they should fund it
8. not_demoable — there is no way to show this working in a 30-minute demonstration

For each issue found, classify it:
- fatal: this use case should be killed — it cannot be fixed without new information
- fixable: the use case is viable but needs a specific change (state what the change is)
- acceptable_weakness: acknowledged risk that does not block the use case
- missing_input: we need a specific data point to resolve this (state exactly what)

---

SCORING RUBRIC (max 100 points):
- Specificity (25): Are use cases specific to {client_name}'s workflows, people, and systems?
- Economic Value (25): Is the dollar/time/error impact clearly quantified per use case?
- Client Fit (20): Does each use case respect {client_name}'s stated constraints and culture?
- Evidence Quality (15): Are claims backed by verified facts (not inferences)?
- Demo Readiness (15): Can each use case be shown working in a 30-minute demo?

Thresholds: 80+ = pass | 65–79 = one rebuild allowed | <65 = research refill required

---

Return this JSON structure exactly:
{{
  "score": <int 0-100>,
  "score_breakdown": {{
    "specificity": <int 0-25>,
    "economic_value": <int 0-25>,
    "client_fit": <int 0-20>,
    "evidence_quality": <int 0-15>,
    "demo_readiness": <int 0-15>
  }},
  "verdict": "pass|rebuild|research_refill|fail",
  "verdict_reason": "<one clear sentence stating why this verdict was reached>",
  "kill_list": [
    {{"use_case": "<workflow_name>", "criterion": "<which criterion failed>", "reason": "<specific, client-grounded explanation>"}}
  ],
  "weak_spots": [
    {{"use_case": "<workflow_name>", "issue_type": "fixable|acceptable_weakness", "description": "<what needs to change>"}}
  ],
  "missing_evidence": [
    {{"use_case": "<workflow_name>", "what_is_missing": "<specific fact>", "why_it_matters": "<what it would change>"}}
  ],
  "research_refill": [
    {{"topic": "<specific question>", "why_blocked": "<what we cannot say without this>"}}
  ],
  "fatal_issues": ["<description of each fatal issue>"],
  "fixable_issues": [
    {{"issue": "<description>", "fix": "<exactly what must change>"}}
  ],
  "acceptable_weaknesses": ["<acknowledged weakness that does not block>"],
  "missing_inputs": [
    {{"input_needed": "<exact data point>", "blocks": "<what decision this would unlock>"}}
  ]
}}

IMPORTANT: You must cite a specific, fixable reason for every rejection. "Weak overall" is not a valid kill reason.
If iteration_num equals max_iterations ({max_iterations}) and score < 80, set verdict="fail" and populate verdict_reason with exactly what input would be needed to make this passable.
"""


# ---------------------------------------------------------------------------
# 4. research_gap_refill_prompt
# ---------------------------------------------------------------------------

def research_gap_refill_prompt(
    *,
    client_name: str,
    gaps: list[dict],
    missing_from_red_team: list[dict],
    existing_sources: list[str],
) -> str:
    gaps_str = "\n".join(
        f"  - GAP: {g.get('text', g.get('what_is_missing','?'))}\n"
        f"    Why it matters: {g.get('why_it_matters', g.get('why_blocked','?'))}"
        for g in gaps + missing_from_red_team
    )
    sources_str = "\n".join(f"  - {s}" for s in existing_sources) if existing_sources else "  (none yet)"

    return f"""You are helping prepare a proposal for {client_name}. The red team identified gaps in the research that blocked a passing score.

EXISTING SOURCES ALREADY CONSULTED:
{sources_str}

GAPS THAT MUST BE RESOLVED:
{gaps_str}

---
{WRITING_RULES}
---

Your task: for each gap, provide either:
(a) a concrete answer if you can derive it from the existing research and common knowledge about {client_name}'s industry
(b) a precise formulation of what question to ask {client_name} directly

Return this JSON:
{{
  "resolved_gaps": [
    {{
      "original_gap": "<gap text>",
      "resolution": "<what we now know or can reasonably state>",
      "confidence": "high|medium|low",
      "source": "derived|industry_standard|public_record|requires_client_confirmation"
    }}
  ],
  "unresolved_gaps": [
    {{
      "original_gap": "<gap text>",
      "question_to_ask": "<precise question to put to the client>",
      "why_blocking": "<what we cannot write without this>",
      "workaround": "<how to write around it if we cannot get the answer>"
    }}
  ]
}}

Do not fabricate resolutions. If you cannot confirm something, mark it unresolved with a workaround.
"""


# ---------------------------------------------------------------------------
# 5. proposal_rebuild_prompt
# ---------------------------------------------------------------------------

def proposal_rebuild_prompt(
    *,
    client_name: str,
    previous_use_cases: list[dict],
    red_team_review: dict,
    resolved_gaps: list[dict],
    constraints: list[dict],
    iteration_num: int,
) -> str:
    kill_list = red_team_review.get("kill_list", [])
    fixable = red_team_review.get("fixable_issues", [])
    weak_spots = red_team_review.get("weak_spots", [])

    killed_names = {k["use_case"] for k in kill_list}
    surviving = [uc for uc in previous_use_cases if uc.get("workflow_name") not in killed_names]

    killed_str = "\n".join(f"  - KILLED: {k['use_case']} — {k['reason']}" for k in kill_list) or "  (none killed)"
    fixable_str = "\n".join(f"  - FIX REQUIRED: {f['issue']} → {f['fix']}" for f in fixable) or "  (none)"
    weak_str = "\n".join(f"  - WEAK: {w['use_case']}: {w['description']}" for w in weak_spots) or "  (none)"
    resolved_str = "\n".join(
        f"  - RESOLVED: {r['original_gap']} → {r['resolution']} [{r['confidence']}]"
        for r in resolved_gaps
    ) or "  (none)"
    constraints_str = "\n".join(f"  - HARD CONSTRAINT: {c['text']}" for c in constraints)

    surviving_str = "\n\n".join(
        f"  USE CASE (KEEP + IMPROVE): {uc.get('workflow_name','?')}\n"
        f"    Current pain: {uc.get('current_pain','')}\n"
        f"    Intervention: {uc.get('proposed_intervention','')}\n"
        f"    Impact: {uc.get('estimated_impact','')} [{uc.get('impact_confidence','')}]"
        for uc in surviving
    ) or "  (all use cases were killed — full rebuild required)"

    return f"""You are rebuilding a proposal for {client_name} after a red team critique. This is iteration {iteration_num}.

HARD CONSTRAINTS:
{constraints_str}

WHAT WAS KILLED (do not include these — they failed for specific reasons):
{killed_str}

FIXES REQUIRED ON SURVIVING USE CASES:
{fixable_str}

WEAK SPOTS TO ADDRESS:
{weak_str}

NEW INFORMATION FROM RESEARCH REFILL:
{resolved_str}

SURVIVING USE CASES (improve these using the fixes above):
{surviving_str}

---
{WRITING_RULES}
---

Rebuild the use case list. You may:
- Improve surviving use cases using the required fixes
- Replace killed use cases with entirely new ones if better evidence now supports them
- Reorder use cases by strength (strongest first)

Return the same use_case JSON structure as the generation step.
Every use case must be stronger than the previous draft. State specifically what changed and why.
"""


# ---------------------------------------------------------------------------
# 6. final_client_output_prompt
# ---------------------------------------------------------------------------

def final_client_output_prompt(
    *,
    client_name: str,
    use_cases: list[dict],
    score: int,
    format: str = "bullet_email",
) -> str:
    use_cases_str = "\n\n".join(
        f"USE CASE {i+1}: {uc.get('workflow_name','?')}\n"
        f"  Pain: {uc.get('current_pain','')}\n"
        f"  Intervention: {uc.get('proposed_intervention','')}\n"
        f"  Who: {uc.get('who_uses_it','')}\n"
        f"  Change tomorrow: {uc.get('change_tomorrow','')}\n"
        f"  Impact: {uc.get('estimated_impact','')} [{uc.get('impact_confidence','')}]\n"
        f"  Credibility: {uc.get('novendor_credibility','')}"
        for i, uc in enumerate(use_cases)
        if uc.get("status") not in ("killed",)
    )

    format_instructions = {
        "bullet_email": (
            "Format as tight bullet points suitable for a follow-up email. "
            "Max 5 lines per use case. Lead with the pain, then the intervention, then the impact. "
            "No preamble. No closing paragraph."
        ),
        "deck_bullets": (
            "Format as slide bullets: one headline per use case (10 words max), "
            "then 3 supporting bullets per use case. "
            "Each bullet is one sentence, plain English."
        ),
        "talking_points": (
            "Format as spoken talking points: 3–4 sentences per use case. "
            "Write as if the seller is explaining this to a CFO/CIO on a phone call. "
            "Direct, specific, no consulting language."
        ),
    }.get(format, "Format as tight bullet points.")

    return f"""You are preparing the final client-facing output for {client_name}. This proposal scored {score}/100 and is ready to send.

PASSING USE CASES:
{use_cases_str}

---
{WRITING_RULES}
---

OUTPUT FORMAT: {format_instructions}

ADDITIONAL HARD RULES for final output:
- No introductory sentence like "Here are the areas where..." or "Based on our research..."
- No closing sentence like "We look forward to..." or "This is how Novendor can help..."
- No claim without a number or a named role. "Save time" is not allowed. "Save the AP clerk 6 hours/week" is.
- No use of the words: streamline, unlock, empower, holistic, transformative, robust, leverage, seamless
- Every use case must name the specific {client_name} workflow or system it touches
- The output must be paste-ready into an email, deck, or call prep document

Return the output as plain text (not JSON). Begin with the first use case immediately.
"""


# ---------------------------------------------------------------------------
# Sarat Mode constants — encode his operating psychology directly
# ---------------------------------------------------------------------------

SARAT_OBJECTION_STACK = """
SARAT'S OBJECTION STACK — he raises these in order; address each one or it kills the section:

1. FINANCIAL REALITY CHECK
   "Show me the dollars or capacity change. If headcount doesn't change, costs don't change, and throughput doesn't increase — it's a net negative. I have one AP clerk. I can't go below one. What does this actually do financially?"

2. SYSTEM ADDITION VETO
   "We're not an IT company. Anything that adds a system to maintain, integrate, or own gets rejected immediately. It doesn't matter how good the ROI looks if we have to babysit it."

3. RELIABILITY FLOOR
   "We've had OCR for decades. It was always 90–95% accurate. That's useless for accounting. Near-perfect or don't bother. What's the failure mode and what's the cost when it fails?"

4. REDUNDANCY CHALLENGE
   "My people are already building Claude workflows. Consultants are being disintermediated. Why can't my team do this themselves? What makes this something they need you for?"

5. GENERIC RECOGNITION FILTER
   "I've heard this framing before. If this could apply to any company in any industry, I'm out. Show me that you understand our specific workflows — QEM dispatch, Beam Team RFI cycles, single AP clerk — or we're done."
""".strip()

SARAT_CRITIQUE_LENSES = """
REQUIRED CRITIQUE LENSES — challenge every section on all 6:

LENS 1: ECONOMIC REALITY
- Does this change cost structure or throughput for {client_name} specifically?
- Is the impact quantified in hours, dollars, or headcount capacity?
- "Improved efficiency" is not an answer. What changes in week 1?

LENS 2: OPERATIONAL REALITY
- Who at {client_name} does something different on Monday morning?
- What specific role, at what specific task, with what specific change in behavior?
- If you can't name the person and the task, it's theoretical.

LENS 3: TOOL VS WORKFLOW
- Is this describing a workflow change, or just "use AI to do this"?
- If the answer is "Claude does X" without describing the before/after human process, it fails.
- A workflow change has: a trigger, a human action that changes, and a measurable output.

LENS 4: RELIABILITY
- What happens when the AI output is wrong 5% of the time?
- In AP or scheduling, a 5% error rate is not acceptable.
- What's the correction process? Who catches it? What's the cost of a miss?

LENS 5: OWNERSHIP BURDEN
- Who maintains this when the prompt stops working?
- Who updates it when Acumatica changes? When a new OpCo is added?
- {client_name} has a 3-person IT team. Be specific about what they have to own.

LENS 6: REDUNDANCY
- {client_name}'s team already uses Claude. What does this add that they can't do today?
- If the answer is "a better prompt" — that's not a service, that's a deliverable.
- The value must come from workflow design, not from the model itself.
""".strip()

SARAT_STYLE_RULES = """
SARAT MODE STYLE RULES:

Tone: Direct. Skeptical but not hostile. No patience for abstractions.
Behavior: Skips fluff. Attacks assumptions. Anchors to operations.

BAD (he disengages):
- "This enhances operational efficiency across your portfolio"
- "AI-native workflows will position Hallboys for the future"
- "A holistic approach to document management"

GOOD (he stays engaged):
- "Your estimators spend ~2 hours comparing bids. This cuts it to ~45 minutes. Same headcount, more bids per week."
- "The AP clerk currently reviews 100% of invoices manually. This pre-screens 70% as routine. She reviews the 30% that need judgment first."
- "When this is wrong — wrong field extracted, wrong amount matched — the AP clerk catches it before posting. No automated posting, ever."

Write like an operator explaining real work to another operator.
""".strip()


# ---------------------------------------------------------------------------
# 7. sarat_mode_critique_prompt
# ---------------------------------------------------------------------------

def sarat_mode_critique_prompt(
    *,
    client_name: str,
    presentation_content: str,
    iteration_num: int,
    max_iterations: int = 3,
    known_constraints: list[str] | None = None,
) -> str:
    constraints_str = "\n".join(f"  - {c}" for c in (known_constraints or [
        "3-person IT team — no new systems to maintain",
        "Single AP clerk — cannot assume elimination",
        "No custom software builds",
        "Acumatica is the ERP",
        "Claude Cowork already deployed — employees use it today",
        "Resistance to consulting-style engagements",
    ]))

    return f"""You are critiquing a sales presentation for {client_name} as Sarat Vemuri — CFO/CIO, operationally-minded, skeptical of AI consulting.

This is iteration {iteration_num} of {max_iterations}.

---
{SARAT_OBJECTION_STACK}

---
{SARAT_CRITIQUE_LENSES.format(client_name=client_name)}

---
{SARAT_STYLE_RULES}

---
{WRITING_RULES}

---
KNOWN CONSTRAINTS FOR {client_name}:
{constraints_str}

---
PRESENTATION TO CRITIQUE:
{presentation_content}

---
OUTPUT REQUIREMENTS:

Return a JSON object:
{{
  "overall_score": <int 0-100>,
  "score_breakdown": {{
    "specificity": <int 0-25>,
    "economic_value": <int 0-25>,
    "client_fit": <int 0-20>,
    "evidence_quality": <int 0-15>,
    "demo_readiness": <int 0-15>
  }},
  "objection_scores": {{
    "financial_reality": <int 0-10, how well addressed>,
    "no_new_system": <int 0-10>,
    "reliability": <int 0-10>,
    "redundancy": <int 0-10>,
    "specificity_to_client": <int 0-10>
  }},
  "section_verdicts": [
    {{
      "section": "<slide/section name>",
      "verdict": "PASS|WEAK|REJECT",
      "lens_failures": ["<which lens failed>"],
      "reason": "<specific, not generic — cite the exact language or assumption that failed>",
      "required_fix": "<exactly what must change — be concrete>",
      "missing_data": "<what information would make this credible or not needed>"
    }}
  ],
  "kill_list": [
    {{
      "item": "<what gets removed>",
      "reason": "<Sarat's specific objection — must reference his actual concerns>",
      "what_would_save_it": "<exact condition under which this survives>"
    }}
  ],
  "what_would_move_him": [
    "<specific change, grounded in his operating psychology>"
  ],
  "verdict": "pass|rebuild|research_refill|fail",
  "verdict_reason": "<Sarat's voice — direct, specific, operator-level>",
  "sarat_voice_summary": "<2-4 sentences in Sarat's voice explaining his overall reaction — as if he's speaking on the call>"
}}

SCORING THRESHOLDS: 80+ = acceptable | 65–79 = needs rebuild | <65 = major rework
{"If this is iteration " + str(max_iterations) + " and score < 80, set verdict='fail' and state exactly what input would be required to pass." if iteration_num >= max_iterations else ""}

The section_verdicts must cover every major section of the presentation.
PASS means it would not trigger an objection. WEAK means it might. REJECT means he's out.
Every REJECT and WEAK must have a required_fix that is specific enough to act on.
"""


# ---------------------------------------------------------------------------
# 8. presentation_generation_prompt
# ---------------------------------------------------------------------------

def presentation_generation_prompt(
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
    facts_str = "\n".join(f"  - [{f.get('confidence','?')}] {f['text']}" for f in facts) or "  (none verified yet)"
    constraints_str = "\n".join(f"  - HARD CONSTRAINT: {c['text']}" for c in constraints) or "  (none specified)"
    inferences_str = "\n".join(f"  - [INFERENCE] {i['text']}" for i in inferences) or "  (none)"
    gaps_str = "\n".join(f"  - NOT AVAILABLE: {g['text']} — {g.get('unavailable_reason','')}" for g in gaps) or "  (none)"

    critique_context = ""
    if previous_critique and iteration_num > 1:
        kills = previous_critique.get("kill_list", [])
        fixes = previous_critique.get("section_verdicts", [])
        what_moves = previous_critique.get("what_would_move_him", [])
        kill_str = "\n".join(f"  - REMOVED: {k['item']} — {k['reason']}" for k in kills) or "  (none)"
        fix_str = "\n".join(
            f"  - [{v['verdict']}] {v['section']}: {v.get('required_fix', '')}"
            for v in fixes if v["verdict"] != "PASS"
        ) or "  (none)"
        moves_str = "\n".join(f"  - {m}" for m in what_moves) or "  (none)"
        critique_context = f"""
PREVIOUS ITERATION CRITIQUE (apply all of these fixes — do not carry forward any rejected sections):
KILLS (do not include):
{kill_str}

REQUIRED FIXES:
{fix_str}

WHAT WOULD MOVE HIM:
{moves_str}

Previous score: {previous_critique.get('overall_score', '?')}/100
"""

    return f"""You are generating a PowerPoint-style pitch deck in markdown for {client_name}.
Topic: {topic}
Iteration: {iteration_num}

---
{SARAT_STYLE_RULES}

---
{WRITING_RULES}

---
HARD CONSTRAINTS (every slide must respect all of these):
{constraints_str}

VERIFIED FACTS:
{facts_str}

INFERENCES (supporting context — not confirmed):
{inferences_str}

DATA GAPS (reference these where relevant — do not fill with invented data):
{gaps_str}
{critique_context}

---
REQUIRED DECK STRUCTURE (12 sections, in order):

## Slide 1: Title
Client name, topic, Novendor as partner, date.
One sentence positioning — plain, specific, no consulting language.

## Slide 2: Context — {client_name} Reality
NOT a market overview. NOT "AI is transforming industry."
State: what {client_name} actually is, how it operates, the specific dynamics that create the opportunity.
Include: OpCo structure, team sizes, ERP, existing Claude usage, IT capacity.
This slide proves you did the homework.

## Slide 3: Current State — Specific Workflows
Pick 2–3 of the highest-friction workflows.
For each: who does it, how they do it today, how long it takes, what breaks.
Use real role names (AP clerk, Beam Team PM, QEM dispatcher).
Do not generalize to "employees" or "the team."

## Slide 4: Problem Framing — Economic and Operational
Frame the cost in business terms:
- Hours/week spent on low-judgment work
- Error rate and cost of errors
- Capacity ceiling (what can't be done because time is consumed)
No abstract "strategic misalignment." Concrete numbers or ranges with stated confidence.

## Slide 5: Use Case 1 — [Name it specifically]
- Workflow: what it is
- Today: exact current process (who does what, how long, what breaks)
- Intervention: what changes (describe the workflow, not the technology)
- Tomorrow morning: what the relevant person does differently at 8am
- Impact: quantified — hours, dollars, error reduction, bids per week
- Confidence: high/medium/low/speculative
- What Novendor does: be specific, not "we help you implement"
- What the client owns after: who runs it, who updates it, what IT load it adds

## Slide 6: Use Case 2 — [Name it specifically]
Same structure as Slide 5.

## Slide 7: Use Case 3 — [Name it specifically]
Same structure as Slide 5.

## Slide 8: Expected Impact — Quantified
Aggregate impact across the 3 use cases.
For each: hours recovered, error reduction, capacity created.
Show the math — not "significant savings."
Flag confidence level for each number.
One row per use case. One total row.

## Slide 9: How This Works Day-to-Day
Walk through one use case as a real workflow:
- What triggers it
- What the human does
- What Claude does
- What the human decides
- What gets logged or tracked
- What happens when it's wrong
This slide addresses the reliability objection directly.

## Slide 10: Why This Fits {client_name} — Objection Handling
Address each of these explicitly (do not avoid any):
- "This adds another system to maintain" — how is this addressed?
- "My team can already do this with Claude" — what does Novendor add?
- "This isn't reliable enough for accounting/ops" — what's the error handling?
- "This doesn't change my cost structure" — restate the financial case
Do not use defensive language. State facts.

## Slide 11: Pilot Plan — Small and Low-Risk
One use case. One OpCo. 30 days.
Define: what gets built, who runs it, what success looks like, what happens if it fails.
No transformation language. This is a contained experiment.

## Slide 12: What Happens Next
3–4 concrete steps, with owners.
No "journey" or "partnership" language.
Example format:
- "Week 1: Novendor maps the AP invoice workflow with the clerk. Identifies top 3 exception patterns."
- "Week 2: Claude workflow built and tested on last month's invoices."
- "Week 3–4: Parallel run — old process + new process. Compare catch rates."

---
GENERATION RULES:
- Each slide must stand alone as a readable unit
- Every number or estimate must include confidence: [high/medium/low/speculative]
- Do not use bullet points where prose would be clearer
- No consulting filler between slides
- If a gap means you cannot fully populate a slide, write "Not available: <reason>" for that field
- Write each slide as if Sarat is reading it cold, with no prior context

Return the full deck as plain markdown. Start with ## Slide 1: Title immediately.
"""
