# Feature: Context-Aware Delegation Engine

## Priority: 9/10
## Complexity: Medium-High
## Source: Manual observation — ECC messy day queue (2026-03-22)

## The Problem

The Executive Command Center's "Delegate" button currently does nothing meaningful. When a CEO or managing partner is triaging their messy day queue — VIP emails, red alerts, approvals, overdue payables — they hit "Delegate" and... nothing happens with context. The person receiving the delegation has to start from scratch: re-read the thread, look up the LP, find the relevant docs, figure out what's already been promised.

This is exactly the workflow that kills firms. The context gets lost in the handoff. The associate emails the LP without knowing the partner already promised something different on a call last week.

## The Vision

When you hit "Delegate" on any queue item, Winston should:

1. **Know who can handle it.** Pull from the actor/role table — who owns this relationship, who has authority for this dollar amount, who's available (calendar integration). Suggest the right person, not just anyone.

2. **Assemble full context automatically.** For the item being delegated, gather:
   - All prior messages/threads with this contact (ai_conversations, ai_messages)
   - Related documents (attachments, contracts, proposals)
   - Fund/entity context (which fund, what vintage, current NAV, recent activity)
   - Recent decisions and commitments (ai_decision_audit_log)
   - Capital call/distribution history if relevant
   - Any SLA or deadline context
   - Notes from the CRM or lead record

3. **Draft the delegation brief.** Not just "handle this" — a structured handoff:
   - "Evelyn Price (VIP 3, Board Partners) needs capital call timing before the board meeting Monday"
   - "She's asking about the $250K LP wire for IGF-VII"
   - "Last interaction: Richard spoke with her Feb 28, confirmed Q1 call schedule"
   - "The wire is pending — ops confirmed it clears by Thursday"
   - "Suggested response: Confirm timing, reference the Q1 schedule Richard discussed"

4. **Push the task forward.** The delegate doesn't just get a notification — they get a pre-drafted response they can edit and send, with all supporting data linked. One click to review, one click to send.

5. **Track the handoff.** The delegator sees status: delegated → in progress → resolved. If the delegate doesn't act within the SLA window, it escalates back.

## Data Sources Already Available

| Source | Table/Service | What it provides |
|---|---|---|
| Contact history | ai_conversations, ai_messages | Full thread context |
| Decisions & commitments | ai_decision_audit_log | What's been promised |
| People & roles | actor, actor_role | Who can handle what |
| Fund context | fund, investment, asset_metrics_qtr | Portfolio data for the item |
| Capital activity | capital_call, distribution | LP money movement |
| Documents | attachment, cc_corpus_document | Related files |
| SLA tracking | ecc_queue_item (or equivalent) | Deadlines and urgency |
| Calendar | Google Calendar MCP | Availability of delegate |

## Implementation Approach

### Phase 1: Context Assembly (Backend)
- New service: `backend/app/services/delegation_engine.py`
- Given a queue item, assemble all related context into a structured brief
- Query across conversations, documents, fund data, actor roles
- Use the AI gateway to generate a natural-language delegation summary

### Phase 2: Smart Delegate Picker (Backend + Frontend)
- Suggest delegates based on: role (who owns this relationship), authority level (dollar thresholds), availability (calendar), workload (current queue depth)
- Show suggested delegates ranked with reasoning

### Phase 3: Pre-Drafted Response (AI Gateway)
- Use Winston AI to draft a response the delegate can edit
- Include all assembled context as RAG input
- The delegate sees: context brief + draft response + supporting docs + send button

### Phase 4: Handoff Tracking (Frontend)
- Delegation status widget: delegated → acknowledged → in progress → resolved
- SLA escalation if delegate doesn't act
- Delegator dashboard showing all outstanding delegations

## Why This Matters for Sales

This is the feature that makes Winston irreplaceable. Every REPE firm has this problem — the managing partner triages in the morning, delegates to associates, and context gets lost. If Winston makes delegation seamless with full context, it becomes the operating system they can't turn off.

The moat: competitors (Yardi, Juniper Square) don't have conversational AI + document context + fund data in one place. They can't do context-aware delegation because they don't have the unified data layer.

## Competitive Position

- **Yardi:** No queue-based triage, no AI delegation
- **Juniper Square:** Investor portal only, no operational triage
- **Dealpath:** Deal pipeline, not operational workflow
- **None of them** combine AI context assembly + role-based routing + pre-drafted responses

## Demo Script

"Watch what happens when the CEO hits Delegate on this VIP alert. Winston knows Evelyn Price is a Board Partners LP in Fund VII, knows Richard spoke with her last week about capital call timing, knows the wire is pending, and drafts a response for the associate — with all that context pre-loaded. The associate reviews, edits one line, and sends. Total time: thirty seconds. Without Winston, that's a twenty-minute email chain where someone inevitably drops context."

## Files to Touch

- `backend/app/services/delegation_engine.py` (new)
- `backend/app/routes/ecc.py` (add delegation endpoints)
- `repo-b/src/app/lab/env/[envId]/ecc/` (delegate UI)
- `backend/app/services/ai_gateway.py` (context assembly for delegation brief)
- `repo-b/db/schema/` (delegation tracking table)

## Tags

`ecc` `delegation` `context-assembly` `workflow` `high-moat` `demo-ready`
