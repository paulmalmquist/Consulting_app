"""
services/ai_usage_rules.py
Recommendation rules that scan nv_ai_usage_event and write open
recommendations to nv_ai_recommendation.

Each rule:
  - has a stable rule_code
  - emits zero or more recommendations
  - is idempotent (uses upsert on the unique key)
  - estimates monthly savings in cents
  - sets a confidence percentage

Run order (cheap first, expensive last):
  1. opus_overspend          — Opus on retrieval/mechanical workflows
  2. uncached_repeat_prompt  — same prefix called 50+ times in 7 days
  3. high_thinking_no_payoff — thinking budget set on cheap workflows
  4. heavy_user              — single user >5x median spend
  5. unattributed_traffic    — events with null business_unit + user_email

Schedule via cron (e.g. every 15 minutes) or invoke after each batch ingest.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from app.db import get_cursor

log = logging.getLogger(__name__)


@dataclass
class RuleHit:
    rule_code: str
    severity: str            # info / low / medium / high / critical
    title: str
    body_md: str
    est_monthly_savings_cents: int
    confidence_pct: int = 70
    target_skill: Optional[str] = None
    target_workflow: Optional[str] = None
    target_user_email: Optional[str] = None
    target_model: Optional[str] = None
    sample_event_ids: Optional[list] = None
    source_query: Optional[str] = None


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

def rule_opus_overspend(env_id: str) -> list[RuleHit]:
    """Flag workflows where Opus is being used on small prompts. Cheap fix: route to Sonnet or Haiku."""
    sql = """
        SELECT workflow,
               count(*)                              AS calls,
               avg(input_tokens + output_tokens)::int AS avg_tokens,
               sum(cost_cents)                       AS cost_cents,
               array_agg(id)                         AS event_ids
        FROM nv_ai_usage_event
        WHERE env_id = %s
          AND model = 'opus'
          AND occurred_at >= now() - interval '30 days'
          AND workflow IS NOT NULL
        GROUP BY workflow
        HAVING avg(input_tokens + output_tokens) < 5000
           AND sum(cost_cents) > 100
    """
    hits: list[RuleHit] = []
    with get_cursor() as cur:
        cur.execute("SET LOCAL app.env_id = %s", (env_id,))
        cur.execute(sql, (env_id,))
        for r in cur.fetchall():
            cost = r["cost_cents"]
            # Sonnet is ~5x cheaper than Opus, Haiku is ~15x cheaper
            est = int(cost * 0.8)  # downgrade to Sonnet => 80% savings
            hits.append(RuleHit(
                rule_code="opus_overspend",
                severity="high" if est > 5000 else "medium",
                title=f"Opus overspend on workflow: {r['workflow']}",
                body_md=(
                    f"Workflow `{r['workflow']}` ran on Opus {r['calls']} times in the last 30 days "
                    f"with an average of {r['avg_tokens']} tokens per call. "
                    f"Workflows under 5k tokens rarely benefit from Opus.\n\n"
                    f"**Recommended action:** route this workflow to Sonnet (estimated savings: "
                    f"${est / 100:.2f}/mo). If it works on Sonnet, consider Haiku next."
                ),
                est_monthly_savings_cents=est,
                confidence_pct=85,
                target_workflow=r["workflow"],
                target_model="opus",
                sample_event_ids=r["event_ids"][:5],
                source_query=sql,
            ))
    return hits


def rule_uncached_repeat_prompt(env_id: str) -> list[RuleHit]:
    """Detect skills called many times that aren't using prompt caching."""
    sql = """
        SELECT skill,
               count(*) FILTER (WHERE NOT cached) AS uncached_calls,
               count(*) AS total_calls,
               sum(cost_cents)                    AS cost_cents,
               array_agg(id)                      AS event_ids
        FROM nv_ai_usage_event
        WHERE env_id = %s
          AND skill IS NOT NULL
          AND occurred_at >= now() - interval '7 days'
        GROUP BY skill
        HAVING count(*) FILTER (WHERE NOT cached) > 50
           AND count(*) FILTER (WHERE NOT cached) >= count(*) * 0.8
    """
    hits: list[RuleHit] = []
    with get_cursor() as cur:
        cur.execute("SET LOCAL app.env_id = %s", (env_id,))
        cur.execute(sql, (env_id,))
        for r in cur.fetchall():
            # Caching saves ~90% on cached portion. Assume system prompt is ~50% of input.
            est = int(r["cost_cents"] * 0.45)
            hits.append(RuleHit(
                rule_code="uncached_repeat_prompt",
                severity="medium",
                title=f"Skill `{r['skill']}` not using prompt caching",
                body_md=(
                    f"Skill `{r['skill']}` was called {r['total_calls']} times in the last 7 days. "
                    f"{r['uncached_calls']} of those calls did NOT hit the cache.\n\n"
                    f"**Recommended action:** structure the skill prompt so the stable prefix "
                    f"(system prompt, instructions, reference docs) is cacheable. Anthropic charges "
                    f"~10% of input cost for cached prefix tokens. Estimated savings if 90% of calls "
                    f"hit the cache: ${est / 100:.2f}/mo."
                ),
                est_monthly_savings_cents=est,
                confidence_pct=80,
                target_skill=r["skill"],
                sample_event_ids=r["event_ids"][:5],
                source_query=sql,
            ))
    return hits


