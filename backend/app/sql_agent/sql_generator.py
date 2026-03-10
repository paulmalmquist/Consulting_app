"""SQL generator — LLM writes a safe SELECT from natural language + catalog.

The generated SQL is ALWAYS validated before execution.
"""
from __future__ import annotations

import asyncio
import logging

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.services.model_registry import sanitize_params
from app.sql_agent.catalog import catalog_text
from app.sql_agent.router import RoutingPlan

logger = logging.getLogger(__name__)


_SQL_SYSTEM = """You are a read-only SQL agent for a real estate private equity (REPE) database.
Generate a single PostgreSQL SELECT query. Never INSERT, UPDATE, DELETE, DROP, or TRUNCATE.

## Tenant scoping
Every query MUST filter by business_id. The hierarchy is:
  repe_fund.business_id = %(business_id)s
  repe_deal -> repe_fund via deal.fund_id
  repe_asset -> repe_deal via asset.deal_id
  repe_property_asset -> repe_asset via property_asset.asset_id
  re_loan -> repe_asset via loan.asset_id
  acct_statement_line -> entity_id (join to asset/deal via hierarchy)
  re_asset_quarter_state -> asset_id (join to repe_asset -> repe_deal -> repe_fund)
  re_fund_quarter_state -> fund_id (join to repe_fund)
  re_fund_metrics_qtr -> fund_id (join to repe_fund)
  re_partner_quarter_metrics -> partner_id (join to re_partner -> repe_fund)

Always use %(business_id)s as the parameter placeholder for business_id.
If a quarter is relevant, use %(quarter)s.
NEVER use hardcoded UUIDs — always use parameter placeholders.

{catalog}

## Rules
- Return SQL ONLY. No markdown, no explanation, no comments.
- Always JOIN to repe_fund and filter WHERE f.business_id = %(business_id)s
- Use table aliases (f for repe_fund, d for repe_deal, a for repe_asset, etc.)
- LIMIT 500 unless the user asked for a specific count
- Order results meaningfully (by name, quarter, amount DESC, etc.)
- For quarter filters, use %(quarter)s parameter
- For statement line queries, use line_code IN (...) with specific codes
- Cast UUIDs: %(business_id)s::uuid
"""


async def generate_sql(
    plan: RoutingPlan,
    prompt: str,
    *,
    business_id: str,
    quarter: str | None = None,
) -> str:
    """Generate a SQL query from a routing plan and user prompt."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured")

    import openai

    client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

    system = _SQL_SYSTEM.format(catalog=catalog_text())

    user_msg = f"User question: {prompt}\n\nRouting: entity_type={plan.entity_type}, intent={plan.intent}"
    if quarter:
        user_msg += f"\nCurrent quarter: {quarter}"
    if plan.params:
        user_msg += f"\nExtracted params: {plan.params}"

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
        timeout=20.0,
    )

    sql = (response.choices[0].message.content or "").strip()

    # Strip markdown fences
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    logger.info("Generated SQL (%d chars) for: %s", len(sql), prompt[:80])
    return sql
