# FEATURE: Regime Escalation Sentinel

**Origin:** ma-regime-classifier rotation on 2026-03-22
**Gap Category:** alert
**Priority Score:** 98.70 | **Cross-Vertical:** Yes
**Card ID:** d8d20773-263d-46f6-9dd1-dbe55d4c2eeb

## Context

### Why This Exists
The RISK_OFF_DEFENSIVE regime report from the 2026-03-22 rotation identified three confirmed escalation triggers (VIX > 35, HY OAS > 400bps, DXY > 105) that signal potential regime worsening toward STRESS. No automated monitoring existed to detect these threshold breaches, meaning regime deterioration could go undetected across all Winston verticals.

### What Couldn't Be Done
Winston had no mechanism to proactively alert users when macro stress indicators breached critical thresholds. Analysts had to manually check individual data points to assess whether regime conditions were worsening, with no cross-vertical notification when stress events occurred.

### Segment Intelligence Brief Reference
docs/market-intelligence/2026-03-22-ma-regime-classifier.md

---

## Specification

### What It Does
A sentinel polling loop that checks macro stress indicators every 15 minutes during market hours. When any single threshold is breached, it fires an alert via SSE and persists the event. When multiple thresholds breach simultaneously, it promotes the regime to STRESS and issues a cross-vertical advisory to REPE, Credit, and PDS modules. Configurable thresholds via admin API.

### Data Layer

**New Tables (additive only):**
```sql
CREATE TABLE regime_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('SINGLE_BREACH', 'MULTI_BREACH', 'REGIME_PROMOTION')),
  trigger_signals JSONB NOT NULL,
  regime_before TEXT,
  regime_after TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL', 'EMERGENCY')),
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE regime_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON regime_alerts
  USING (env_id = current_setting('app.env_id', true));

CREATE INDEX idx_regime_alerts_env_created ON regime_alerts(env_id, created_at DESC);
CREATE INDEX idx_regime_alerts_unacked ON regime_alerts(env_id, acknowledged) WHERE acknowledged = false;

COMMENT ON TABLE regime_alerts IS 'Regime escalation alerts fired by the sentinel service. Owned by market_rotation_engine module.';

CREATE TABLE regime_sentinel_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  indicator TEXT NOT NULL,
  threshold_value NUMERIC(10,4) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ABOVE', 'BELOW')),
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(env_id, indicator)
);

ALTER TABLE regime_sentinel_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON regime_sentinel_config
  USING (env_id = current_setting('app.env_id', true));

COMMENT ON TABLE regime_sentinel_config IS 'Configurable thresholds for the regime escalation sentinel. Owned by market_rotation_engine module.';
```

**Data Sources:**
- FRED API (VIX, HY OAS via BAMLH0A0HYM2, DXY) -- 15-minute polling during market hours (9:30 AM - 4:00 PM ET)
- market_regime_snapshot table (current regime state from Regime Classifier)

**Data Pipeline:**
Sentinel polling loop (15 min) -> Fetch current values for each monitored indicator -> Compare against regime_sentinel_config thresholds -> If breach detected: insert into regime_alerts + emit SSE event -> If multi-breach: update regime classification to STRESS + cross-vertical advisory

---

### Backend

**New Service File(s):**
- `backend/app/services/regime_sentinel_service.py`
  - `check_thresholds(env_id: str) -> list[dict]` -- Fetches current indicator values and checks against configured thresholds
  - `fire_alert(env_id: str, business_id: str, alert_type: str, trigger_signals: dict, severity: str) -> RegimeAlert` -- Persists alert and emits SSE event
  - `promote_regime(env_id: str, business_id: str, trigger_signals: dict) -> None` -- Promotes current regime to STRESS and fires cross-vertical advisory
  - `acknowledge_alert(alert_id: str, user_id: str) -> RegimeAlert` -- Marks an alert as acknowledged
  - `run_sentinel_loop(env_id: str, business_id: str) -> None` -- Main polling loop entry point

**New Route(s):**
- `GET /api/v1/market/alerts/latest`
  - Request: query params `env_id, limit=20, unacknowledged_only=false`
  - Response: `{ alerts: RegimeAlert[] }`

- `POST /api/v1/market/alerts/{alert_id}/acknowledge`
  - Request: `{ user_id: string }`
  - Response: `{ alert: RegimeAlert }`

- `GET /api/v1/market/sentinel/config`
  - Request: query params `env_id`
  - Response: `{ config: RegimeSentinelConfig[] }`

- `PUT /api/v1/market/sentinel/config`
  - Request: `{ env_id, indicator, threshold_value, direction, enabled }`
  - Response: `{ config: RegimeSentinelConfig }`

- `GET /api/v1/market/alerts/stream`
  - SSE endpoint for real-time alert streaming
  - Response: Server-Sent Events with `{ alert_type, severity, trigger_signals, created_at }`

**Dependencies:**
- `httpx` (async HTTP for FRED API)
- `sse-starlette` (SSE support for FastAPI)
- `FRED_API_KEY` env var

---

### Frontend

**New Components:**
- Name: `RegimeEscalationBanner`
- Location: `repo-b/src/components/market/RegimeEscalationBanner.tsx`
- Props: `{ envId: string }`
- Behavior: Global banner that appears at top of any Winston page when an unacknowledged CRITICAL or EMERGENCY alert exists. Dismisses on acknowledge.

- Name: `RegimeAlertFeed`
- Location: `repo-b/src/components/market/RegimeAlertFeed.tsx`
- Props: `{ envId: string, limit?: number }`
- Behavior: Scrollable feed of recent alerts with severity badges, timestamps, and acknowledge buttons.

**Visualization:**
- Chart type: Timeline feed with severity color-coding (WARNING=amber, CRITICAL=orange, EMERGENCY=red)
- Library: recharts (for any historical alert frequency charts)
- Interaction: Click to acknowledge; hover for trigger signal detail; link to Regime Classifier for full context

**Integration Point:**
- RegimeEscalationBanner: Global app shell (always visible when active alerts exist)
- RegimeAlertFeed: Market Intelligence dashboard, below Regime Classifier widget

---

### Cross-Vertical Hooks

- **-> REPE:** CRITICAL/EMERGENCY alerts trigger a contextual warning in REPE acquisition underwriting screens ("Market regime STRESS detected -- review cap rate assumptions")
- **-> Credit:** Multi-breach events push a tightening advisory to credit decisioning ("Elevated macro stress -- consider DTI/LTV buffer increases")
- **-> PDS:** STRESS regime promotion surfaces as a market conditions alert on PDS project dashboards

---

## Verification

1. **Single breach detection:** Set VIX threshold to 20 (below current value); run sentinel check; verify a SINGLE_BREACH alert is created in regime_alerts with severity WARNING and correct trigger_signals JSON
2. **Multi-breach promotion:** Configure all 3 thresholds below current values; run sentinel check; verify a REGIME_PROMOTION alert is created with severity EMERGENCY and regime_after = 'STRESS'
3. **SSE stream delivery:** Connect to `/api/v1/market/alerts/stream`; trigger a breach; verify the SSE event arrives within 5 seconds with correct payload shape

---

## Proof of Execution Requirements

1. Code compiles / service starts without errors
2. All 3 verification tests pass
3. Route responds with correct shape
4. Smoke test: end-to-end flow from FRED API poll -> threshold comparison -> alert persistence -> SSE delivery -> banner render
5. No regressions: existing tests still pass

---

## Repo Safety Contract

```
PROTECTED -- DO NOT MODIFY:
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
