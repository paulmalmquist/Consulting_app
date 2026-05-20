# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 7 — assistant/CoWork retrieval over the brief)

Tickets 1–6 are DONE & production-verified. Full Operator Control Plane chain works live:
schema (Ticket 3) → read/display grouping (Ticket 4) → write-path (Ticket 5) → generated
Morning Brief (Ticket 6). The live FlowYorker task surfaces under Website / content moves;
grounded suggested prompts (`what_first`, `flowyorker`) are displayed but **do not execute
anything yet**. This session wires Workstream H: a Novendor copilot/assistant retrieval
path that answers natural-language questions over the **real board state** the brief
already exposes.

Read first: `docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`
(Ticket 6 result + Workstream H spec), `docs/plans/novendor-crm-accounting/{architecture,backlog}.md`,
`docs/plans/01-shared-standards/ai-runtime/{ai-runtime-charter,fail-closed-rules,prompt-contracts,tool-use-policy}.md`,
`docs/plans/01-shared-standards/ai-runtime/canonical-event-contract.md`,
`backend/app/services/morning_checklist.py` (read source),
`backend/app/services/execution_tasks.py` (`list_tasks`),
`backend/app/services/nv_ai_copilot.py` + `backend/app/routes/nv_ai_copilot.py`
(existing Novendor copilot — extend, don't fork),
`repo-b/src/components/consulting/execution/MorningBriefPanel.tsx`
(where the suggested-prompt CTAs live today — they're inert).

```
Wire the Morning Brief's suggested prompts to actually run against the
existing Novendor AI copilot path. Read-only retrieval from real task data;
no writes from the assistant in this ticket.

Backend:
- Add a small retrieval helper that the copilot can call to ground its
  answers in the live board + brief. Reuse build_morning_checklist and
  list_tasks — do NOT duplicate ranking/priority logic.
- Map the four canonical questions ("what should I do this morning?",
  "show FlowYorker tasks", "what outreach is overdue?", "what coding
  ticket is next?") to deterministic slices of the brief/board data;
  the LLM composes the prose, the data layer guarantees the facts.
- Fail closed: if env/business context can't be resolved, the assistant
  returns a clean refusal, not a fabricated answer. Match the existing
  Novendor copilot fail-closed pattern + canonical event contract.
- No write tools added in this ticket. Risky writes remain gated.

Frontend:
- Make each suggested prompt in MorningBriefPanel clickable; clicking
  routes the prompt through the existing copilot UI (or opens it with
  the prompt pre-populated). No new chat surface here.
- Dark operator shell preserved; no new left-nav item.
- If the copilot returns a refusal, surface it honestly — do not
  re-prompt or fall back to a fabricated reply.

Do NOT: persist conversation history into the brief itself, add write
tools, change the schema, touch app.task_*/nv_tasks, alter unrelated
environments. The brief stays read-only and grounded.
```

Verification: backend route tests (new retrieval helper + at least one
canonical-question end-to-end test with mocked LLM), CI Frontend Typecheck
(fresh worktree → no node_modules, tips #20), prod smoke that clicking a
suggested prompt routes to the copilot and the copilot's answer references
real task data (no fabrication; cite the task_id when feasible). Fresh
`git worktree` off `origin/main`. Deploy BOTH backend + frontend; the
copilot path may already be live but the brief wiring is new. Repo
Guardrails `1000` + repo-wide Backend Lint reds are documented baseline
(tips #18) — do not chase.

Update dispatch `0002`, `backlog.md`, `next-session.md`, `docs/tips.md`.

## Deferred (older session — Accounting Command Desk verification)

Still open, lower priority than the control-plane buildout. Verify ECC receipt ingestion
end-to-end (`backend/app/routes/nv_receipt_intake.py`, `backend/app/services/nv_accounting_queue.py`,
`repo-b/src/app/lab/env/[envId]/ecc/`), confirm CRM/accounting table names + RLS, trace one
receipt to the approval surface. Tests: `cd backend && python -m pytest tests/ -k "nv or accounting or receipt" -v`.

## Context notes
- The Accounting Command Desk design handoff is in `design_handoff_accounting_command_desk/` — read it for intended UX before tracing implementation
- Apollo MCP tools are available for CRM enrichment
- Gmail MCP tools are available for inbound lead signals
- The `skills/novendor-crm-supabase/SKILL.md` skill handles direct CRM CRUD via Supabase
