# History Rhymes — Architecture

**Last updated:** 2026-05-16  
**Status:** Partially verified from route/service inspection

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
