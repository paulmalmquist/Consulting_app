# MCP / Orchestration / AI Runtime — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Model routing currency** — `orchestration/model_routing_rules.json` — Verify this file references current Claude 4.x model IDs (claude-sonnet-4-6, claude-haiku-4-5-20251001, claude-opus-4-7). Update any stale model IDs.
- [ ] **AI gateway health** — `backend/app/routes/ai_gateway.py` — Run health check and verify it returns healthy with correct model availability.

## UX improvements
- [ ] **AI usage dashboard** — `/lab/system/ai-usage` — Verify this shows call counts, costs, and attribution by environment. Report any empty or missing data.
- [ ] **Prompt health dashboard** — `/api/admin/ai/prompt-health` — Verify this endpoint returns pass/fail data for registered prompts.

## Backend / API
- [ ] **MCP tool inventory** — `backend/app/mcp/tools/` — List all registered MCP tools and their status (active/experimental).
- [ ] **Prompt policy** — `backend/app/services/ai_usage_rules.py` — Document what usage rules are enforced and how.
- [ ] **OpenClaw status** — `orchestration/openclaw/` — Determine if this is active in production or experimental.

## Data / migrations
- [ ] **AI usage attribution table** — Identify the Supabase table for AI usage records and confirm it has env_id.

## Tests
- [ ] **Run AI test suite** — `docs/ai-test-cases/` — Execute and report pass/fail.
- [ ] **Gateway latency baseline** — No known latency benchmarks. Establish baseline.

## Documentation
- [ ] **MCP tool catalog** — No known complete list of all registered MCP tools. Create one in architecture.md.

## Nice-to-have
- [ ] Cost-per-query dashboard
- [ ] Automatic prompt regression testing on deploy

## Completed
_(none yet)_
