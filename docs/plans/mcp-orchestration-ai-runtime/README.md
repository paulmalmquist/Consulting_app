# MCP / Orchestration / AI Runtime

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

This area covers the MCP (Model Context Protocol) registry, tool schemas, orchestration engine, AI gateway, prompt policy, model routing, assistant runtime, and governance. It is the infrastructure layer that powers Winston AI across all environments. Changes here affect every AI-enabled surface in the platform.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `docs/MCP_SETUP.md` — MCP setup guide
- `docs/PARTNER_MCP_SETUP.md` — Partner MCP setup
- `docs/AI_ARCHITECTURE_AND_WORKFLOWS.md` — AI architecture overview
- `docs/AI_USAGE_ATTRIBUTION_SERVICE.md` — Usage attribution
- `docs/AUTONOMOUS_RELIABILITY_PROTOCOL.md` — Reliability protocol
- `docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md` — State lock rules
- `agents/mcp.md` — MCP agent
- `agents/ai-copilot.md` — AI copilot agent
- `orchestration/` — Execution engine and policy files

## Critical note

This is a high-blast-radius area. Changes to the AI gateway, model routing, or MCP registry affect all environments simultaneously. Test in isolation before deploying.

## First recommended next session

Read `next-session.md`. Start with a health check of the AI gateway and a review of active MCP tools.
