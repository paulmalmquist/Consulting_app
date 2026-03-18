# Feature: Enterprise Graph + Agentic Search — Glean — 2026-03-18

**Source:** Glean — https://www.glean.com/product/overview

## What It Does (User-Facing)
Indexes all company data across 100+ SaaS apps (Slack, Salesforce, email, docs, GitHub, etc.) into a unified "Enterprise Graph" that maps relationships between people, projects, documents, and data — then provides AI search and agent capabilities that are aware of who is asking and what they have access to.

## Functional Components

- **Data source:** 100+ SaaS connectors; document stores; communication platforms; code repositories; CRM data
- **Processing:** Semantic indexing of all company data; relationship graph construction (who wrote what, what references what, who knows what); permission-aware retrieval; multi-step agent reasoning across indexed data
- **Trigger:** Always-on background indexing; user query (search or agent invocation)
- **Output:** AI answers with citations; agent task completions; search results ranked by relevance and permissions
- **Delivery:** In-app; Slack/Teams integration; browser extension; API

## Winston Equivalent
Winston's 83 MCP tools and RAG system approximate this for the REPE domain — but are purpose-built for fund/asset data (GL, debt, valuations, deal pipeline) rather than horizontal enterprise data. Winston doesn't index Slack, email, or external SaaS. The architectural difference: Glean is horizontal and generic; Winston is vertical and domain-deep. Winston knows what DSCR is, what a waterfall structure means, what LP preferred return looks like — Glean does not. Classification: Not a direct feature gap, but a positioning threat. Glean could be positioned to REPE firms as "AI for all your work" — Winston must counter with domain depth.

## Architectural Pattern
Federated data connectors + permission-aware semantic index + knowledge graph construction + RAG-over-graph retrieval + agentic planning engine. This is the "horizontal enterprise AI platform" architecture pattern. Glean's moat is breadth of connectors and the Enterprise Graph. Winston's moat must be domain depth — the graph is pre-configured for REPE workflows.
