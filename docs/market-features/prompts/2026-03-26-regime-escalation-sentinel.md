# FEATURE: Regime Escalation Sentinel

**Origin:** ma-regime-classifier rotation on 2026-03-22
**Gap Category:** alert
**Priority Score:** 98.70 | **Cross-Vertical:** Yes
**Card ID:** d8d20773-263d-46f6-9dd1-dbe55d4c2eeb

## Context

### Why This Exists
During the March 22 RISK_OFF_DEFENSIVE regime classification, three explicit escalation thresholds to RISK_OFF_PANIC were identified: VIX > 35, HY OAS > 400bps, and DXY > 105. Winston has no automated mechanism to detect these threshold breaches between scheduled rotation cycles.

### What Couldn't Be Done
Winston could not proactively alert when regime escalation conditions were breached. All verticals (REPE, Credit, PDS) operate against stale regime state until the next scheduled daily rotation, meaning analysts only discover worsening conditions retroactively.

### Segment Intelligence Brief Reference
`docs/market-intelligence/2026-03-22-ma-regime-classifier.md`

---

## Specification

### What It Does
A sentinel polling loop (every 15 minutes during market hours) that monitors VIX, HY OAS, and DXY against configurable thresholds. When any single trigger breaches, an alert is inserted and streamed via SSE. When 2+ simultaneous breaches occur, the system promotes the current `market_regime_snapshot` label to `stress` and fires a cross-vertical advisory to REPE, Credit, and PDS modules. Analysts see a persistent banner and scrollable alert feed in the UI.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE public.regime_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  trigger_name TEXT NOT NULL,          -- 'vix_breach', 'hy_oas_breach', 'dxy_breach'
  trigger_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',  -- 'warning', 'critical'
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES profiles(id),
  acknowledged_at TIMESTAMPTZ,
  snapshot_id UUID,                    -- optional link to market_regime_snapshot
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.regime_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.regime_alerts
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE TABLE public.regime_sentinel_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  trigger_name TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  poll_interval_minutes INT NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, trigger_name)
);

ALTER TABLE public.regime_sentinel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.regime_sentinel_config
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

**Data Sources:**
- FRED API (`VIXCLS`, `BAMLH0A0HYM2`) — refreshed every 15 min during market hours
- FRED API or Yahoo Finance (`DX-Y.NYB`) for DXY — refreshed every 15 min
- Internal `market_regime_snapshot` table for current regime label

**Data Pipeline:**
Source (FRED/Yahoo) → `regime_sentinel_service.poll_triggers()` → threshold comparison → if breach: INSERT into `regime_alerts` + SSE push → if multi-breach: UPDATE `market_regime_snapshot.label` to `stress` + cross-vertical advisory dispatch

---

### Backend

**New Service File(s):**
- `backend/app/services/regime_sentinel_service.py`
  - `poll_triggers(tenant_id: UUID) -> list[AlertEvent]` — Fetches live values for VIX, HY OAS, DXY; compares against `regime_sentinel_config` thresholds; returns list of breach events
  - `process_breach(tenant_id: UUID, alert: AlertEvent) -> RegimeAlert` — Inserts alert record, checks for multi-breach promotion, dispatches cross-vertical advisory if needed
  - `acknowledge_alert(alert_id: UUID, user_id: UUID) -> RegimeAlert` — Marks alert as acknowledged
  - `get_sentinel_config(tenant_id: UUID) -> list[SentinelConfig]` — Returns current threshold configuration
  - `update_sentinel_config(tenant_id: UUID, trigger_name: str, threshold: float, enabled: bool) -> SentinelConfig` — Updates a threshold config

**New Route(s):**
- `GET /api/v1/market/alerts/latest`
  - Request: query params `limit` (int, default 20), `acknowledged` (bool, optional)
  - Response: `{ alerts: RegimeAlert[], total: int }`
- `POST /api/v1/market/alerts/{alert_id}/acknowledge`
  - Request: `{}`
  - Response: `{ alert: RegimeAlert }`
- `GET /api/v1/market/sentinel/config`
  - Request: none
  - Response: `{ triggers: SentinelConfig[] }`
- `PUT /api/v1/market/sentinel/config`
  - Request: `{ trigger_name: str, threshold_value: float, enabled: bool }`
  - Response: `{ trigger: SentinelConfig }`
- `GET /api/v1/market/alerts/stream`
  - SSE endpoint streaming `AlertEvent` objects in real-time

**Dependencies:**
- `httpx` (already in project) for FRED API calls
- `sse-starlette` for SSE streaming endpoint
- Env var: `FRED_API_KEY`

---

### Frontend

**New Components:**
- Name: `RegimeEscalationBanner`
  - Location: `repo-b/src/components/market/RegimeEscalationBanner.tsx`
  - Props: `{ alerts: RegimeAlert[], onAcknowledge: (id: string) => void }`
  - Persistent top-of-page banner, color-coded by severity (amber = warning, red = critical). Shows most recent unacknowledged alert with dismiss action.

- Name: `RegimeAlertFeed`
  - Location: `repo-b/src/components/market/RegimeAlertFeed.tsx`
  - Props: `{ alerts: RegimeAlert[], loading: boolean }`
  - Scrollable feed of recent alerts with timestamp, trigger name, value vs threshold, and acknowledgement status.

**Visualization:**
- Chart type: Timeline / event markers overlaid on regime history
- Library: recharts
- Interaction: hover for alert detail, click to acknowledge

**Integration Point:**
- RegimeEscalationBanner: global app shell header (visible on all pages when unacknowledged alerts exist)
- RegimeAlertFeed: Market Intelligence dashboard tab, new "Alerts" sub-section

---

### Cross-Vertical Hooks

- **→ REPE:** On multi-breach stress promotion, dispatch advisory to REPE underwriting context: "Regime escalated to STRESS — cap rate assumptions may need revision"
- **→ Credit:** On multi-breach, fire credit tightening advisory: "Regime STRESS — review DTI thresholds and collateral haircuts"
- **→ PDS:** On multi-breach, notify PDS: "Regime STRESS — project financing conditions may be impacted"

---

## Verification

1. **Single-trigger breach test:** Set VIX threshold to 20 in sentinel_config, inject a VIX reading of 25. Verify: alert record created in `regime_alerts` with `trigger_name = 'vix_breach'`, SSE event received by connected client, banner displays in UI.
2. **Multi-breach promotion test:** Simultaneously breach VIX and HY OAS thresholds. Verify: `market_regime_snapshot.label` is promoted to `stress`, cross-vertical advisory records created, RegimeEscalationBanner shows red/critical state.
3. **Acknowledge flow test:** POST to acknowledge endpoint for an active alert. Verify: alert marked `acknowledged = true` with user ID and timestamp, banner clears if no remaining unacknowledged alerts.

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from FRED API mock → sentinel poll → alert insert → SSE stream → banner render
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
- New tables must be CREATE TABLE, never ALTER existing tables
- New services must be new files, never overwrite existing service files
- New routes must be new files or additive endpoints in existing route files
- Frontend: new components, never modify existing component logic
```
