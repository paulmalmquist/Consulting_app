# Telemetry Platform — Release Readiness

**Status:** stub. Filled in Phase 5.

Will gate the live demo, per `docs/plans/_templates/release-readiness-template.md`:

- [ ] Phase 1 ingestion proof in PROOF.md (real row counts).
- [ ] Phase 2 model proof in PROOF.md (real MLflow run IDs, exact metrics, promotion decisions).
- [ ] Phase 3 serving proof (live `/score` + persisted row + `/monitoring` PSI; API tests pass; RLS verified).
- [ ] Phase 4 dashboard proof (env provisioned, verify-gate passed, deterministic replay, screenshots).
- [ ] Railway API URL reachable; deployed `/score` matches local shape.
- [ ] Vercel production URL reachable; live env loads; replay fires deterministically.
- [ ] README results table shows real metrics only; public-NASA-analog disclaimer present.
- [ ] Reviewer access model decided and applied (no accidental public admin/lab exposure).

Each gate marked with a date and verification method when it passes.
