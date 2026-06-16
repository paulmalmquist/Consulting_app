# 0004a - History Rhymes Polymarket Streaming and Divergence

**Parent dispatch:** `0004-event-streaming-bigquery-gke.md`
**Created:** 2026-06-14
**Status:** Local implementation complete; external provisioning and rollout gates remain.
**Azure DevOps:** Epic 213, Feature 539, Stories 567-570.

## Decision

Extend dispatch `0004`. Do not create a second streaming platform.

```text
Polymarket public Gamma/CLOB/WebSocket
  -> GKE ingestion worker
  -> Confluent JSON EventEnvelope topics
  -> GKE materializer + forecast sidecar
  -> Postgres hr_* feature and forecast tables
  -> Railway FastAPI
  -> live History Rhymes routine page

All four Polymarket topics
  -> existing observational BigQuery sink
  -> winston_events_raw.events
```

Polymarket is read-only and is treated as market-implied probability, never
ground truth. There is no trading, wallet, private key, order signing, or
authenticated Polymarket API path.

## Implemented

### Streaming

- Gamma `/events/keyset` discovery every 15 minutes.
- Correct keyset pagination with `after_cursor`, `closed=false`, and liquidity
  ordering. The client enforces active, future-dated, order-book-enabled,
  binary Yes/No, minimum-liquidity selection.
- Strict parsing of Gamma JSON-string `clobTokenIds`, `outcomes`, and
  `outcomePrices`.
- Dynamic WebSocket token subscribe/unsubscribe.
- Normalization for `book`, `price_change`, `last_trade_price`,
  `best_bid_ask`, `new_market`, and `market_resolved`.
- Literal `PING` every 10 seconds, capped exponential reconnect, and a
  synthetic connection heartbeat on `PONG`.
- Five-minute CLOB REST book reconciliation.
- Shared `winston.dead-letter.v1` routing. No fixture fallback.

| Topic | Policy |
|---|---|
| `winston.hr.polymarket.markets.v1` | compacted metadata |
| `winston.hr.polymarket.raw.v1` | 7-day retention |
| `winston.hr.polymarket.features.v1` | 30-day retention |
| `winston.hr.polymarket.forecasts.v1` | 90-day retention |

The existing JSON `EventEnvelope` remains the wire contract. Schema Registry
is deferred.

### Materialization

The materializer maintains books in memory and upserts one idempotent snapshot
per market/minute:

- midpoint, last trade, spread, spread bps, and explicit price basis;
- bid/ask notional within 1 and 5 probability points;
- book imbalance and 5-minute/1-hour/24-hour probability changes;
- liquidity confidence and shock score;
- connection-stale, quiet-market-stale, thin, and ambiguous flags.

Raw ticks remain in Confluent and observational BigQuery, not Postgres.

### Forecasting

The deterministic parser supports only:

- Federal Funds target upper bound or cuts by a date;
- CPI year-over-year threshold;
- unemployment threshold;
- US recession by a date;
- SPY, BTC, or ETH close threshold on a date.

Unsupported or ambiguous questions remain crowd-only. An LLM never sets the
predicate or probability.

Eligible questions retrieve 20 no-lookahead History Rhymes episodes and
evaluate the event predicate at the matching horizon. Rhyme Score weights are
normalized to an effective sample size of 20:

```text
p_hr = (10 * p_base + sum(weight_i * outcome_i)) /
       (10 + sum(weight_i))
```

The record persists the posterior interval, complete analog sample, parser and
model versions, data lineage, signed divergence, calibration evidence, and
research-only/position-sizing flags.

Forecasts are withheld for stale inputs, ambiguous mappings, fewer than 20
outcomes, unavailable historical data, or a family that has not passed:

- at least 50 walk-forward observations;
- Brier at least 0.01 better than climatology;
- ECE no greater than 0.10.

Position sizing remains disabled until 30 live resolutions over at least 90
days achieve Brier below 0.22. The checked-in GKE calibration registry is
empty, so deployment fails closed until backtest evidence replaces it.

### Persistence and API

Migration `10017_history_rhymes_polymarket.sql` adds:

- `hr_polymarket_markets`
- `hr_polymarket_feature_snapshots`
- `hr_polymarket_stream_status`
- `hr_forecast_questions`
- `hr_event_forecasts`

The documented single-tenant `hr_*` exemption is preserved.

Mounted API prefix: `/api/hr/v1/polymarket`

- `GET /health`
- `GET /markets`
- `GET /pulse`
- `GET /divergence`
- `GET /markets/{market_id}/history`
- `GET /forecasts/{question_id}`

Responses expose `as_of`, `stale`, `null_reason`, provenance, price basis, and
forecast status. Disabled/unavailable feeds return explicit empty states;
database failures return `503`. Withheld/uncalibrated forecasts render as
`RESEARCH`, never `LIVE`.

### UI

`PredictionMarketPulse` is mounted on the live
`historyrhymes/routine` page. It shows crowd probability, HR probability when
allowed, signed divergence, recent change, liquidity confidence, source time,
price basis, and the required status states. The legacy fixture-backed tab was
not changed.

## Secrets and infrastructure

Polymarket requires no API key.

Required runtime secrets:

- `CONFLUENT_BOOTSTRAP_SERVERS`
- dedicated `CONFLUENT_API_KEY` / `CONFLUENT_API_SECRET` per worker role
- `DATABASE_URL`
- `FRED_API_KEY`
- existing `DATABRICKS_HOST` / `DATABRICKS_PAT`

GKE uses Secret Manager CSI file mounts plus Workload Identity. No
service-account JSON and no Kubernetes Secret copies are used.

Provisioning:

- `infra/confluent/history-rhymes-polymarket/provision.ps1`
- `infra/k8s/overlays/gke-prod/history-rhymes-polymarket/provision-gcp.ps1`
- `infra/k8s/overlays/gke-prod/history-rhymes-polymarket/README.md`

Confluent identities are split into ingestion, materialization/forecasting,
and observational sink accounts with topic/group ACLs.

## Verification evidence

Completed locally:

- focused backend Polymarket/sink suite: 48 passed;
- broad backend event, History Rhymes, Polymarket, and sink suite: 98 passed;
- live Gamma discovery: 5 selected from current active/future/liquid markets;
- PowerShell provisioning scripts parse successfully;
- base and GKE Kustomize overlays render successfully;
- schema dry-run: 324 files, 4,692 statements;
- focused History Rhymes frontend suite: 13 passed;
- full frontend unit suite passed;
- Next.js production build compiled, type-checked, and generated 300 static pages.

No Confluent, GKE, Secret Manager, Postgres migration, Railway, or Vercel
production change is claimed by this record.

## Rollout

1. Provision Confluent topics, identities, and Secret Manager versions.
2. Apply migration `10017`.
3. Build and publish an immutable backend image.
4. Deploy the GKE overlay with `HR_POLYMARKET_ENABLED=true`.
5. Keep Railway `HR_POLYMARKET_ENABLED=false` during capture validation.
6. Prove public feed -> Confluent offsets -> Postgres snapshot -> API and
   matching BigQuery event IDs.
7. Complete a 24-hour stream soak.
8. Run per-family walk-forward gates and publish a versioned calibration
   artifact only for passing families.
9. Run seven days of UI shadow traffic.
10. Enable the Railway/API/UI flag.

## External contracts

Verified 2026-06-14:

- https://docs.polymarket.com/market-data/overview
- https://docs.polymarket.com/market-data/websocket/market-channel
- https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination
- https://docs.polymarket.com/api-reference/rate-limits
