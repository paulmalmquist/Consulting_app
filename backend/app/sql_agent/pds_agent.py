"""PDS-specific combined query agent — routes and generates SQL for PDS analytics tables.

Mirrors combined_agent.py but uses PDS-specific system prompt, business glossary,
and few-shot examples. All queries are SQL-only (no Python route for PDS).
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL_STANDARD
from app.services.model_registry import sanitize_params
from app.sql_agent.catalog import pds_catalog_text

logger = logging.getLogger(__name__)


@dataclass
class PdsAgentResult:
    intent: str
    sql: str
    chart_suggestion: dict[str, Any] | None = None
    params: dict[str, Any] = field(default_factory=dict)


_PDS_SYSTEM = """You are a SQL query agent for the PDS (Project & Development Services) analytics platform.
Given a user's natural language question about PDS data, generate a SELECT query.

## Business Glossary
- **NPS (Net Promoter Score)**: %Promoters (score 9-10) minus %Detractors (score 0-6). CRE benchmark: +28.
- **Governance Track**: "variable" = project-based, fee-per-project. "dedicated" = retainer/portfolio-based.
- **ASC 606**: Revenue recognition standard. Revenue types: recognized, billed, unbilled, deferred, backlog.
- **6+6 Forecast**: First 6 months actuals + last 6 months forecast. Similarly 3+9 and 9+3.
- **Utilization**: Billable hours / available hours. Industry benchmark 68.9%%, firm target 75%%.
- **DAU/MAU**: Daily active users / Monthly active users. SaaS benchmark: 13%% low, 25%% avg, 40%% excellent.
- **EVM**: Earned Value Management. CPI = EV/AC (cost performance), SPI = EV/PV (schedule performance).
- **RAG**: Red/Amber/Green status. Green = within 5%% of target, Amber = 5-15%% below, Red = >15%% below.
- **Tier**: Enterprise (largest), Mid-Market, SMB (smallest).

## Schema

{catalog}

## SQL Generation Rules

### Tenant isolation (CRITICAL)
Every query MUST filter by BOTH env_id AND business_id:
  WHERE table.env_id = %(env_id)s::uuid AND table.business_id = %(business_id)s::uuid

### Parameters
- Use %(env_id)s::uuid for env_id
- Use %(business_id)s::uuid for business_id
- NEVER hardcode UUIDs

### Rules
- SELECT only. No INSERT/UPDATE/DELETE.
- LIMIT 1000 unless user specified a count
- Order meaningfully (by name, period, amount DESC)
- Use table aliases: a=pds_accounts, p=pds_analytics_projects, r=pds_revenue_entries, e=pds_analytics_employees, t=pds_analytics_timecards, asgn=pds_analytics_assignments, n=pds_nps_responses, tech=pds_technology_adoption
- Prefer views (v_pds_*) when they match the question — they pre-join and aggregate
- For NPS calculations: Promoters = nps_score >= 9, Passives = 7-8, Detractors = 0-6

## Few-shot examples

Q: "What's our firm-wide utilization this quarter?"
SQL: SELECT period, AVG(utilization_pct) AS avg_utilization FROM v_pds_utilization_monthly WHERE env_id = %(env_id)s::uuid AND business_id = %(business_id)s::uuid AND period >= date_trunc('quarter', CURRENT_DATE)::date GROUP BY period ORDER BY period

Q: "Show revenue by service line, budget vs actual"
SQL: SELECT p.service_line_key, SUM(r.recognized_revenue) FILTER (WHERE r.version = 'actual') AS actual, SUM(r.recognized_revenue) FILTER (WHERE r.version = 'budget') AS budget FROM pds_revenue_entries r JOIN pds_analytics_projects p ON p.project_id = r.project_id AND p.env_id = r.env_id AND p.business_id = r.business_id WHERE r.env_id = %(env_id)s::uuid AND r.business_id = %(business_id)s::uuid GROUP BY p.service_line_key ORDER BY actual DESC NULLS LAST LIMIT 1000

Q: "Which accounts have NPS below 20?"
SQL: SELECT account_id, quarter, nps_score, total_responses FROM v_pds_nps_summary WHERE env_id = %(env_id)s::uuid AND business_id = %(business_id)s::uuid AND nps_score < 20 ORDER BY nps_score LIMIT 1000

