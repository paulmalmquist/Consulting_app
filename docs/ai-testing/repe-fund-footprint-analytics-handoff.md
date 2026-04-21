# REPE Fund Footprint — Map + Analytics Panel System

## Objective

Transform the current `Fund Footprint` section from a static pin map into a dual-pane geospatial + analytical decision surface:

- left: spatial context
- right: analytics tied to selection

The feature must answer:

- where are we exposed
- how are those markets performing
- what's changing
- where should we act

## Active ChatGPT review context

- project: `WInston - Re PE`
- chat: `Execution Delta Request`
- the feature brief is already loaded into that thread as the current direction

## Current code ownership

- page embedding the section:
  - `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`
- current section shell:
  - `repo-b/src/components/repe/fund/FundFootprintMap.tsx`
- current leaflet renderer:
  - `repo-b/src/components/repe/fund/FundFootprintMapInner.tsx`
- current backend seam:
  - `backend/app/routes/re_v2.py` `GET /api/re/v2/funds/asset-map`
- current frontend contract:
  - `repo-b/src/lib/bos-api.ts` `getAssetMapPoints`

## Current state

Today the feature is still:

- one full-width map
- status filter chips
- static asset pins
- popup details

No market aggregation, no right analytics rail, no breadcrumbed selection model, no trust/risk overlay, and no server-side pre-aggregated market analytics.

## Phase 1 target for this sprint

Deliver the smallest credible version of:

1. two-column layout
   - desktop `3fr / 2fr`
   - tablet more balanced split
   - mobile stacked

2. upgraded asset markers
   - size by NAV or basis
   - color by status
   - shape by asset condition/type proxy where possible
   - richer tooltip

3. map-driven analytics panel
   - default portfolio summary
   - asset-selected view
   - market-selected view can be minimal but the state model should support it

4. simple market aggregation
   - server-side grouped market rows
   - toggle between `assets` and `markets`

## Data rules

- authoritative-state metrics only for financial values
- no legacy + authoritative mixing
- null values must remain explicit
- server-side pre-aggregation, not client-only rollups

## Suggested implementation shape

### Frontend

- replace the current single-column footprint block with a dual-pane layout component
- keep the map in Leaflet for now
- add selection state:
  - `selection.mode = portfolio | market | asset`
  - `selection.market`
  - `selection.assetId`
- add top filters that drive both panes:
  - fund
  - strategy
  - status
  - quarter

### Backend

Add a new fund-footprint analytics route rather than overloading the raw pin route too much:

- keep `/api/re/v2/funds/asset-map` for raw pins if useful
- add a richer route for pre-aggregated map + panel payload, for example:
  - `/api/re/v2/funds/footprint-analytics`

That payload should include:

- `asset_points`
- `market_rollups`
- `portfolio_summary`
- `selection_defaults`
- trust/risk flags by asset or market where available

### Minimal market rollup fields

- market name
- asset count
- total nav
- avg irr
- avg occupancy
- trust / integrity warning counts

## Live context that still matters

The Meridian fund-detail page is live at:

`/lab/env/a1b2c3d4-0001-0001-0003-000000000001/re/funds/a1b2c3d4-0003-0030-0001-000000000001`

The top strip removal is already live. The footprint section shown there is the exact surface being replaced.

## Claude execution ask

Implement Phase 1 in small reviewable chunks:

1. new backend payload and contract
2. new dual-pane shell component
3. asset marker upgrades + map selection wiring
4. analytics panel default + asset + basic market views
5. tests and deploy notes

Keep the change set coherent, but do not stop at planning. This is an execution handoff, not a brainstorm.
