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

## Agent Builder read-only MVP

- [x] Existing Run Console still renders and remains the default Control Tower tab.
- [x] Six top-level Control Tower tabs render.
- [x] Builder supports adding, connecting, selecting, and configuring typed nodes.
- [x] MCP registry displays write-capable tools as blocked.
- [x] Graph validation rejects cycles, unreachable nodes, secret-shaped data, stale schema pins, and
  write-capable tools.
- [x] Save Draft uses immutable versions and optimistic `base_version_number`.
- [x] Dry-run unit proof writes steps, ordered events, and one builder receipt per step.
- [x] Human Approval returns a simulated pending approval and blocks the run.
- [x] Sensitive prompt routing forces the private tier without external fallback.
- [x] Same-origin proxy requires authentication and forwards tenant scope headers.
- [x] Frontend typecheck passes; 87 focused backend and 172 telemetry/frontend regression tests pass.
- [x] Migration 10035 targeted dry-run parses all 37 statements.
- [ ] Apply migration 10035 in an authorized schema environment and run DB verification.
- [ ] Run authenticated desktop/mobile browser smoke and capture screenshots after migration.
- [ ] Re-run the full frontend suite after the unrelated REPE fund-page loading failures are fixed
  (three failures in the final run; five in the initial baseline).
- [ ] Profile or split the full backend suite; the local all-tests invocation exceeded ten minutes.

## Agent Builder eval lifecycle and staged gate

- [x] Migration 10036 adds five tenant-scoped eval/failure-memory tables with RLS and indexes.
- [x] Eval results and failure memory have append-only database guards.
- [x] Deterministic graph, tool-contract, permission, fail-closed, cost, regression, and replay evals
  persist one result per case.
- [x] RAG, visual smoke, and production smoke report explicit N/A reasons when evidence/capability is
  absent.
- [x] Failed, blocked, and not-available runs can be promoted to regression memory.
- [x] Secret-shaped run payloads are refused during regression promotion.
- [x] A promoted failure blocks staging until a later matching successful dry-run exists on the
  current version.
- [x] The API rejects production publication and allows staged status only after required evals pass.
- [x] Evals UI renders persisted readiness, blockers, expected/actual evidence, and trace links.
- [x] Registry cards render eval readiness; Run History exposes regression promotion.
- [x] Focused verification passes: 79 backend, 15 frontend, typecheck, lint, and ruff.
- [x] Migrations 10035/10036 targeted dry-run parses 65 statements without executing them.
- [ ] Apply migrations 10035/10036 in an authorized non-production Supabase environment.
- [ ] Query persisted suite/case/run/result/failure-memory rows and attach receipt evidence.
- [ ] Run authenticated desktop/mobile browser smoke and attach screenshots.