Q: "Show me adoption rates for INGENIOUS.BUILD"
SQL: SELECT tech.period, tech.active_users, tech.licensed_users, ROUND(tech.active_users::numeric / NULLIF(tech.licensed_users, 0) * 100, 1) AS adoption_rate_pct FROM pds_technology_adoption tech WHERE tech.env_id = %(env_id)s::uuid AND tech.business_id = %(business_id)s::uuid AND tech.tool_name = 'INGENIOUS.BUILD' ORDER BY tech.period LIMIT 1000

Q: "Top 10 accounts by revenue with their health status"
SQL: SELECT account_name, tier, governance_track, ytd_revenue, avg_margin, latest_nps, nps_health, margin_health FROM v_pds_account_health WHERE env_id = %(env_id)s::uuid AND business_id = %(business_id)s::uuid ORDER BY ytd_revenue DESC NULLS LAST LIMIT 10

Q: "Utilization heatmap for Northeast region"
SQL: SELECT full_name, role_level, period, utilization_pct FROM v_pds_utilization_monthly WHERE env_id = %(env_id)s::uuid AND business_id = %(business_id)s::uuid AND region = 'Northeast & Canada' ORDER BY full_name, period LIMIT 1000

Q: "Which employees are on the bench?"
SQL: SELECT e.full_name, e.role_level, e.region, COALESCE(SUM(asgn.allocation_pct), 0) AS total_allocation FROM pds_analytics_employees e LEFT JOIN pds_analytics_assignments asgn ON asgn.employee_id = e.employee_id AND asgn.env_id = e.env_id AND asgn.business_id = e.business_id AND (asgn.end_date IS NULL OR asgn.end_date >= CURRENT_DATE) WHERE e.env_id = %(env_id)s::uuid AND e.business_id = %(business_id)s::uuid AND e.is_active = true GROUP BY e.employee_id, e.full_name, e.role_level, e.region HAVING COALESCE(SUM(asgn.allocation_pct), 0) < 50 ORDER BY total_allocation LIMIT 1000

## Chart suggestion
After generating SQL, also suggest a chart type based on the result shape:
- Date column + numeric → {{"type": "line", "x": "date_col", "y": "numeric_col"}}
- Category + numeric → {{"type": "bar", "x": "category_col", "y": "numeric_col"}}
- Two numerics + category → {{"type": "scatter", "x": "col1", "y": "col2", "label": "category_col"}}
- Single numeric with parts → {{"type": "donut", "values": "col", "labels": "category_col"}} (max 7 slices)
- No clear pattern → null

## Output format (JSON only, no markdown):
{{
  "intent": "brief description of what the query answers",
  "sql": "SELECT ...",
  "chart_suggestion": {{...}} or null
}}"""


async def run_pds_agent(
    question: str,
    *,
    env_id: str,
    business_id: str,
) -> PdsAgentResult:
    """Single LLM call that generates SQL for PDS analytics queries."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY not configured")

    from app.services.ai_client import get_instrumented_client
    from app.services.gateway_audit import log_ai_call

    client = get_instrumented_client()

    system = _PDS_SYSTEM.format(catalog=pds_catalog_text())

    create_kwargs = sanitize_params(
        OPENAI_CHAT_MODEL_STANDARD,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": question},
        ],
        max_tokens=1024,
        temperature=0,
    )

    with log_ai_call(service="pds_agent", model=OPENAI_CHAT_MODEL_STANDARD, env_id=env_id, business_id=business_id) as audit:
        response = await asyncio.wait_for(
            client.chat.completions.create(**create_kwargs),
            timeout=30.0,
        )
        if response.usage:
            audit.record(prompt_tokens=response.usage.prompt_tokens, completion_tokens=response.usage.completion_tokens)

    content = (response.choices[0].message.content or "{}").strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        logger.error("PDS agent returned non-JSON: %s", content[:300])
        raise ValueError(f"PDS agent returned non-JSON: {content[:100]}")

    return PdsAgentResult(
        intent=data.get("intent", ""),
        sql=data.get("sql", ""),
        chart_suggestion=data.get("chart_suggestion"),
    )
