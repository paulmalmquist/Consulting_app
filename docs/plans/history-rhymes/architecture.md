# History Rhymes — Architecture

**Last updated:** 2026-06-12
**Status:** Verified by full route/service/schema inspection (telemetry-cockpit refactor discovery)

## Telemetry cockpit refactor (2026-06-12, in flight)

Dispatch record: `docs/plans/03-implementation-plans/active/history-rhymes-telemetry-cockpit-refactor.md`. ADO Epic #213 → Features #538/#539/#540 → Stories #541–#556.

### Target route map
| Route | Surface | Status |
|---|---|---|
| `/lab/env/[envId]/historyrhymes` | Default telemetry-style cockpit (new index page) | PR 2 |
| `.../historyrhymes/routine` | Compatibility alias rendering the same cockpit | PR 2 |
| `.../historyrhymes/morning-book` | Unchanged content, rendered in HR shell | existing |
| `.../historyrhymes/research` | Brief upload + archive (moved from planning) | PR 14 |
| `.../historyrhymes/planning` | Enhancement candidates promote/discard only | PR 14 |
| `.../historyrhymes/episodes` | Episode library explorer | PR 15 |
| `.../historyrhymes/calibration` | Honest planned-not-available status (no API yet) | PR 15 |
| `.../historyrhymes/admin` | Stream/raw API diagnostics | PR 6 |

New components live in `repo-b/src/components/historyrhymes/cockpit/` (HR-local primitives modeled on `repo-b/src/components/telemetry/primitives.tsx`, not imported). New client `repo-b/src/lib/historyrhymes/rhymesClient.ts` calls `/api/v1/rhymes/*` same-origin through the existing proxy `repo-b/src/app/api/v1/rhymes/[...path]/route.ts`. Streaming spine: `backend/app/services/hr_stream/` + `backend/app/events/consumer.py`, reusing `backend/app/events/` producer infrastructure; schema 10016.

### Verified corrections to earlier assumptions
- hr_* tables are **single-tenant analytics** — no env_id, no business_id, no RLS (exemption in ARCHITECTURE.md). The earlier "RLS expected via env_id" note was wrong for hr_*; only `structural_alerts` is RLS-scoped.
- `historyrhymes` was NOT in the LabEnvironmentShell full-bleed allowlist (`repo-b/src/components/lab/LabEnvironmentShell.tsx:167`); PR 2 adds it.
- Calibration data (`hr_agent_calibration`, `hr_predictions.brier_score`) exists in DB but no route exposes it.
- Key tables: `hr_weekly_briefs`, `hr_signal_snapshots`, `hr_predictions` (+ exec-loop extensions), `hr_paper_trading_ledger`, `hr_current_state` (view), `hr_research_briefs`, `hr_enhancement_candidates`, `hr_research_runs`, `episodes`, `episode_embeddings`, `wss_signal_state_vector`, `structural_alerts` (migrations 434, 503, 519, 10002).

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/trading` | `repo-b/src/app/lab/env/[envId]/trading/` | Trading lab root |
| `/lab/env/[envId]/historyrhymes/routine` | `repo-b/src/app/lab/env/[envId]/historyrhymes/routine/` | Daily trading routine |
| `/lab/env/[envId]/markets` | `repo-b/src/app/lab/env/[envId]/markets/` | Markets surface |
| `.../markets/execution` | `.../markets/execution/` | Trade execution view |
| `.../markets/podcast-intel` | `.../markets/podcast-intel/` | Podcast intelligence |
| `.../markets/portfolio` | `.../markets/portfolio/` | Portfolio view |

### Components and libs
| File/Dir | Purpose |
|---|---|
| `repo-b/src/components/historyrhymes/` | History Rhymes UI components |
| `repo-b/src/lib/historyrhymes/` | Client-side lib for HR data |
| `repo-b/src/app/lab/env/[envId]/historyrhymes/` | HR environment surfaces |

### Frontend API routes
| Route | File | Purpose |
|---|---|---|
| `/api/v1/rhymes` | `repo-b/src/app/api/v1/rhymes/` | Rhymes decision API |
| `/api/v1/trading` | `repo-b/src/app/api/v1/trading/` | Trading API |
| `/api/v1/market-rotation` | `repo-b/src/app/api/v1/market-rotation/` | Market rotation |
| `/api/v1/podcast` | `repo-b/src/app/api/v1/podcast/` | Podcast intelligence |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/rhymes.py` | History Rhymes decision endpoints |
| `backend/app/routes/trades.py` | Trade ledger CRUD |
| `backend/app/routes/trading.py` | Trading platform routes |
| `backend/app/routes/trading_analytics.py` | Analytics endpoints |

### Services
| File | Purpose |
|---|---|
| `backend/app/services/history_rhymes_service.py` | Core HR decision service |
| `backend/app/services/trading_analytics.py` | Trading analytics |
| `backend/app/services/trading_lab_service.py` | Trading lab service |
| `backend/app/services/trades_service.py` (verify name) | Trade ledger service |

### Scripts
| File | Purpose |
|---|---|
| `scripts/hr_daily_decision.py` | Daily decision build script |
| `scripts/hr_weekly_brief.py` | Weekly brief generation |

### Schemas
| File | Purpose |
|---|---|
| `backend/app/schemas/trading.py` | Trading schemas |
| `backend/app/schemas/trades.py` | Trade schemas |

## Data map

- Primary: Supabase for trade ledger, decisions, positions
- Compute: Databricks / MLflow for model training and backtesting
- Tables: Needs repo verification — likely `hr_decisions`, `hr_positions`, `hr_trades`, `hr_weekly_briefs`
- RLS expected via `env_id`

## AI / MCP / Runtime map

- Databricks MCP: model training, feature engineering, MLflow experiment tracking
- `backend/app/services/history_rhymes_service.py` — decision generation
- `backend/app/routes/rhymes.py` — decision retrieval and storage

## Test map

- Needs repo verification — check `backend/tests/` for rhymes/trading test files
- `scripts/hr_daily_decision.py` is runnable as a smoke test

## Needs verification

- [ ] Exact Supabase table names for decisions and positions
- [ ] Whether `hr_daily_decision.py` runs cleanly from CLI
- [ ] Whether Databricks is connected for feature engineering or if it runs locally
- [ ] MLflow experiment tracking setup
- [ ] Podcast intelligence data source (transcripts, embeddings)
