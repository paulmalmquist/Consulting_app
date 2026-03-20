# Feature: Agent STUDIO — Cherre — 2026-03-20

**Source:** Cherre — cherre.com/products/agent-studio/

## What It Does (User-Facing)
Allows real estate organizations to design, deploy, and scale purpose-built AI agents that operate over their connected data — from OM screening to variance analysis — without requiring internal AI expertise.

## Functional Components
- Data source: All connected internal/external data via Cherre's Universal Data Model, Semantic Data Layer, and Knowledge Graph (3.3B+ addresses, 150+ integrations)
- Processing: Agentic AI workflows orchestrating multi-step analysis; model-agnostic architecture allowing switching between LLMs; modular "Action Blocks" composed into "Work Packages"
- Trigger: User-initiated or event-driven agent execution; marketplace deployment of pre-built agents
- Output: Agent-specific — investment thesis validation, NOI delta explanations, rent roll anomalies, capex flags, variance reports
- Delivery: In-platform results; integrated into existing Cherre data workflows; API-accessible

## Winston Equivalent
Winston has 83 MCP tools and SSE streaming with domain-specific AI. However, Winston does not have a visual agent builder/studio or a marketplace for pre-built agent packages. Winston's tools are configured by developers, not composed by end-users. The concept of "Work Packages" (coordinated agent teams) is more advanced than Winston's current single-tool invocation model.

## Architectural Pattern
Agent marketplace + visual orchestration layer over structured data graph. Pattern: "no-code agent composition over knowledge graph with model-agnostic execution runtime."
