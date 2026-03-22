# Winston Feature Comparison vs Juniper Square — 2026-03-19

| Feature | Classification | Winston Gap | Effort |
|---|---|---|---|
| AI CRM for Investor Relations | Major build | Winston has no CRM module; no LP contact management, no relationship tracking, no IR workflow | 3+ weeks |
| Email/Calendar sync to CRM (Google + Microsoft OAuth) | Major build | No GP-LP communication ingestion exists; no email/calendar data layer | 3+ weeks |
| JunieAI: LP subscription document extraction + validation | Moderate build | Document pipeline exists for asset docs; missing investor onboarding doc automation specifically | 1-2 weeks |
| JunieAI: DDQ response drafting | Easy build | Winston already has RAG over documents + AI drafting; DDQ template + prompt engineering needed | 1-3 days |
| JunieAI: Meeting note summarization + next-action extraction | Easy build | Winston chat workspace can do this today; needs formalized meeting-note ingest workflow | 1-2 days |
| JunieAI: LP email drafting | Already in Winston | Winston can draft investor communications from context; needs formal IR email template module | ~0 days (prompt) |
| JunieAI: Quarterly report compilation | Partial | Winston has LP Summary, capital account snapshots, P&L; needs automated report assembly triggered by close date | 3-5 days |
| Waterfall calculation automation | Already in Winston | Winston has LP/waterfall calculations and capital account snapshots; full parity | — |
| Capital call automation (notice generation + payment file) | Partial | Winston calculates called capital; missing notice PDF generation, payment batch file, investor notification | 3-5 days |
| Distribution payment automation | Partial | Waterfall calculation exists; missing distribution notice generation and notification workflow | 3-5 days |
| Nasdaq eVestment LP prospect database integration | Major build | No investor discovery capability; no LP prospect sourcing | 3+ weeks |
| AML/KYC compliance workflow | Major build | No compliance workflow module exists | 3+ weeks |
| Investor portal (LP self-service) | Moderate build | Winston has LP Summary reporting; no dedicated LP-facing portal with self-service login and document access | 1-2 weeks |
| Data rooms (secure document sharing) | Moderate build | No deal/fundraising data room; document ingestion pipeline is internal-facing | 1-2 weeks |
| Fund administration managed services | N/A (services, not software) | Out of scope for current product phase | — |

## Top Gaps (Not in Winston, High Enterprise Value)

1. **LP/Investor CRM** — No relationship management layer at all; Juniper Square's most differentiated capability. High enterprise value because REPE GPs spend 40-60% of time on LP relations.
2. **Investor Portal (LP self-service)** — LPs expect a branded portal to view their positions, download documents, and track distributions. Without this, Winston can't replace Juniper Square in a prospect conversation.
3. **Capital Call + Distribution Notice Generation** — The automation of the notice → payment → notification loop is table-stakes for fund administrators. Winston has the underlying calculations; the delivery layer is missing.
4. **Subscription Document Automation** — Onboarding new LPs requires handling legal docs (subscription agreements, K-1s). Automating this is a 70% efficiency gain (per JS claim).

## Quick Wins (Already Partial — Just Need Assembly)

1. **Quarterly Report Auto-Assembly** — Winston already has LP Summary, P&L, capital accounts, waterfall. A scheduled trigger that pulls these modules into a formatted PDF/report is a 3-5 day build with high demo value.
2. **Capital Call Notice Generation** — The calculated capital amounts exist in Winston. Wrapping them in a templated PDF notice + email send is a 3-5 day build.
3. **DDQ Response Drafting** — Winston's RAG + AI chat can already answer questions about fund documents. Formalizing this as a "DDQ workflow" with a template and structured output is 1-3 days.
4. **Meeting Note → Next Action** — Winston chat can summarize uploaded notes today. Packaging as a "meeting ingestion" workflow (upload transcript → extract action items → add to task list) is 1-2 days.
