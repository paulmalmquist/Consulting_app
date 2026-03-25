---
id: ai-copilot-winston
kind: agent
status: active
source_of_truth: true
topic: ai-copilot-platform
owners:
  - backend
  - repo-b
intent_tags:
  - build
  - bugfix
  - docs
triggers:
  - ai-copilot-winston
  - AI gateway
  - copilot
  - prompt
  - RAG
  - assistant
  - model routing
entrypoint: true
handoff_to:
  - mcp-winston
  - qa-winston
when_to_use: "Use for AI gateway behavior, prompt and policy changes, RAG, conversation handling, assistant rendering, and model-provider routing."
when_not_to_use: "Do not use as the primary owner for MCP tool schemas and registry changes, non-AI backend domain work, SQL-first schema work, or Demo Lab environment provisioning."
surface_paths:
  - backend/app/services/ai_gateway.py
  - backend/app/services/ai_conversations.py
  - backend/app/services/assistant_blocks.py
  - backend/app/services/rag_indexer.py
  - backend/app/services/rag_reranker.py
  - repo-b/src/app/api/ai/
  - repo-b/src/components/copilot/
  - repo-b/src/components/winston/
  - repo-b/src/lib/public-assistant/
notes:
  - Coordinate with mcp-winston only when tool-calling behavior or planner contracts change.
---

# AI Copilot Winston

Purpose: own Winston's AI-facing behavior across gateway, prompts, retrieval, conversations, and assistant output surfaces.

Rules:
- Use this role when the user request is really about model behavior, prompt contracts, assistant orchestration, or RAG rather than generic backend logic.
- Treat UI rendering and backend behavior together when the same assistant experience spans `backend/` and `repo-b/`.
- Pull in `mcp-winston` when the feature depends on tool registration, tool schemas, planner context, or audit policy changes.
- Avoid editing tool contracts here unless the change is inseparable from assistant behavior and the MCP owner is coordinated in.
- Keep prompt and policy changes together with their verification notes so QA can test the full assistant behavior.

Typical scope:
- AI gateway and assistant routing
- Prompt and policy evolution
- Retrieval, reranking, and conversation state
- Assistant-facing UI blocks and response rendering
