"""Resume LLM service — intent router + streaming Claude responses for /paul.

Loads Paul's resume markdown at import time and uses it as system context
for LLM-powered responses. Falls back to deterministic knowledge base
when no API key is configured.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import AsyncGenerator


from app.config import (
    OPENAI_API_KEY,
    RESUME_LLM_MAX_TOKENS,
    RESUME_LLM_MODEL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Resume corpus — loaded once at import time
# ---------------------------------------------------------------------------

_RESUME_PATH = Path(__file__).resolve().parents[3] / "docs" / "resume" / "paul-malmquist-resume-2026.md"

try:
    _RESUME_CORPUS: str = _RESUME_PATH.read_text(encoding="utf-8")
except FileNotFoundError:
    logger.warning("Resume markdown not found at %s — LLM responses will lack context", _RESUME_PATH)
    _RESUME_CORPUS = ""


# ---------------------------------------------------------------------------
# System prompt — advocate persona
# ---------------------------------------------------------------------------

RESUME_SYSTEM_PROMPT = """You are Winston, Paul Malmquist's AI resume agent on his public resume page at paulmalmquist.com.
Your purpose: persuade the reader that Paul is an exceptional hire.

Rules:
- Confident, persuasive, specific. You are Paul's advocate.
- Never say "I don't have context", "I'm not sure", or "I don't know".
- Never cite sources with [brackets], footnotes, or "according to".
- Never use generic assistant phrasing like "I'd be happy to help" or "Great question!".
- If asked about unrelated topics (weather, sports, random), redirect: "I focus on Paul's background and capabilities — happy to walk through his experience or fit for your team."
- Use concrete numbers from the resume: $4B AUM, 500+ properties, 160 hrs/month automated, 83 MCP tools, 10-day reporting acceleration, 50% DDQ reduction, 75% reconciliation reduction, 95% error reduction, ~100x waterfall speedup.
- Keep responses 2-4 paragraphs unless the user explicitly asks for more detail.
- For comparisons, use a structured side-by-side format (table or parallel sections).
- For "should I hire" questions, be unequivocally affirmative with evidence.
- For skill/ranking questions, lead with the strongest evidence and stack proof points.
- For timeline questions, provide specific dates, roles, and companies.
- Write in clean markdown. Use bold for emphasis, headers for structure when needed.
"""


# ---------------------------------------------------------------------------
# Structured intent classification
# ---------------------------------------------------------------------------

@dataclass
class ResumeIntent:
    subject: str = "person"          # person | experience | skill | career
    metric: str | None = None        # duration | impact | timeline | comparison | null
    transformation: str = "summary"  # summary | compare | rank | trend | explain
    group_by: str | None = None      # company | role | skill | time | null
    aggregation: str | None = None   # count | duration | max | latest | null
    sort_by: str | None = None       # time | impact | null
    sort_direction: str | None = None  # asc | desc | null
    limit: int | None = None
    timeframe: str | None = None
    needs_clarification: bool = False

    def to_instruction(self) -> str:
        """Convert intent to a natural language instruction for the LLM."""
        parts: list[str] = []

        if self.transformation == "compare":
            parts.append("Structure your response as a comparison. Use a table or side-by-side format.")
        elif self.transformation == "rank":
            parts.append("Rank the items from strongest to weakest with evidence for each.")
            if self.limit:
                parts.append(f"Limit to the top {self.limit}.")
        elif self.transformation == "trend":
            parts.append("Show the progression over time.")

        if self.aggregation == "count":
            parts.append("Include a specific count.")
        elif self.aggregation == "duration":
            parts.append("Include specific durations and date ranges.")

        if self.group_by == "company":
            parts.append("Organize by company/employer.")
        elif self.group_by == "role":
            parts.append("Organize by role/position.")
        elif self.group_by == "time":
            parts.append("Organize chronologically.")

        if self.metric == "timeline":
            parts.append("Focus on dates, start/end times, and career progression.")
        elif self.metric == "impact":
            parts.append("Lead with measurable outcomes and ROI.")

        if self.sort_direction == "desc":
            parts.append("Lead with the strongest/most impactful items.")
        elif self.sort_direction == "asc":
            parts.append("Start from the earliest/smallest and build up.")

        if self.timeframe:
            parts.append(f"Focus on the timeframe: {self.timeframe}.")

        return " ".join(parts) if parts else "Provide a clear, concise summary."


def classify_resume_intent(query: str) -> ResumeIntent:
    """Rule-based intent classification from natural language query."""
    q = query.lower().strip()
    intent = ResumeIntent()

    # --- Subject detection ---
    if re.search(r"\b(skill|tech|stack|language|tool|framework|proficien)\b", q):
        intent.subject = "skill"
    elif re.search(r"\b(role|job|position|title|career|path)\b", q):
        intent.subject = "career"
    elif re.search(r"\b(built|shipped|deployed|system|project|experience|work|did)\b", q):
        intent.subject = "experience"
    else:
        intent.subject = "person"

    # --- Comparison detection ---
    if re.search(r"\b(compare|vs\.?|versus|difference|between)\b", q):
        intent.transformation = "compare"
        intent.metric = "comparison"
        intent.group_by = "company"

    # --- Aggregation keywords ---
    if re.search(r"\bhow many\b", q):
        intent.aggregation = "count"
    elif re.search(r"\bhow long\b", q):
        intent.aggregation = "duration"
        intent.metric = "duration"

    # --- Ranking / superlatives ---
    if re.search(r"\b(strongest|best|top|most|greatest|biggest|primary|main)\b", q):
        intent.transformation = "rank"
        intent.sort_by = "impact"
        intent.sort_direction = "desc"

    # --- "top N" pattern ---
    top_match = re.search(r"\btop\s+(\d+)\b", q)
    if top_match:
        intent.limit = int(top_match.group(1))
        intent.transformation = "rank"
        intent.sort_by = "impact"
        intent.sort_direction = "desc"

    # --- Latest ---
    if re.search(r"\b(latest|recent|current|now)\b", q):
        intent.aggregation = "latest"
        intent.sort_by = "time"
        intent.sort_direction = "desc"

    # --- Timeline / when ---
    if re.search(r"\b(when|timeline|start|began|join|left|year|date)\b", q):
        intent.metric = "timeline"

    # --- Impact ---
    if re.search(r"\b(impact|roi|result|outcome|value|saved|reduced|automated|accelerat)\b", q):
        intent.metric = "impact"

    # --- Group by ---
    if re.search(r"\bby company\b|\bby (firm|employer|org)\b", q):
        intent.group_by = "company"
    elif re.search(r"\bby role\b|\bby (position|title)\b", q):
        intent.group_by = "role"
    elif re.search(r"\bover time\b|\bby (year|time|period)\b", q):
        intent.group_by = "time"
    elif re.search(r"\bby skill\b|\bby (tech|technology)\b", q):
        intent.group_by = "skill"

    # --- Timeframe extraction ---
    year_match = re.search(r"\b(20\d{2})\b", q)
    if year_match:
        intent.timeframe = year_match.group(1)

    company_patterns = {
        "kayne": "Kayne Anderson (2018-2025)",
        "novendor": "Novendor (2024-Present)",
        "jll": "JLL",
        "jones lang": "JLL",
    }
    for pattern, label in company_patterns.items():
        if pattern in q:
            if not intent.timeframe:
                intent.timeframe = label
            break

    # --- Hire / fit questions ---
    if re.search(r"\b(hire|fit|right person|recommend|should i|worth)\b", q):
        intent.subject = "person"
        intent.transformation = "explain"
        intent.metric = "impact"

    return intent


# ---------------------------------------------------------------------------
# Streaming LLM response
# ---------------------------------------------------------------------------

async def stream_resume_response(
    messages: list[dict[str, str]],
    intent: ResumeIntent,
) -> AsyncGenerator[str, None]:
    """Stream an LLM response using the resume as context via OpenAI."""
    if not OPENAI_API_KEY:
        raise RuntimeError("No LLM API key configured")
    async for token in _stream_openai(messages, intent):
        yield token


def _build_messages(messages: list[dict[str, str]], intent: ResumeIntent) -> list[dict[str, str]]:
    """Build the message array for the LLM call."""
    intent_instruction = intent.to_instruction()

    # Start with resume context as first user message + assistant ack
    built: list[dict[str, str]] = [
        {
            "role": "user",
            "content": f"Here is Paul Malmquist's full resume for reference:\n\n{_RESUME_CORPUS}",
        },
        {
            "role": "assistant",
            "content": "I've reviewed Paul's complete resume. I'm ready to answer questions about his background, systems, and qualifications.",
        },
    ]

    # Add conversation history (last 10 messages, excluding the current one)
    history = messages[:-1] if messages else []
    for msg in history[-10:]:
        built.append({"role": msg["role"], "content": msg["content"]})

    # Add current user message with intent instruction
    current = messages[-1]["content"] if messages else ""
    user_content = current
    if intent_instruction and intent_instruction != "Provide a clear, concise summary.":
        user_content += f"\n\n[Respond with this structure: {intent_instruction}]"

    built.append({"role": "user", "content": user_content})
    return built


async def _stream_openai(
    messages: list[dict[str, str]],
    intent: ResumeIntent,
) -> AsyncGenerator[str, None]:
    """Stream from OpenAI Chat Completions API (fallback)."""
    import openai

    built = _build_messages(messages, intent)
    oai_messages = [{"role": "system", "content": RESUME_SYSTEM_PROMPT}] + built

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
    stream = await client.chat.completions.create(
        model=RESUME_LLM_MODEL,
        temperature=0.4,
        max_tokens=RESUME_LLM_MAX_TOKENS,
        messages=oai_messages,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            yield delta.content
