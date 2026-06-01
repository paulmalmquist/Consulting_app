# Frontend wireframe — the 4-minute reviewer journey

This is a planning spec. The real components land in `repo-b/src/components/telemetry/` and the pages
under `repo-b/src/app/lab/env/[envId]/telemetry/` in Phase 4. Every panel reads from the API — no
hardcoded metrics in the frontend.

## Visual rules (from the design system)

- **Dark console only.** Internal operator surface. Use the `--bm-*` tokens already defined in
  `repo-b/src/app/globals.css`: `--bm-bg` / `--bm-bg-2` (shell), `--bm-surface` / `--bm-surface-2`
  (cards / nested panels), `--bm-border` / `--bm-border-strong`, `--bm-text` / `--bm-text-muted`,
  `--bm-accent` / `--bm-accent-glow`. No light mode, no new color system.
- **Depth order:** shell background darker than cards; cards darker than nested panels; nested panels
  darker than inputs. `--bm-bg` < `--bm-surface` < `--bm-surface-2` < input.
- **Navigation: 7 items or fewer.** Telemetry nav: Overview, Runs, Replay, Model Performance,
  Monitoring, (optional) Copilot. That is 5–6 — within budget.
- **Active state = color fill + text-weight change, not just an underline.**
- **Go/No-Go reads as a redline indicator,** not a generic status badge. Green = go, red = no-go,
  with the off-nominal reason in text.

## Screens

### Overview (console landing)
KPI cards across the top: active test runs, models promoted, anomalies in last 24h, current
fleet go/no-go. Health banner. Recent activity. All values from the API. Footer carries the
public-NASA-analog disclaimer.

### Test Run Explorer (`runs/`)
Table of real runs. Columns: `run_id`, dataset (C-MAPSS / SMAP-MSL / IMS), unit or channel, row
count, ingest timestamp, latest status. Row click opens the run detail: stacked multi-channel traces
with redline threshold bands overlaid; detected anomaly regions shaded; zoom/pan if feasible. Hover
an anomaly → window, confidence, contributing channels, and point-vs-contextual classification.

### Live Replay (`replay/`)
A trace chart area, the **Replay test feed** button, a tick indicator, and a marked fire-tick.
Pressing replay advances the pre-warmed traces deterministically; at the fire-tick the anomaly
region lights up, Go/No-Go flips, and attribution renders. Reads the precomputed replay feed (see
DEMO.md determinism contract). Must never stall.

### Go/No-Go panel (on Replay + run detail)
Large redline-style indicator showing the verdict for the selected run/tick. Fields: verdict
(GO/NO-GO), anomaly confidence, top contributing channels, one-line off-nominal rationale, model
version + run_id, and the Supabase prediction receipt id. Every field traceable to a `/score`
response.

### Sensor attribution (within Go/No-Go)
Ranked list of contributing channels with contribution weights. This is the "the system explains
itself" panel — it is what makes a flip credible rather than magic.

### Model Performance (`model-performance/`)
Anomaly metrics (precision / recall / F1 vs labeled windows) for baseline and LSTM autoencoder, side
by side; RUL metrics (RMSE, PHM score); MLflow run IDs; a promotion-gate badge per model
(promoted / held back). Live from the API.

### Monitoring (`monitoring/`)
PSI (population stability), rolling anomaly rate, prediction volume, drift verdict, and the model
version currently serving. A stale-data warning state if the monitoring feed is behind. This is the
panel that signals "operated, not trained once."

### Copilot (optional, `copilot/`)
A toggleable test-report assistant that drafts a plain-English summary of what went off-nominal for
the selected run. Off by default; the core app works without it. Every output is labeled an
assistant-generated draft, cites the fields it used, and fails closed (returns a declared null_reason
rather than inventing). See `docs/plans/telemetry-platform/ai-behavior.md`.

## Panel → endpoint binding

| Panel | Endpoint | Notes |
|---|---|---|
| Overview KPI cards | `GET /monitoring`, `GET /runs` | counts + current go/no-go |
| Test Run Explorer list | `GET /runs` | real runs + row counts |
| Run detail traces | `GET /run/{id}` | channels, thresholds, anomaly regions |
| Live Replay feed | `GET /run/{id}` (replay run) | precomputed real outputs; deterministic |
| Go/No-Go panel | `POST /score` (live) / replay feed | verdict + attribution + version + receipt |
| Sensor attribution | `POST /score` | per-channel contribution from the score response |
| Model Performance | `GET /run/{id}` model metadata / a metrics endpoint | precision/recall/F1, RMSE, PHM, run IDs, gate status |
| Monitoring | `GET /monitoring` | PSI, anomaly rate, counts, drift, serving version |
| Copilot draft | copilot endpoint (Phase 4, optional) | fail-closed, labeled draft |