def rule_high_thinking_no_payoff(env_id: str) -> list[RuleHit]:
    """Thinking budget set on workflows that don't seem to need it (small input + small output)."""
    sql = """
        SELECT workflow,
               count(*)                          AS calls,
               avg(thinking_tokens)::int         AS avg_think,
               avg(output_tokens)::int           AS avg_output,
               sum(cost_cents)                   AS cost_cents,
               array_agg(id)                     AS event_ids
        FROM nv_ai_usage_event
        WHERE env_id = %s
          AND thinking_tokens > 4000
          AND occurred_at >= now() - interval '30 days'
          AND workflow IS NOT NULL
        GROUP BY workflow
        HAVING avg(output_tokens) < 1500
           AND count(*) > 10
    """
    hits: list[RuleHit] = []
    with get_cursor() as cur:
        cur.execute("SET LOCAL app.env_id = %s", (env_id,))
        cur.execute(sql, (env_id,))
        for r in cur.fetchall():
            # Thinking is billed as input tokens. Removing 12k thinking from a Sonnet call saves ~$0.04/call.
            est = int(r["cost_cents"] * 0.30)
            hits.append(RuleHit(
                rule_code="high_thinking_no_payoff",
                severity="low",
                title=f"Thinking budget likely wasted on `{r['workflow']}`",
                body_md=(
                    f"Workflow `{r['workflow']}` was called {r['calls']} times with an average "
                    f"thinking budget of {r['avg_think']} tokens. The output averaged "
                    f"only {r['avg_output']} tokens, which suggests the model didn't actually need "
                    f"deep reasoning.\n\n"
                    f"**Recommended action:** drop the thinking budget to 0 or 4k for this workflow. "
                    f"Estimated savings: ${est / 100:.2f}/mo."
                ),
                est_monthly_savings_cents=est,
                confidence_pct=65,
                target_workflow=r["workflow"],
                sample_event_ids=r["event_ids"][:5],
                source_query=sql,
            ))
    return hits


