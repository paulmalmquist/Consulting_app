# Telemetry Platform — AI behavior

There is one AI surface in this environment: an **optional** test-report copilot. It is off by
default and the core platform works without it. It exists to show range (RAG / agentic experience),
not to carry the demo. A copilot that is load-bearing reads as a gimmick; an optional one reads as
range.

## Scope

The copilot drafts a plain-English summary of what went off-nominal for a selected test run, from
real data already on screen (the run's channels, detected anomaly windows, attribution, model
verdict). It does not compute new metrics, does not predict, and does not write to the platform
unless explicitly confirmed.

## Fail-closed contract

Per `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`:

- Never invent a value. When data is missing, return null with a declared `null_reason` rather than a
  plausible-sounding approximation.
- Every generated summary is labeled an **assistant-generated draft** and cites the fields it used.
- Any write goes through a confirmation gate and emits a receipt (per `tool-use-policy.md`).
- The copilot does not approximate model metrics, anomaly scores, or RUL — those come from the API,
  not the language model.

## null_reasons

Existing standard reasons it may emit: `data_not_ingested`, `tool_not_available`,
`out_of_scope_environment`, `no_relevant_documents`.

New telemetry reasons (registered in `fail-closed-rules.md` in Phase 0):

| null_reason | Meaning |
|---|---|
| `model_not_promoted` | No promoted model version exists for the requested channel/model |
| `channel_not_scored` | Channel exists but has no prediction rows yet |

## Eval coverage

Each null_reason has a negative test in `eval-plan.md` that confirms: when the triggering condition
exists, the null is returned with the correct reason and the UI renders it gracefully — not as an
error, not as empty, not as a zero. An out-of-scope question (e.g. asking the copilot to predict a
future failure date it has no model for) returns `out_of_scope_environment`.
