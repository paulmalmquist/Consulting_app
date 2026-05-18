# Demo Lab — Design Adaptation

## Purpose in the design system

Demo Lab is the AI showcase environment. It should feel technically impressive but approachable. The pipeline, chat, and HITL surfaces must make it immediately clear what the AI is doing and why.

## Accent choices
- Primary: `--nv-purple-400`
- Pipeline status: `--nv-success` (done), `--nv-amber-400` (processing), `--nv-error` (failed)
- AI response confidence: graduated from `--nv-success` to `--nv-amber-400`
- HITL review items: `--nv-amber-400` (pending human review)

## Density
Medium. The pipeline view must show job status at a glance. Chat must be readable and citation-aware.

## Component emphasis
- Pipeline jobs must show: document name, stage (uploading/chunking/embedding/indexed), status chip
- Chat responses must show: source document reference inline or as a footnote
- HITL queue must show: the AI response, the human's options (approve/reject/edit), and the original question
- Upload must show progress as a step sequence, not just a spinner

## What this environment must NOT do
- Hide pipeline stage progression behind a single "processing" spinner
- Show chat responses without source citations when RAG is active
- Present HITL items without the AI's original response visible
