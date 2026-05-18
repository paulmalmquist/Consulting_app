# Demo Lab / RAG / Pipeline / HITL

**Status:** Draft  
**Last updated:** 2026-05-16

## Purpose

Demo Lab is the AI pipeline and demonstration environment. It provides RAG (retrieval-augmented generation), document ingestion pipelines, human-in-the-loop (HITL) review workflows, audit logging, metrics, SQL agent, upload surfaces, and environment-scoped AI testing. It is used for both internal testing and client demonstrations of AI capabilities.

## Plan files

- [architecture.md](architecture.md) — Implementation map
- [roadmap.md](roadmap.md) — Phased delivery plan
- [backlog.md](backlog.md) — Active bugs and open work
- [qa-checklist.md](qa-checklist.md) — Verification steps
- [next-session.md](next-session.md) — Copy-paste-ready prompt for next session
- [release-readiness.md](release-readiness.md) — Release gate status

## Key existing docs

- `agents/lab-environment.md` — Lab environment agent
- `docs/AI_ARCHITECTURE_AND_WORKFLOWS.md` — AI architecture overview
- `docs/ai-testing/` — Latest AI test results
- `docs/ai-test-cases/` — Structured test fixtures
- `repo-c/` — Demo Lab backend (env-scoped schemas, RAG, HITL, audit, metrics)

## First recommended next session

Read `next-session.md`. Verify the document upload → RAG pipeline → chat query flow works end-to-end in a Demo Lab environment.
