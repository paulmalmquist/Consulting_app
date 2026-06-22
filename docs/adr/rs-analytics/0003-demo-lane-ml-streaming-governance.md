# ADR 0003 — Demo-lane governance: Stargate streaming + Factory ML on Confluent/Databricks

- **Status:** Accepted
- **Date:** 2026-06-11
- **Deciders:** Paul Malmquist (owner)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [`0001-google-native-operating-model.md`](0001-google-native-operating-model.md), [`0002-itar-boundary-ai-scoping.md`](0002-itar-boundary-ai-scoping.md), `docs/plans/RS_STARGATE_FACTORY_ML_SESSION_PLAN.md`, ADO Epic #497 / Features #530, #531

## Context

ADRs 0001/0002 define the production target for an RS analytics platform:
Google-native, BigQuery medallion, two-zone ITAR boundary. The demo campaign
(PRs 3–5) builds two interview-grade capabilities on a different stack —
Confluent Cloud + managed Flink for streaming, Databricks + MLflow for batch
ML — because those are the tools in hand and the skills being demonstrated.
That split needs a stated relationship so nobody mistakes the demo lane for
the production architecture, and so the demo's data practices stay defensible.

Constraints that shaped the lane: two other coding sessions own adjacent
surfaces (the rs_factory_seed generator; the Winston event backbone with its
`EVENTS_*`/`winston.*` Confluent contract); the demo must run with zero cloud
dependency when networks fail; and every number shown must trace to a source.

## Decision

Treat Stargate streaming and Factory ML as a **demo lane with production
posture but no production coupling**:

1. **Synthetic data only.** Both lanes run exclusively on the deterministic
   `rs_factory_seed` build, pinned by manifest sha. No controlled, client, or
   personal data enters either pipeline. The ITAR two-zone model of ADR 0002
   is a talking point the demo can explain, not a control it needs.
2. **Resource isolation by construction.** Streaming uses `stargate.*` topics
   and the `CONFLUENT_*` env contract, disjoint from the event backbone's
   `winston.*`/`EVENTS_*`. Batch ML uses the new `novendor_1.rs_factory`
   schema, never `historyrhymes` or `ncf_ml`. The seed repo is read-only.
3. **Honest fallbacks, labeled.** The bridge's health payload names which
   engine produced aggregates (`flink` / `local-emulation` / `capture`); the
   strength target is a tolerance-margin stand-in and says so everywhere;
   join benchmarks report measured timings rather than presumed skew.
4. **Provenance as a feature.** Bronze tables carry `_loaded_at` +
   `_build_sha`; the dashboard footer shows the MLflow run id and seed sha;
   exports are committed JSON so review sees data diffs.
5. **Cost hygiene.** The SQL warehouse stops at the end of every pipeline run;
   the Flink compute pool is paused or deleted after each demo.

## Alternatives considered

- **Build the demo on the ADR 0001 Google stack (BigQuery/Dataflow/Vertex).**
  Rejected for this campaign — the interview targets Kafka/Spark/MLflow
  skills, the Confluent and Databricks accounts exist today, and the
  Google-native build is the production plan, not the demo plan.
- **Wire the demo into the production telemetry environment (Postgres,
  shared backend).** Rejected — two in-flight sessions own those surfaces,
  and a demo lane that mutates shared schema or deploys is a liability. The
  lane is standalone by design (no migrations, no backend mounts).
- **Live Databricks serving for the dashboard.** Rejected for the slice —
  a stub (`databricks_source.py`) would become a deploy and a failure mode;
  committed exports of deterministic data are reviewable and demo-proof.
  Live serving is the documented follow-up if the lane graduates.

## Consequences

- Positive: the demo cannot contaminate production data, schemas, or deploys;
  every claim on screen is traceable; the lane survives total network failure.
- Negative / cost: two stacks to narrate (demo vs production target); static
  exports go stale until the pipeline re-runs; the Confluent cloud beat
  depends on an interactive login the scripts cannot perform.
- Follow-ups: graduate the bridge into the backend app if the lane becomes a
  product surface; implement `databricks_source.py` for live serving;
  re-evaluate against ADR 0001 if RS work moves from demo to delivery.

## Validation

The campaign evidence log (`docs/plans/RS_STARGATE_FACTORY_ML_SESSION_PLAN.md`)
records per-PR receipts: test counts, local E2E throughput, capture
determinism hashes, bronze count reconciliation, MLflow run ids, and the
time-travel transcript. Revisit this ADR when the lane is shown to a real
prospect with real data requirements.
