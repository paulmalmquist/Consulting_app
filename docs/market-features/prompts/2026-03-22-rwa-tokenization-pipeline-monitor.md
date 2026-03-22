# FEATURE: RWA Tokenization Pipeline Monitor

**Origin:** Real World Assets / RWA Tokenization (`cr-rwa-tokenization`) rotation on 2026-03-22
**Gap Category:** cross_vertical
**Priority Score:** 85 | **Cross-Vertical:** Yes
**Card ID:** 55e73b7c-6e02-4700-928c-95b99b859abd

## Context

### Why This Exists
Real-world asset tokenization is the fastest-growing intersection of crypto and traditional finance, directly relevant to Winston's core verticals: tokenized real estate funds overlap with REPE deal structures, and on-chain credit instruments are live comps for the credit decisioning module. During crypto rotation sessions, Winston had no data on RWA issuance volume, protocol TVL by asset category, or yield benchmarks — analysts could not assess this space without leaving the platform.

### What Couldn't Be Done
Winston could not report: total RWA on-chain TVL, breakdown by category (real estate, treasuries, private credit, commodities), protocol-level market share (Ondo, Centrifuge, Maple, RealT), or yield comparison between on-chain RWA instruments and their traditional equivalents (10Y Treasury, CMBS, HY credit). It also had no bridge to surface this data inside REPE or Credit modules.

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-cr-rwa-tokenization.md` (will be created by the market rotation engine on next run)

---

## Specification

### What It Does
Aggregates on-chain RWA data from DeFiLlama's RWA category and protocol-specific APIs. Displays: (1) total RWA TVL trend (90 days), (2) TVL breakdown by asset category (pie/donut chart), (3) protocol league table with market share, (4) yield comparison table: on-chain RWA yield vs. 10Y Treasury / CMBS / HY credit, (5) recent issuance events feed. Cross-vertical: surfaces tokenized real estate fund flow in the REPE research panel and on-chain credit benchmarks in the Credit module context.

### Data Layer

**New Tables (additive only):**
```sql
-- RWA TVL snapshot by protocol and category
CREATE TABLE public.rwa_tvl_snapshot (
  snapshot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  pulled_at       timestamptz NOT NULL DEFAULT now(),
  total_tvl_usd   numeric(20,2) NOT NULL,
  tvl_by_category jsonb NOT NULL DEFAULT '{}',
  -- shape: { "treasuries": 2100000000, "real_estate": 450000000,
  --          "private_credit": 890000000, "commodities": 120000000 }
  protocol_breakdown jsonb NOT NULL DEFAULT '[]',
  -- shape: [{ "protocol": "Ondo", "tvl_usd": 780000000, "category": "treasuries",
  --           "apy": 5.12, "chain": "ethereum" }, ...]
  yield_comparisons jsonb NOT NULL DEFAULT '{}',
  -- shape: { "ondo_usdy": 5.12, "maple_cash": 6.40, "treasury_10y": 4.28,
  --          "cmbs_aaa": 5.80, "hy_credit": 7.90 }
  issuance_events jsonb NOT NULL DEFAULT '[]',
  -- shape: [{ "date": "2026-03-21", "protocol": "Centrifuge", "asset": "Trade Finance",
  --           "amount_usd": 12000000, "description": "..." }, ...]
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_rwa_tvl_snapshot_pulled_at
  ON public.rwa_tvl_snapshot (pulled_at DESC);

ALTER TABLE public.rwa_tvl_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_read_rwa_tvl" ON public.rwa_tvl_snapshot
  FOR SELECT USING (tenant_id = auth.uid() OR tenant_id IS NULL);
```

**Data Sources:**
- **DeFiLlama RWA API:** `GET https://api.llama.fi/protocols` filtered to `category=RWA` — free, no API key required; returns TVL, chain, category per protocol
- **DeFiLlama TVL history:** `GET https://api.llama.fi/protocol/{slug}` — 90-day TVL history per protocol
- **Ondo Finance API / public docs:** Yield rates for USDY, OUSG instruments (scrape or manual seed)
- **FRED API:** 10Y Treasury yield (`DGS10`), HY OAS spread (`BAMLH0A0HYM2`) — env var `FRED_API_KEY`
- **CMBS benchmark:** Weekly manual seed from CRED iQ / Trepp public data (initially static, refresh weekly)
- **Refresh cadence:** Daily at 7:00 AM UTC

**Data Pipeline:**
```
DeFiLlama RWA API + FRED API
  → backend/app/services/rwa_monitor_service.py (fetch + normalize)
  → public.rwa_tvl_snapshot (storage)
  → GET /api/v1/market/rwa/latest (consumption)
  → GET /api/v1/market/rwa/history (consumption)
  → RWAMonitorPanel (frontend render)
  → REPE research context panel (cross-vertical)
  → Credit decisioning context block (cross-vertical)
```

---

### Backend

**New Service File(s):**
- `backend/app/services/rwa_monitor_service.py`
  - `fetch_and_store_rwa_snapshot(tenant_id: UUID | None) -> RWASnapshot`
    - Calls DeFiLlama for all RWA-category protocols + their TVL
    - Calls FRED for 10Y Treasury and HY spread
    - Computes yield_comparisons dict (on-chain vs. traditional)
    - Assembles issuance_events from recent DeFiLlama TVL deltas
    - Persists to `rwa_tvl_snapshot`
    - Returns structured `RWASnapshot` dataclass
  - `get_latest_rwa_snapshot(tenant_id: UUID | None) -> RWASnapshot | None`
    - Reads most recent row from `rwa_tvl_snapshot`
  - `get_rwa_cross_vertical_context() -> dict`
    - Returns a lightweight dict for REPE + Credit context panels:
      `{ "repe_note": str, "credit_note": str, "total_tvl_usd": float, "re_tvl_usd": float }`

**New Route(s):**
- `GET /api/v1/market/rwa/latest`
  - Request: `{ tenant_id?: uuid }`
  - Response:
    ```json
    {
      "snapshot_id": "uuid",
      "pulled_at": "ISO8601",
      "total_tvl_usd": 3560000000,
      "tvl_by_category": {
        "treasuries": 2100000000,
        "real_estate": 450000000,
        "private_credit": 890000000,
        "commodities": 120000000
      },
      "protocol_breakdown": [...],
      "yield_comparisons": {
        "ondo_usdy": 5.12,
        "maple_cash": 6.40,
        "treasury_10y": 4.28,
        "cmbs_aaa": 5.80,
        "hy_credit": 7.90
      },
      "issuance_events": [...]
    }
    ```
- `GET /api/v1/market/rwa/history`
  - Request: `{ days?: int = 90, tenant_id?: uuid }`
  - Response: `{ snapshots: [{ pulled_at, total_tvl_usd, tvl_by_category }] }`
- `GET /api/v1/market/rwa/cross-vertical-context`
  - Response: `{ repe_note, credit_note, total_tvl_usd, re_tvl_usd }`
  - Used by REPE and Credit modules to inject RWA context

**Dependencies:**
- `httpx` (already available) — DeFiLlama + FRED calls
- `FRED_API_KEY` env var
- No new pip packages required

---

### Frontend

**New Component:**
- Name: `RWAMonitorPanel`
- Location: `repo-b/src/components/market/RWAMonitorPanel.tsx`
- Props:
  ```typescript
  interface RWAMonitorPanelProps {
    tenantId?: string;
    compact?: boolean; // true = TVL total + category donut only
  }
  ```

**Visualization:**
- **TVL trend:** 90-day area chart (total TVL) — `recharts AreaChart`
- **Category breakdown:** Donut chart with legend (treasuries/real estate/private credit/commodities) — `recharts PieChart`
- **Protocol league table:** Sortable table: Protocol | Category | TVL | APY | Chain — standard HTML table with Tailwind styling
- **Yield comparison:** Horizontal grouped bar chart — on-chain yield vs. traditional equivalent — `recharts BarChart`
- **Issuance events:** Scrollable feed with date, protocol, asset type, amount
- **Interaction:** Click protocol row in league table highlights that protocol's TVL band in the area chart; hover yield bar shows exact values

**Integration Point:**
- **Primary:** Market Intelligence tab → Crypto sub-tab → RWA section (additive)
- **Cross-vertical REPE:** REPE research panel → "Market Comps" section → RWA context card (`compact=true`)
- **Cross-vertical Credit:** Credit module context sidebar → RWA benchmark row (yield_comparisons only)
- **Navigation:** Dashboard → Market Intelligence → Crypto → RWA

---

### Cross-Vertical Hooks

- **→ REPE:** `GET /api/v1/market/rwa/cross-vertical-context` injects tokenized real estate TVL and growth rate into the REPE underwriting session context — "On-chain tokenized RE: $450M TVL (+12% 30d). Ondo/RealT structures suggest 5–7% target yield for institutional token tranches."
- **→ Credit:** Yield comparison table surfaces in the credit decisioning context block — "On-chain private credit benchmarks: Maple Cash 6.40%, Centrifuge 8.20% vs. HY OAS 7.90%. Useful for alternative lending rate context."
- **→ PDS:** Not applicable for initial build.

---

## Verification

1. **API data test:** `GET /api/v1/market/rwa/latest` returns a JSON body with `total_tvl_usd > 0`, `tvl_by_category` containing at least 2 keys, and `yield_comparisons.treasury_10y > 0`. HTTP 200.
2. **Persistence test:** After `fetch_and_store_rwa_snapshot(None)`, a row exists in `public.rwa_tvl_snapshot` with `pulled_at` within 60 seconds of now and `total_tvl_usd > 0`.
3. **Frontend render test:** `RWAMonitorPanel` renders without error in both `compact=true` and `compact=false` modes; the recharts donut chart renders at least 2 segments when provided mock `tvl_by_category` data with 2+ keys.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: `fetch_and_store_rwa_snapshot()` → row in DB → `GET /api/v1/market/rwa/latest` → `RWAMonitorPanel` renders TVL trend and category donut
5. No regressions: existing tests still pass

---

## Repo Safety Contract

```
PROTECTED — DO NOT MODIFY:
- Existing REPE calculation engines (DCF, waterfall, IRR)
- Existing credit decisioning services (credit.py, credit_decisioning.py)
- Existing PDS dashboard services
- Supabase RLS policies on all existing tables
- Any table in schemas 274, 275, 277 (credit core, object model, workflow)
- Meridian demo environment assets and seed data

ADDITIVE ONLY:
- rwa_tvl_snapshot: new table only
- rwa_monitor_service.py: new file only
- New routes are additive endpoints
- RWAMonitorPanel: new component only
- Cross-vertical context: injected via new API calls, never modifying existing service files
```
