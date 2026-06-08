# Next Session — Novendor CRM / Accounting

**Last updated:** 2026-05-19
**Priority:** High — this is Novendor's internal operating system

## Copy-paste prompt for next Claude Code session (Ticket 8 — deliberate design pass)

Tickets 1–7 are **done and production-verified**, plus Ticket 7B (a consulting-router
pool-exhaustion incident, fixed 2026-05-21). The full Operator Control Plane chain is
live and stable: schema (Ticket 3) → read/display grouping (Ticket 4) → write-path
(Ticket 5) → generated Morning Brief (Ticket 6) → read-only Brief Assistant retrieval
(Ticket 7). Production smoke green: `/brief-assistant/ask` returns grounded answers;
the board returns 200 in ~1.4s and survives 15 concurrent requests without hanging.

This session is **Ticket 8 — a design pass, not implementation.** Do NOT auto-start
coding.

### Ticket 8 — deliberate scope decision, do NOT auto-start
Ticket 7 shipped a read-only retrieval surface. Ticket 8 would add the **write-path**
through the assistant: lets a user say "move the NCF task to today" or "create a coding
task to fix the X bug" and have it execute. **This re-introduces the risky-action surface
the entire ticket chain has deliberately avoided.** Before any code, do a scoping pass:

```
Decide whether Ticket 8 (assistant-driven task creation/editing) is worth
adding now, and if yes, design the gating BEFORE writing code:

Questions to answer first:
1. Does the assistant create tasks, or only edit existing ones, or both?
   (Recommend edit-only as a smaller, safer slice — the hierarchy
   write-path from Ticket 5 already validates server-side.)
2. What's the confirmation flow? (Recommend: every write goes through a
   confirmation drawer or explicit "Confirm" affordance — never silent.)
3. Where does intent-confidence get measured? (Below threshold → ask
   for clarification, not commit.)
4. How are write tools wired? (Reuse the existing tool-use policy from
   `docs/plans/01-shared-standards/ai-runtime/tool-use-policy.md` —
   don't invent a parallel one.)
5. What's the audit trail? (Likely reuse cro_execution_task.updated_at
   + an `evidence` jsonb entry — no new table.)
6. What's the rollback path if the assistant gets it wrong?

Only after these are answered does code start. Most likely shape:
brief_assistant.answer() grows a `mode: "preview"|"execute"` flag;
"execute" routes through update_task with `_*_set` sentinels and the
same validate_hierarchy fail-closed path; the chat UI shows a confirm
modal before the execute call. No new write tools at the gateway
level — the brief assistant remains the single read+write surface for
the consulting board.

Do NOT in Ticket 8 (regardless of design):
- bypass validate_hierarchy
- silently overwrite existing fields the user didn't mention
- add tools to the broad /api/ai/gateway/ask runtime
- change the schema (10003 columns suffice)
- fabricate task ids or pretend a missing task exists
```

Read first if you start Ticket 8 design:
`docs/plans/03-implementation-plans/active/0002-novendor-daily-operator-control-plane.md`
(Ticket 7 result), `docs/plans/01-shared-standards/ai-runtime/{tool-use-policy,fail-closed-rules,prompt-contracts}.md`,
`backend/app/services/brief_assistant.py` (the read-only baseline),
`backend/app/services/execution_tasks.py` (`update_task` + `validate_hierarchy`).

Repo Guardrails `1000` / repo-wide Backend Lint reds remain pre-existing baseline
(tips #18) — do not chase. Deploy parity rule (tips #18) still applies — Vercel and
Railway have no auto-deploy.

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
