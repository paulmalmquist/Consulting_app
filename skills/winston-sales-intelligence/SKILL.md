---
id: winston-sales-intelligence
kind: skill
status: active
source_of_truth: true
topic: sales-intelligence
owners:
  - docs
  - cross-repo
intent_tags:
  - ops
  - outreach
  - crm
triggers:
  - prospect lookup
  - is [company] in winston
  - add to CRM
  - find contact
  - look up [person]
  - add prospect
  - track outreach
  - log outreach
  - sales intelligence
  - who have we contacted
  - what's the status on [company]
  - is [company] in Apollo
  - CRM lookup
  - prospect enrichment
  - contact record
entrypoint: true
handoff_to:
  - novendor-outreach
  - novendor-operations
when_to_use: "Use when the task involves finding, adding, updating, or tracking a prospect or contact in Winston's Supabase CRM. Covers lookups, enrichment, INSERT, outreach logging, and stage updates."
when_not_to_use: "Do not use for writing the outreach message itself — hand off to novendor-outreach once the contact record is confirmed. Do not use for REPE product work."
surface_paths:
  - docs/sales-signals/
  - docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md
name: winston-sales-intelligence
description: "CRM lookup, prospect research, and outreach tracking for Novendor. Winston's Supabase database is the CRM. Covers the full workflow: check nv_accounts → web research → INSERT account/contact/pain points → log trigger signal → log outreach → update engagement stage."
---

# Winston Sales Intelligence

Use this skill for any CRM or prospect task. Winston's Supabase database (`nv_accounts`, `nv_account_contacts`, `cro_*` tables) is the authoritative CRM.

## Load Order

- `../../docs/WINSTON_SALES_INTELLIGENCE_PROMPT.md` — canonical SQL templates, table schemas, engagement stage definitions, guardrails
- `../../agents/outreach.md` — when the request moves to drafting the outreach message after the contact is confirmed

## Workflow Steps

1. **Check** — query `nv_accounts` first. If found: show record and ask how to proceed.
2. **Research** — run 2–3 targeted web searches (leadership, news/funding, LinkedIn).
3. **Insert account** — `nv_accounts` with `engagement_stage`, `pain_summary`, `env_id`/`business_id` from session.
4. **Insert contact** — `nv_account_contacts` linked to the account.
5. **Log pain points** — `nv_pain_points` per finding (category, severity, affected_systems).
6. **Log trigger signal** — `cro_trigger_signal` with `trigger_type` and `source_url`.
7. **Log outreach** — `cro_outreach_log` when a draft is queued or sent; update `engagement_stage` to `contacted`.
8. **Update on reply/meeting** — `nv_accounts.engagement_stage` + `cro_outreach_log.replied_at`.

## Operator Rules

- Always INSERT account before contacts before pain points (FK order).
- Never fabricate a contact. If email cannot be confirmed, set `email = null`.
- `engagement_stage` must be updated after every action — it is the pipeline.
- Use `nv_*` and `cro_*` tables for Novendor outreach — not `crm_account`/`crm_contact` (those are demo data).
- Resolve `env_id` and `business_id` from session context before inserting.

## Prompt Lessons

- The most common failure mode was inserting without first checking — always check `nv_accounts` first.
- Pain points logged at INSERT time (not later) are far more useful for follow-up context.
- Trigger type taxonomy matters: `new_fund`, `funding`, `hiring_signal`, `competitor_switch`, `ilpa_compliance`, `operational_scaling`, `content_signal`, `inbound`.

## Exit Condition

- Account row exists with correct `engagement_stage`.
- At least one contact row exists.
- At least one pain point or trigger signal logged.
- Outreach log row added when a message was drafted or sent.
- Hand off to `agents/outreach.md` if drafting the message is also needed.
