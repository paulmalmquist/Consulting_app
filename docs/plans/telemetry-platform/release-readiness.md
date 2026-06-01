# Telemetry Platform — Release Readiness

**Status:** RELEASED 2026-06-01 (Phases 0–5 complete; full operated loop live).

Verified end to end on live URLs. Evidence: `telemetry-platform/PROOF.md`.

- [x] Phase 1 ingestion proof — 13 Delta tables in `novendor_1.telemetry`, real row counts (2026-06-01, live SQL).
- [x] Phase 2 model proof — 4 MLflow runs, exact metrics, 2 champions registered behind gates (2026-06-01, MLflow run IDs).
- [x] Phase 3 serving proof — 6 `tel_*` RLS tables; live `/score` persists a receipt; RLS isolation verified; 7 tests pass (2026-06-01).
- [x] Phase 4 dashboard proof — env `dc82d39d…`; 5 dark-console pages from the API; GO→NO-GO replay flip (2026-06-01, screenshots).
- [x] Railway API reachable; deployed `/score` returns a real result + persists a receipt (2026-06-01, receipt `bf89dfc6…`).
- [x] Vercel production reachable; `novendor.ai/api/telemetry/*` proxies to the backend; replay fires deterministically (2026-06-01, live curl).
- [x] README results on top; exact metrics only; public-NASA-analog disclaimer present (2026-06-01).
- [x] Reviewer access model applied — authenticated lab tenant; cold session correctly redirects to login (2026-06-01, Playwright).

## Open gates (non-blocking for the demo)

- [ ] Authenticated production *screenshot* of the live replay flip — needs the `info@novendor.ai`
      login password (not available to the build session). Core readiness is proven without it (live
      API end to end + auth gating + local UI screenshots of the same deployed code). Close by logging
      in at `https://novendor.ai/login` and screenshotting the flip.
- [ ] v2 `verify` gate (`app.environment_contract` missing, platform-wide) — does not affect the
      deployed telemetry route. Backlogged.
