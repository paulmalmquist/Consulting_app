# Feature: JunieAI Document Automation — Juniper Square — 2026-03-19

**Source:** Juniper Square — https://www.junipersquare.com/blog/junie-ai-keynote + PR Newswire launch release

## What It Does (User-Facing)
JunieAI automatically ingests subscription documents, invoices, and K-1 forms, extracts key data fields, validates them against existing records, and updates CRM/fund records — cutting manual data entry by a claimed 70%.

## Functional Components
- **Data source:** Uploaded documents (subscription agreements, K-1s, investor invoices); email attachments via Google/Microsoft integration
- **Processing:** LLM-based document parsing → field extraction → validation against existing fund records → conflict flagging
- **Trigger:** Document upload by user, or automatic capture via email integration
- **Output:** Pre-populated CRM/fund records, exception report of unresolved fields, accuracy confirmation
- **Delivery:** In-platform data record update; exception alerts surfaced in UI

## Winston Equivalent
Winston has a document ingestion pipeline (described in SKILL.md and WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md). It can process attached documents and create asset records. **What's missing:** Winston's document pipeline appears to create asset-level records from property documents (rent rolls, operating statements) — it does not yet automate LP subscription document intake, K-1 extraction, or investor onboarding document processing. The investor-facing, fund-administration document workflow is a gap.

## Architectural Pattern
Event-triggered document ingestion → LLM field extraction → structured schema hydration → validation diff against existing records → exception queue. This is a "document-to-schema hydration" pattern sitting on top of a vector/OCR pipeline.

---

# Feature: JunieAI AI CRM + Email/Calendar Auto-Sync — Juniper Square — 2026-03-19

**Source:** Juniper Square — https://www.prnewswire.com/news-releases/juniper-square-launches-the-first-ai-crm-purpose-built-for-private-markets-investor-relations-302589712.html

## What It Does (User-Facing)
JunieAI monitors two-way email and calendar activity with LPs (Google and Microsoft), automatically surfaces relationship signals (meeting cadence, LP sentiment, unanswered threads), and keeps CRM contact records updated without manual data entry. IR teams get a 360-degree LP activity view without leaving the platform.

## Functional Components
- **Data source:** GP/LP email threads, calendar invites/meetings (Google Workspace + Microsoft 365 OAuth)
- **Processing:** Email/calendar sync daemon → LLM summarization of interaction threads → relationship scoring → CRM record update
- **Trigger:** Continuous sync (scheduled background job + webhook on new email/meeting event)
- **Output:** Updated contact timeline in CRM, AI-generated meeting summaries, next-action suggestions, LP activity alerts
- **Delivery:** In-platform CRM record; alert surfaced to IR team member

## Winston Equivalent
Winston has an AI chat workspace and 83 MCP tools but no CRM module and no LP email/calendar integration. Winston tracks fund/portfolio data but does not ingest or reason over GP-LP communication threads. This is a **complete gap** — Winston has no IR relationship management layer.

## Architectural Pattern
OAuth-connected email/calendar pipeline → LLM summarization + sentiment extraction → structured CRM record write-back → activity score aggregation. Classic "comms-to-CRM hydration" agentic loop with scheduled polling + event-driven updates.

---

# Feature: Nasdaq eVestment Integration into AI CRM — Juniper Square — 2026-03-19

**Source:** https://www.alternativeswatch.com/2026/01/14/juniper-square-nasdaq-partnership-evestment-integration-into-ai-crm/

## What It Does (User-Facing)
When live (summer 2026), this embeds Nasdaq eVestment's database of 100,000+ investor and consultant contacts (30,000+ profiles) directly into the Juniper Square AI CRM, allowing GPs to identify and reach prospective LPs without separate API access or manual data entry.

## Functional Components
- **Data source:** Nasdaq eVestment institutional investor database (allocator profiles, mandate preferences, AUM, historical commitments)
- **Processing:** Cross-reference between GP's existing LP contacts and eVestment profiles → enrichment of existing records + discovery of new prospects
- **Trigger:** User search/query within CRM; background enrichment on existing contacts
- **Output:** Enriched contact profiles, prospect lists filtered by mandate/allocation history, recommended LP targets
- **Delivery:** In-platform CRM record enrichment; search/discovery UI

## Winston Equivalent
Winston has no LP prospect database or investor discovery capability. Deal Radar tracks pipeline deals (assets, not LPs). There is no investor-facing CRM or prospect sourcing layer. **Complete gap.**

## Architectural Pattern
Third-party data API integration → record matching/deduplication → enrichment layer on top of existing CRM schema. Standard enrichment pipeline (similar to how Salesforce embeds ZoomInfo).
