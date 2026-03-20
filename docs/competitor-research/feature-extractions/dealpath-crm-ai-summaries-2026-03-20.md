# Feature: CRM with AI Summaries — Dealpath — 2026-03-20

**Source:** Dealpath — dealpath.com/ai-studio/, dealpath.com/platform

## What It Does (User-Facing)
Purpose-built CRM for real estate investors that tracks broker, lender, and capital partner relationships alongside deal data. AI automatically distills relationship and activity history into summaries for companies, contacts, and deals — giving instant context before calls or meetings.

## Functional Components
- Data source: Deal activity history, communication logs, relationship touchpoints, broker/lender interactions stored in Dealpath
- Processing: AI-powered summarization of relationship history; activity pattern analysis; relationship health scoring (implicit)
- Trigger: User opens a contact/company record; before scheduled meetings; on-demand summary request
- Output: Condensed narrative of relationship history, recent interactions, deal involvement, and key context points
- Delivery: Inline within CRM contact/company view; accessible from deal context

## Winston Equivalent
Winston does not have a dedicated CRM module. Winston's Demo Lab can spin up environments for prospects, but there's no ongoing relationship tracking with AI summaries. Winston could leverage its AI chat to summarize deal-related communications, but lacks the structured CRM data model (contacts, companies, interaction logs, deal associations). This is "Moderate build" — needs a CRM data model, relationship tracking, and AI summarization layer.

## Architectural Pattern
Structured CRM + RAG summarization over activity history. Pattern: "relationship data model → activity log aggregation → AI summarization → contextual inline delivery."
