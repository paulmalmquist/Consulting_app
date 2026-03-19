---
id: winston-ai-architecture
kind: skill
status: active
source_of_truth: true
topic: ai-architecture-review
owners:
  - backend
  - repo-b
  - docs
intent_tags:
  - research
  - docs
triggers:
  - AI architecture
  - AI workflows
  - AI gateway map
  - RAG architecture
  - assistant lane model
  - tool calling architecture
entrypoint: true
handoff_to:
  - architect-winston
  - ai-copilot-winston
  - mcp-winston
when_to_use: "Use when the task is to map, audit, harden, or reason about Winston's current AI architecture across gateway routing, RAG, MCP tool-calling, demo chat, and adjacent assistant paths."
when_not_to_use: "Do not use as the primary owner for implementing one narrow chat, RAG, MCP, or latency change when a more specific skill or agent already owns that work."
surface_paths:
  - AI_ARCHITECTURE_AND_WORKFLOWS.md
  - backend/app/routes/ai_gateway.py
  - backend/app/services/ai_gateway.py
  - backend/app/services/request_router.py
  - backend/app/services/rag_indexer.py
  - backend/app/mcp/
  - repo-b/src/app/api/ai/
  - repo-b/src/components/commandbar/
  - repo-c/
name: winston-ai-architecture
description: "AI architecture review skill for Winston. Use for repo-grounded AI maps, gateway and RAG audits, tool-calling topology, lane-model analysis, and deciding which AI surface actually owns a behavior."
---

# Winston AI Architecture

Use this skill when the question is about how Winston's AI systems fit together, not just how to edit one file.

## Load Order

- `../../AI_ARCHITECTURE_AND_WORKFLOWS.md`
- `../../docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md` only if the question turns into lane budgets or acknowledgment timing
- `../../docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md` only if the question turns into retrieval quality or model dispatch
- `../../docs/WINSTON_AGENTIC_PROMPT.md` only if the question includes mutation flows or tool-calling behavior

## Working Rules

- Start by naming which AI path is actually in scope: production copilot, document indexing/RAG, demo-lab chat, public assistant, or developer orchestration.
- Do not flatten adjacent AI systems into one runtime. Winston has overlapping surfaces that share branding but not always implementation.
- Use the current canonical production path and canonical tables first. For current RAG work, that means `rag_chunks`, not older demo knowledge-base tables.
- Keep request routing, retrieval, tool execution, conversation persistence, and UI rendering as separate contracts while you analyze the stack.

## Prompt Lessons From The Source Doc

- The architecture map is useful because it names the real request flow, key files, and neighboring non-canonical systems in one place.
- The durable review pattern is: identify the active AI path, map the owning surfaces, then inspect the boundary crossings where state or latency can go wrong.
- Most confusion in this repo comes from assuming there is one assistant pipeline or one backend. This skill exists to prevent that mistake.

## Exit Condition

- Name the active AI path, its key files, and the owning surface.
- If the next step is implementation, hand off to the narrower skill or specialist that owns that path.
