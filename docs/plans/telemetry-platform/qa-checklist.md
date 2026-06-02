# Telemetry Platform — QA Checklist

**Status:** stub. Filled in Phase 4 when there is a UI to QA.

Will cover, per `docs/plans/_templates/qa-checklist-template.md`:

- Page loads without 500 or console errors at `/lab/env/[envId]/telemetry`.
- Dark console only; nav ≤7 items; active state = fill + weight.
- Test Run Explorer renders real runs; run detail renders traces + threshold bands.
- Replay is deterministic and never stalls; Go/No-Go flips on the fire-tick.
- Model Performance + Monitoring values come from the API (verify in the network tab).
- Empty/missing states render null_reasons gracefully, not zeros or errors.
- `page.test.tsx` passes.
