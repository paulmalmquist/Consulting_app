"""AI routes — legacy stubs + new structured intent extraction endpoint."""
from __future__ import annotations

import json
import logging
import time

import openai
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import AI_GATEWAY_ENABLED, OPENAI_API_KEY, OPENAI_CHAT_MODEL_FAST

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])

# ---------------------------------------------------------------------------
# Intent extraction — system prompt
# ---------------------------------------------------------------------------
_INTENT_SYSTEM_PROMPT = """You extract dashboard composition intent from natural language prompts for real estate private equity portfolio managers.

Return a JSON object with exactly these fields:
{
  "archetype": string,
  "requested_sections": string[],
  "comparisons": string[],
  "time_view": string,
  "confidence": number
}

Valid archetypes (choose exactly one):
executive_summary, operating_review, monthly_operating_report, watchlist,
fund_quarterly_review, market_comparison, underwriting_dashboard

Valid sections (include all that apply):
kpi_summary, noi_trend, actual_vs_budget, underperformer_watchlist,
debt_maturity, income_statement, cash_flow, noi_bridge, occupancy_trend,
dscr_monitoring, downloadable_table

Valid comparisons: budget, prior_year
Valid time_view values: quarterly, monthly, ttm, ytd
confidence: 0.0–1.0

Rules:
1. Choose the SINGLE best archetype. Default to executive_summary when unsure.
2. Extract ALL sections the user explicitly or implicitly wants.
3. If the prompt is very generic (just "dashboard"), return requested_sections: [].
4. Return ONLY valid JSON — no markdown, no code fences, no explanation."""


# ---------------------------------------------------------------------------
# Structured intent extraction
# ---------------------------------------------------------------------------

class DashboardIntentRequest(BaseModel):
    prompt: str
    entity_type: str = "asset"


class DashboardIntentResponse(BaseModel):
    archetype: str = "executive_summary"
    requested_sections: list[str] = []
    comparisons: list[str] = []
    time_view: str = "quarterly"
    confidence: float = 0.5


@router.post("/intent/dashboard", response_model=DashboardIntentResponse)
async def extract_dashboard_intent(req: DashboardIntentRequest) -> DashboardIntentResponse:
    """Extract structured dashboard intent from a natural language prompt.

    Uses a fast OpenAI model with JSON mode. Falls back: the Next.js generate
    route handles non-2xx by switching to regex parsing.
    """
    if not AI_GATEWAY_ENABLED:
        raise HTTPException(status_code=501, detail="AI Gateway disabled: set OPENAI_API_KEY")

    start = time.time()
    try:
        client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model=OPENAI_CHAT_MODEL_FAST,
            messages=[
                {"role": "system", "content": _INTENT_SYSTEM_PROMPT},
                {"role": "user", "content": f"Entity type: {req.entity_type}\nPrompt: {req.prompt}"},
            ],
            temperature=0,
            max_tokens=400,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        elapsed = int((time.time() - start) * 1000)
        logger.info(
            "[ai_intent] extracted in %dms: archetype=%s sections=%s",
            elapsed,
            parsed.get("archetype"),
            parsed.get("requested_sections"),
        )
        return DashboardIntentResponse(
            archetype=parsed.get("archetype", "executive_summary"),
            requested_sections=parsed.get("requested_sections", []),
            comparisons=parsed.get("comparisons", []),
            time_view=parsed.get("time_view", "quarterly"),
            confidence=float(parsed.get("confidence", 0.5)),
        )
    except Exception as exc:
        elapsed = int((time.time() - start) * 1000)
        logger.error("[ai_intent] failed after %dms: %s", elapsed, exc)
        raise HTTPException(status_code=500, detail="Intent extraction failed") from exc


# ---------------------------------------------------------------------------
# Legacy stubs
# ---------------------------------------------------------------------------

@router.get("/health")
def health():
    return JSONResponse(
        content={
            "enabled": False,
            "sidecar_ok": False,
            "mode": "gateway",
            "message": "AI sidecar removed. Use /api/ai/gateway/health for the new AI Gateway.",
        }
    )


@router.post("/ask")
def ask():
    raise HTTPException(
        status_code=301,
        detail="AI sidecar removed. Use POST /api/ai/gateway/ask instead.",
    )


@router.post("/code_task")
def code_task():
    raise HTTPException(
        status_code=301,
        detail="AI sidecar removed. Use POST /api/ai/gateway/ask instead.",
    )
