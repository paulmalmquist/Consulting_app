"""Query router — classifies natural language into execution plan.

Uses an LLM call to determine:
- route: "sql" or "python"
- intent: what's being asked
- entity_type: fund, deal, asset, partner
- python_fn: which calculation engine (if python route)
- params: extracted values (quarter, threshold, cap_rate, etc.)
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_FAST
from app.services.model_registry import sanitize_params

logger = logging.getLogger(__name__)


@dataclass
class RoutingPlan:
    route: str  # "sql" | "python"
    intent: str
    entity_type: str  # "fund" | "deal" | "asset" | "partner"
    python_fn: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


_ROUTER_SYSTEM = """You are a query router for a real estate private equity (REPE) analytics system.
Given a user's natural language question, classify it and produce a routing plan.

## Route: "sql"
Use for questions that read stored data: lookups, filters, aggregations, rankings, time series.
Examples:
  - "Show me NOI by asset" -> sql
  - "Which assets have occupancy below 90%?" -> sql
  - "Revenue trend for Q1-Q4" -> sql
  - "List loans maturing in 2026" -> sql
  - "Compare NOI across all multifamily assets" -> sql
  - "What's our fund IRR?" -> sql (reads from re_fund_metrics_qtr snapshot)
  - "Fund returns this quarter" -> sql
  - "DPI for Fund II" -> sql (reads from re_fund_quarter_state)

## Route: "python"
Use for questions that require CALCULATION over cash flow sequences or iterative math.
These CANNOT be done correctly in SQL.

| Question pattern | python_fn | Notes |
|---|---|---|
| "recalculate IRR" / "compute XIRR" / "what would IRR be if" | xirr | Iterative root-finding |
| "Run the waterfall" / "GP carry" / "LP distributions" | waterfall | 4-tier allocation |
| "Capital account rollforward" | rollforward | Period-by-period build |
| "Gross to net bridge" / "fee impact on returns" | irr_bridge | Sequential fee deduction |
| "Monte Carlo" / "probability of" / "simulate" | monte_carlo | Random simulation |
| "DCF valuation" / "10-year model" | dcf | Discounted cash flow |
| "What if cap rate is X" / "sensitivity" | what_if_valuation | Re-run with modified assumption |
| Fresh DPI/TVPI/RVPI computation | ratio_calc | From raw cash flows |

## IMPORTANT: pre-computed vs. fresh calculation
Some metrics exist BOTH as stored snapshots AND as computable values.
If the user asks "what's our fund IRR?" -> route to SQL (read the snapshot).
If the user asks "recalculate IRR with the latest cash flows" or "what would IRR be if..." -> route to Python.
If the user asks about a what-if scenario -> always Python.

## Output format (JSON only, no markdown):
{
  "route": "sql" or "python",
  "intent": "brief description",
  "entity_type": "fund" or "deal" or "asset" or "partner",
  "python_fn": null or function name from the table above,
  "params": {
    "quarter": "2025Q4" or null,
    "threshold": number or null,
    "cap_rate": number or null,
    "scenario": "actual" or "budget" or null,
    "asset_name": string or null,
    "fund_name": string or null
  }
}"""


async def route_query(prompt: str, *, quarter: str | None = None) -> RoutingPlan:
    """Classify a natural language query into a routing plan."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured — cannot route query")

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    user_msg = prompt
    if quarter:
        user_msg += f"\n\n(Current quarter context: {quarter})"

    create_kwargs = sanitize_params(
        OPENAI_CHAT_MODEL_FAST,
        messages=[
            {"role": "system", "content": _ROUTER_SYSTEM},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=512,
        temperature=0,
    )

    response = await asyncio.wait_for(
        client.chat.completions.create(**create_kwargs),
        timeout=15.0,
    )

    content = (response.choices[0].message.content or "{}").strip()
    # Strip markdown fences
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        logger.error("Router returned non-JSON: %s", content[:200])
        raise ValueError(f"Router returned non-JSON response: {content[:100]}")

    return RoutingPlan(
        route=data.get("route", "sql"),
        intent=data.get("intent", ""),
        entity_type=data.get("entity_type", "asset"),
        python_fn=data.get("python_fn"),
        params=data.get("params", {}),
    )
