# RS Telemetry — Relativity talk track

Translates each capability into Relativity-Space language. Pair with the in-app exhibit
(`/telemetry/how-it-works`) and `RS_DEMO_SCRIPT.md`. Keep the honesty discipline: say Built vs
Partial vs Planned out loud; don't let "built" drift into "in production" without the click.

| Capability | Relativity framing | What I show | Honest edge |
|---|---|---|---|
| Live stream + anomaly verdict | **Test stand operations** — hot-fire telemetry classified GO/REVIEW/NO_GO in seconds; fail-closed when a sensor source drops | `/telemetry/stream`, `/telemetry/replay` | Champion is a frozen MAD rule, not a live-retraining loop |
| Factory / NCR + Factory ML | **Factory throughput** — first-pass yield, work-center load, NCR recurrence, backlog forecast | `/telemetry/factory`, `/telemetry/factory-ml` | NCR clustering is the cuttable item; forecast vs naive baseline shown |
| Released/promoted-only rollups | **Launch / flight readiness** — readiness rolls up only from promoted state, never mixed with stale | overview KPIs, monitoring | A full LRR/FRR open-items rollup is Planned |
| Champion scorer + RUL calibration + drift | **Anomaly review** — model-scored off-nominal detection with a "decision this informs" on each model | `/telemetry/model-performance`, `/telemetry/calibration` | RUL calibration is code-verified, prod verification pending the click |
| Medallion + DQ + (REPE) registry pattern | **Trusted metrics** — one governed definition, lineage on every number | follow-one-stream-aggregate; REPE AuditDrawer as the pattern proof | Governed metric registry + lineage drawer are REPE-only, Planned for telemetry |
| Typed/permissioned/audited tools, refusals, citations | **AI governance** — the AI calls typed tools, asks permission, logs receipts, and refuses rather than invents | `/telemetry/governance`, MCP snapshot | Grounded structured-evidence Q&A, not document RAG; cost estimated not enforced |
| ADO intake, CLAUDE.md routing, CI guardrails, fail-closed | **Engineering culture** — every change is a tracked work item with tests, evidence, and a one-way DONE | delivery timeline, ADRs | The AI-SQL→PR automation is Planned; the governance is real today |
| Batch-vs-streaming crosswalk, ITAR ADR, costed plan | **Data platform leadership** — demo substrate mapped to GCP production scale, ITAR boundary decided, 30/60/90 costed | crosswalk table, `docs/adr/rs-analytics/` | Kafka→BigQuery→GKE spine is partial/disabled by default |

## Three sentences if I only get three
1. "I make data trustworthy: a medallion pipeline with watermarks and quality assertions that fails closed — a stale number shows a reason, never a fake zero."
2. "I make AI auditable: typed, permissioned tools that leave redacted receipts and refuse when they can't ground an answer — and I'm precise that this is evidence-grounded Q&A, not document RAG."
3. "I run an engineering operating model: every change is a tracked ticket with tests and evidence and a one-way DONE — this exhibit page itself shipped that way."

## Honest scoping answers (have these ready)
- **"Is this production?"** — "The code is built and verified; production verification is per-route and I mark it only after I click it on novendor.ai. The exhibit tracks that distinction."
- **"Do you do RAG over the program corpus?"** — "Not for telemetry yet. The platform has a RAG stack with citations on the REPE/credit corpus; the telemetry copilot grounds on fetched structured evidence. Indexing the telemetry program corpus is the next step."
- **"Reinforcement learning?"** — "Out of the 90-day plan deliberately — not credibly demoable in three weeks. It's documented with a named carrier in the strategy doc."
- **"ITAR?"** — "Highest-stakes constraint. Looker/Dataform/Vertex aren't in the ITAR control package, so inside the boundary transforms become BigQuery/Composer and the AI runs on de-controlled summaries. It's a decision record, not a hand-wave."
