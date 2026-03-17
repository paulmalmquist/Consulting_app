---
id: winston-performance-architecture
kind: skill
status: active
source_of_truth: true
topic: latency-and-dispatch
owners:
  - backend
  - repo-b
intent_tags:
  - performance
  - latency
  - rag
  - models
triggers:
  - latency optimization
  - reranking
  - model dispatch
  - prompt budget
  - performance architecture
entrypoint: true
handoff_to:
  - architect-winston
  - feature-dev
when_to_use: "Use when the task is to improve latency, model routing, RAG quality, prompt budgeting, caching, or instrumentation in Winston's AI gateway."
when_not_to_use: "Do not use for mutation/write-flow behavior unless the primary issue is still latency or dispatch."
surface_paths:
  - backend/app/services/
  - backend/app/routes/
  - repo-b/src/lib/commandbar/
name: winston-performance-architecture
description: "Performance architecture skill for Winston. Use for latency lanes, model dispatch, reranking, caching, prompt compaction, instrumentation, and other AI-gateway speed/quality tradeoffs."
---

# Winston Performance Architecture

Use the latency doc for the base lane model and the reranking doc for retrieval quality upgrades.

## Load Order

- `../../docs/WINSTON_LATENCY_OPTIMIZATION_PROMPT.md`
- `../../docs/WINSTON_RERANKING_AND_MODEL_DISPATCH_PROMPT.md`

## Working Rules

- Keep performance work attached to the real request flow: routing, RAG decision, model call, tool execution, trace assembly, and UI hydration.
- Preserve lane-specific intent. Faster is not the only goal; the correct model and retrieval budget per lane matter.
- Any proposed optimization needs a measurement path, not just a theoretical token or latency win.

## Prompt Lessons From The Source Docs

- These prompts held up because they named current bottlenecks, target lane budgets, implementation priority, and success criteria.
- The quality correction here was not a new doc replacing a bad one; it was splitting retrieval/model-quality work away from raw latency work.
- Good prompts in this area distinguish performance, retrieval quality, and UX acknowledgment timing instead of blending them.

## Exit Condition

- Verify at least one measurable latency or quality improvement.
- Record which lane or stage changed and how it was measured.

