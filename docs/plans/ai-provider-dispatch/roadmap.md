# Roadmap

## PR 1 — Standalone governed spine (done)
Backend package (models/registry/policy/providers/supervisor/receipts), migration 541, route
`/api/ai/dispatch`, CLI, tests. OpenAI real, Claude real, Gemma fails closed. No gateway changes.

## PR 2 — Visibility + eval harness
Read-only admin panel (`/providers` + `/runs`, raw/tool-like, no heavy state libs). Real eval grading
harness over `evals/ai_dispatch/*.jsonl`. Gemma **promotion criteria**: a mode flips Gemma to default
only after ≥90% suite pass on that mode, 0 critical hallucinations, and a better latency/cost profile
than the frontier model for that mode.

## PR 3 — Real Gemma on Vertex
Deploy Gemma via Model Garden to a Vertex endpoint; wire `gemma_vertex_provider` to call it. Fails closed
on missing creds. Removes Gemma from the not-implemented set once verified.

## PR 4 — Cost + budget
Per-provider cost/latency metering recorded on the receipt; a budget guard returning
`cost_limit_exceeded` when a call would exceed the configured ceiling.

## PR 5 — Live gateway integration
Route one lane of real chat through the dispatch layer behind a flag, so the production gateway begins to
consume provider selection. Separately gated; reversible.

## PR 6 — Fallback chains
Explicit, recorded fallback chains with `fallback_chain_exhausted` when every eligible+available provider
fails.