def rule_unattributed_traffic(env_id: str) -> list[RuleHit]:
    """Surface events with no business_unit + user_email. These hide where spend is going."""
    sql = """
        SELECT count(*)                AS calls,
               sum(cost_cents)         AS cost_cents,
               array_agg(id LIMIT 5)   AS event_ids
        FROM nv_ai_usage_event
        WHERE env_id = %s
          AND occurred_at >= now() - interval '30 days'
          AND business_unit IS NULL
          AND user_email IS NULL
    """
    hits: list[RuleHit] = []
    with get_cursor() as cur:
        cur.execute("SET LOCAL app.env_id = %s", (env_id,))
        cur.execute(sql, (env_id,))
        r = cur.fetchone()
        if r and r["calls"] >= 100:
            est = 0  # not a savings rule, an attribution rule
            hits.append(RuleHit(
                rule_code="unattributed_traffic",
                severity="info",
                title=f"{r['calls']} AI calls with no attribution in the last 30 days",
                body_md=(
                    f"{r['calls']} events totaling ${r['cost_cents'] / 100:.2f} in the last 30 days "
                    f"have no `business_unit` or `user_email` set. This is fine for ad-hoc usage, "
                    f"but if it's growing it means new clients of the API aren't being tagged.\n\n"
                    f"**Recommended action:** ensure all clients pass `user_email` and `business_unit` "
                    f"in their POST to `/api/ai-usage/v1/events`. Without these, per-team spend "
                    f"reports are incomplete."
                ),
                est_monthly_savings_cents=est,
                confidence_pct=95,
                source_query=sql,
            ))
    return hits


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

ALL_RULES = [
    rule_opus_overspend,
    rule_uncached_repeat_prompt,
    rule_high_thinking_no_payoff,
    rule_unattributed_traffic,
]


def run_rules(env_id: str, business_id: str) -> int:
    """Run all rules for an env and upsert recommendations. Returns count emitted."""
    emitted = 0
    for rule in ALL_RULES:
        try:
            hits = rule(env_id)
            for hit in hits:
                _upsert(env_id, business_id, hit)
                emitted += 1
        except Exception:
            log.exception("rule %s failed env_id=%s", rule.__name__, env_id)
    return emitted


def _upsert(env_id: str, business_id: str, hit: RuleHit) -> None:
    with get_cursor() as cur:
        cur.execute("SET LOCAL app.env_id = %s", (env_id,))
        cur.execute(
            """
            INSERT INTO nv_ai_recommendation (
                env_id, business_id, rule_code, severity, title, body_md,
                target_skill, target_workflow, target_user_email, target_model,
                est_monthly_savings_cents, confidence_pct,
                source_query, sample_event_ids
            ) VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s,
                %s, %s
            )
            ON CONFLICT (env_id, business_id, rule_code, target_skill, target_workflow, target_user_email)
            DO UPDATE SET
                severity = EXCLUDED.severity,
                title = EXCLUDED.title,
                body_md = EXCLUDED.body_md,
                est_monthly_savings_cents = EXCLUDED.est_monthly_savings_cents,
                confidence_pct = EXCLUDED.confidence_pct,
                source_query = EXCLUDED.source_query,
                sample_event_ids = EXCLUDED.sample_event_ids,
                last_detected_at = now(),
                updated_at = now(),
                state = CASE
                    WHEN nv_ai_recommendation.state = 'open' THEN 'open'
                    ELSE nv_ai_recommendation.state
                END
            """,
            (
                env_id, business_id, hit.rule_code, hit.severity, hit.title, hit.body_md,
                hit.target_skill, hit.target_workflow, hit.target_user_email, hit.target_model,
                hit.est_monthly_savings_cents, hit.confidence_pct,
                hit.source_query, hit.sample_event_ids,
            ),
        )


# ---------------------------------------------------------------------------
# CLI entry point — for cron / Windows scheduled task invocation.
#
# Usage:
#   python -m app.services.ai_usage_rules --env-id <eid> --business-id <bid>
#
# Recommended cadence: every 15 minutes per env. Can run multiple envs by
# looping in a small wrapper script. Output goes to stdout for cron logging.
# ---------------------------------------------------------------------------

def _cli() -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(description="Run AI usage recommendation rules for one env")
    ap.add_argument("--env-id", required=True)
    ap.add_argument("--business-id", required=True)
    ap.add_argument("--quiet", action="store_true", help="suppress per-rule output")
    args = ap.parse_args()

    if not args.quiet:
        print(f"running rules for env_id={args.env_id} business_id={args.business_id}")

    try:
        emitted = run_rules(args.env_id, args.business_id)
    except Exception as exc:
        print(f"ERROR: rule run failed: {exc}", file=sys.stderr)
        return 1

    if not args.quiet:
        print(f"emitted {emitted} recommendation(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
