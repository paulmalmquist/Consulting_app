---
id: winston-document-pipeline
kind: skill
status: active
source_of_truth: true
topic: document-to-asset-pipeline
owners:
  - backend
  - repo-b
intent_tags:
  - build
  - documents
  - ingestion
triggers:
  - document asset creation
  - attached document
  - extract document
  - turn document into asset
entrypoint: true
handoff_to:
  - feature-dev
  - qa-winston
when_to_use: "Use when the task involves attached-document ingestion, extraction, and turning source documents into Winston entities or assets."
when_not_to_use: "Do not use for generic RAG indexing work that does not create downstream Winston entities."
surface_paths:
  - backend/app/routes/
  - backend/app/services/
  - repo-b/src/app/api/
  - repo-b/src/components/commandbar/
name: winston-document-pipeline
description: "Document-to-asset pipeline skill for Winston. Use for attached-document ingestion, extraction, context wiring, and converting uploaded documents into structured Winston entities or assets."
---

# Winston Document Pipeline

Use this skill for the document-to-asset flow, not generic document storage alone.

## Load Order

- `../../docs/WINSTON_DOCUMENT_ASSET_CREATION_PROMPT.md`
- `../../docs/WINSTON_AGENTIC_PROMPT.md` only if the flow ends in a write action that requires confirmation

## Working Rules

- Keep the pipeline split into extraction, gateway/context wiring, and frontend attachment UX.
- Do not add document-derived writes unless the extracted structure is explicit and auditable.
- Prefer phased delivery: backend extraction first, then UI attachment, then write/mutation integration.

## Prompt Lessons From The Source Doc

- This prompt worked well because it named the interaction to enable, current architecture gaps, target flow, and phase order.
- The durable prompting pattern here is end-to-end data flow plus file-by-file change summary.
- Requests in this area fail when they skip extraction fidelity or assume the frontend can infer structure from raw text alone.

## Exit Condition

- Verify one attached-document flow from upload through extracted structure.
- Verify the downstream entity or asset creation path uses explicit extracted fields.

