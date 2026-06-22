# Telemetry Platform — QA Checklist

**Status:** active

Will cover, per `docs/plans/_templates/qa-checklist-template.md`:

- Page loads without 500 or console errors at `/lab/env/[envId]/telemetry`.
- Dark console only; nav ≤7 items; active state = fill + weight.
- Test Run Explorer renders real runs; run detail renders traces + threshold bands.
- Replay is deterministic and never stalls; Go/No-Go flips on the fire-tick.
- Model Performance + Monitoring values come from the API (verify in the network tab).
- Empty/missing states render null_reasons gracefully, not zeros or errors.
- `page.test.tsx` passes.

## Metadata Explorer

- [x] Protected route loads at `/lab/env/[envId]/telemetry/metadata`.
- [x] Route environment and `telemetry-demo` serving scope render as separate values.
- [x] Desktop sidebar contains Metadata Explorer.
- [x] 375px mobile More drawer contains Metadata Explorer.
- [x] Header renders generated time, partial/ok state, freshness, search, and all filters.
- [x] Explorer and graph cover committed sources through bronze, silver, gold, metrics, consumers,
  models, APIs, and AI tools.
- [x] Search and filters update explorer and graph together.
- [x] Metric/gold selection highlights the complete upstream chain.
- [x] Inferred edges are dashed and labeled inferred in the detail drawer.
- [x] Missing/unavailable values render `Unavailable` or a reason instead of an invented value.
- [x] Local API smoke returns HTTP 200 with nodes, edges, warnings, and matching derived stats.
- [x] Sensitive-field, allowlist, tenant-scope, invalid-catalog, and partial-warning tests pass.
- [x] Desktop, drawer/trace, and mobile screenshots are stored under
  `docs/evidence/telemetry-metadata-explorer/`.
- [ ] Repeat endpoint and browser smoke after deployment.
