"""Combined query agent — routes AND generates SQL in a single LLM call.

Reduces latency from 2 sequential LLM calls to 1.
Returns a JSON response with routing metadata + SQL query.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.services.model_registry import sanitize_params
from app.sql_agent.catalog import catalog_text

logger = logging.getLogger(__name__)


@dataclass
class AgentResult:
    route: str  # "sql" | "python"
    intent: str
    entity_type: str
    sql: str | None = None
    python_fn: str | None = None
    params: dict[str, Any] = field(default_factory=dict)


_SYSTEM = """You are a query agent for a real estate private equity (REPE) analytics system.
Given a user's natural language question, you must:
1. Classify the question (SQL lookup vs Python calculation)
2. If SQL: generate the SELECT query
3. Return structured JSON

## Routing rules

### Route: "sql" (most questions)
Use for questions that read stored data: lookups, filters, aggregations, time series.
"What's our fund IRR?" -> sql (reads stored snapshot)
"Show NOI by asset" -> sql
"Which assets have DSCR below 1.2?" -> sql

### Route: "python" (calculation-heavy)
Only use for questions needing iterative computation:
- "recalculate IRR" / "compute XIRR" -> python_fn: "xirr"
- "run the waterfall" -> python_fn: "waterfall"
- "what if cap rate is X" -> python_fn: "what_if_valuation"
- "Monte Carlo" / "simulate" -> python_fn: "monte_carlo"
- "DCF valuation" -> python_fn: "dcf"
- "capital account rollforward" -> python_fn: "rollforward"

## SQL generation rules

{catalog}

### Tenant isolation
Every query MUST filter by business_id.
- Tables with business_id column (acct_normalized_noi_monthly, re_asset_acct_quarter_rollup):
  Filter directly: WHERE business_id = %(business_id)s::uuid
- Other tables: JOIN to repe_fund f WHERE f.business_id = %(business_id)s::uuid
- Entity hierarchy: repe_fund -> repe_deal (via fund_id) -> repe_asset (via deal_id) -> repe_property_asset (via asset_id)

### Parameters
- Use %(business_id)s::uuid for business_id
- Use %(quarter)s for quarter
- NEVER hardcode UUIDs

### SQL rules
- SELECT only. No INSERT/UPDATE/DELETE.
- Use table aliases: f=repe_fund, d=repe_deal, a=repe_asset, pa=repe_property_asset
- LIMIT 500 unless user specified a count
- Order meaningfully (by name, quarter, amount DESC)
- For NOI by asset: use re_asset_quarter_state joined to repe_asset for names
- For fund returns: use re_authoritative_fund_state_qtr joined to repe_fund for names and filter to promotion_state = 'released'

## Output format (JSON only, no markdown, no explanation):
{{
  "route": "sql" or "python",
  "intent": "brief description",
  "entity_type": "fund" or "deal" or "asset" or "partner",
  "sql": "SELECT ... " or null (if python route),
  "python_fn": null or function name (if python route),
  "params": {{"quarter": "2025Q4" or null}}
}}"""


async def run_agent(
    prompt: str,
    *,
    business_id: str,
    quarter: str | None = None,
) -> AgentResult:
    """Single LLM call that classifies + generates SQL."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured")

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    system = _SYSTEM.format(catalog=catalog_text())

    user_msg = prompt
    if quarter:
        user_msg += f"\n\n(Current quarter: {quarter}, business_id will be provided as parameter)"

    create_kwargs = sanitize_params(
        OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=1024,
        temperature=0,
    )

    response = await asyncio.wait_for(
        client.chat.completions.create(**create_kwargs),
        timeout=30.0,
    )

    content = (response.choices[0].message.content or "{}").strip()
    # Strip markdown fences
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        logger.error("Agent returned non-JSON: %s", content[:300])
        raise ValueError(f"Agent returned non-JSON: {content[:100]}")

    return AgentResult(
        route=data.get("route", "sql"),
        intent=data.get("intent", ""),
        entity_type=data.get("entity_type", "asset"),
        sql=data.get("sql"),
        python_fn=data.get("python_fn"),
        params=data.get("params", {}),
    )


async def generate_sql(
    message: str,
    *,
    catalog: str,
    business_id: str,
    quarter: str | None = None,
) -> dict[str, Any]:
    """Generate SQL from a natural-language message using the combined agent.

    This is the entry point called from ai_gateway.py for the INTENT_ANALYTICS_QUERY
    fast-path lane.  It re-uses the existing LLM prompt in _SYSTEM but injects the
    caller-supplied catalog (which may include dynamic DB metadata from
    catalog_text_dynamic) instead of the static default.

    Returns a plain dict so callers can do result.get("sql", "").
    """
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured")

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    # Use the caller-supplied catalog (may be enriched with live DB metadata).
    system = _SYSTEM.format(catalog=catalog)

    user_msg = message
    if quarter:
        user_msg += f"\n\n(Current quarter: {quarter}, business_id will be provided as parameter)"

    create_kwargs = sanitize_params(
        OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=1024,
        temperature=0,
    )

    response = await asyncio.wait_for(
        client.chat.completions.create(**create_kwargs),
        timeout=30.0,
    )

    content = (response.choices[0].message.content or "{}").strip()
    # Strip markdown fences if the model wrapped the JSON in a code block
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data: dict[str, Any] = json.loads(content)
    except json.JSONDecodeError:
        logger.error("generate_sql: agent returned non-JSON: %s", content[:300])
        return {"sql": None, "route": "sql", "intent": "", "entity_type": "asset", "params": {}}

    logger.info(
        "generate_sql: route=%s entity=%s sql_len=%d",
        data.get("route"), data.get("entity_type"), len(data.get("sql") or ""),
    )
    return data
