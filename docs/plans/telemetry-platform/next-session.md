# Next Session — Telemetry Platform (build complete)

**Last updated:** 2026-06-01 (Phases 0–5 complete)

The telemetry platform is built and live end to end:
- Databricks medallion (13 Delta tables), MLflow models + 2 registered champions behind gates,
  Supabase `tel_*` serving, dashboard as a Winston lab env, deployed to Railway (API) + Vercel
  (novendor.ai).
- Live: API `https://authentic-sparkle-production-7f37.up.railway.app`; demo
  `https://novendor.ai/lab/env/dc82d39d-9be2-49b0-a01d-c7181b13a8b6/telemetry` (authenticated).
- Full evidence in `telemetry-platform/PROOF.md`; reviewer script in `telemetry-platform/DEMO.md`.

## Remaining items (small, optional)

1. **Authenticated production screenshot of the live replay flip.** Needs the `info@novendor.ai`
   login password. Steps: log in at `https://novendor.ai/login`, open the demo route, click "Replay
   test feed", screenshot the GO→NO-GO flip, save under `telemetry-platform/docs/screenshots/`.
2. **IMS vibration features (deferred from Phase 1).** The 1 GB IMS archive is verified in Bronze;
   the time/frequency-domain features were not built (does not gate the demo). See `backlog.md`.
3. **Platform-wide v2 verify gate** (`app.environment_contract` missing) — not telemetry-specific;
   tracked in `backlog.md`.

## If continuing, copy-paste prompt

```
The telemetry platform (dispatch 0003) is built and live. Read telemetry-platform/PROOF.md and
docs/plans/telemetry-platform/release-readiness.md. Pick up one of the remaining items: (1) capture
the authenticated production replay-flip screenshot (needs the info@novendor.ai login), (2) IMS
vibration feature engineering, or (3) the platform-wide app.environment_contract v2 verify gate.
Do not re-deploy or re-provision unless asked. Stop after the chosen item with proof appended.
```
