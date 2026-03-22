# LLM Intent Hop + Data Validation + Query Transparency

## Goal
Upgrade the dashboard generate pipeline from 100% deterministic regex matching to a 3-layer system:
1. **LLM intent extraction** via FastAPI AI Gateway (with regex fallback)
2. **Data availability validation** — tell users which widgets will show dashes and WHY
3. **Per-widget query transparency** — expandable panels showing what API call backs each widget

## Architecture

```
User prompt → [LLM Intent Extraction] → DashboardIntent
                                            ↓
                                   [Section Composition]
                                            ↓
                                   [Data Availability Check] → DataAvailability[]
                                            ↓
                                   [Query Manifest Builder] → WidgetQueryManifest[]
                                            ↓
                                   Response: spec + data_availability + query_manifest + intent_source
```

The LLM hop goes through the FastAPI backend (`backend/`), everything else stays in the generate route (`repo-b/`).

---

## PHASE 1: Data Validation Layer

### Step 1.1: Add types to `repo-b/src/lib/dashboards/types.ts`

Add these interfaces alongside the existing types:

```typescript
/** Per-widget data availability check result */
export interface DataAvailability {
  widget_id: string;
  has_data: boolean;
  has_budget: boolean;
  missing_reason?: string;
}

/** Per-widget query transparency manifest entry */
export interface WidgetQueryManifest {
  widget_id: string;
  widget_type: string;
  api_route: string;
  params: Record<string, string>;
  description: string;
}
```

### Step 1.2: Create `repo-b/src/lib/dashboards/data-validator.ts`

```typescript
/**
 * Data Availability Validator
 *
 * After composing a dashboard spec, checks whether actual data exists
 * in the DB for each widget's metrics + entities + quarter.
 * Returns per-widget availability with human-readable reasons for gaps.
 */

import type { DataAvailability } from "./types";

interface WidgetSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

/**
 * Convert a quarter string like "2026Q1" to the 3 month-start dates it covers.
 */
function quarterToMonths(quarter: string): string[] {
  const year = parseInt(quarter.slice(0, 4), 10);
  const qn = parseInt(quarter.slice(-1), 10);
  const startMonth = (qn - 1) * 3 + 1;
  return Array.from({ length: 3 }, (_, i) =>
    `${year}-${String(startMonth + i).padStart(2, "0")}-01`
  );
}

export async function validateDataAvailability(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  widgets: WidgetSpec[],
  entityIds: string[],
  quarter: string,
  businessId: string,
  envId: string,
  entityType: string,
): Promise<DataAvailability[]> {
  if (!entityIds?.length || !quarter) {
    return widgets.map((w) => ({
      widget_id: w.id,
      has_data: false,
      has_budget: false,
      missing_reason: !entityIds?.length
        ? "No entities selected"
        : "No quarter specified",
    }));
  }

  const months = quarterToMonths(quarter);

  // Batch check: do actuals exist for these entities in this quarter?
  let hasActuals = false;
  let hasBudget = false;
  let hasFundMetrics = false;

  try {
    if (entityType === "fund") {
      // Fund metrics come from re_fund_quarter_metrics
      const fundRes = await pool.query(
        `SELECT EXISTS(
          SELECT 1 FROM re_fund_quarter_metrics
          WHERE fund_id = ANY($1::uuid[]) AND quarter = $2
        ) AS has_data`,
        [entityIds, quarter],
      );
      hasFundMetrics = fundRes.rows[0]?.has_data === true;
    }

    // Asset/investment actuals from acct_normalized_noi_monthly
    const actualsRes = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM acct_normalized_noi_monthly
        WHERE env_id = $1 AND business_id = $2::uuid
          AND asset_id = ANY($3::uuid[])
          AND period_month = ANY($4::date[])
      ) AS has_data`,
      [envId, businessId, entityIds, months],
    );
    hasActuals = actualsRes.rows[0]?.has_data === true;

    // Budget data from uw_noi_budget_monthly (need a uw_version)
    const budgetRes = await pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM uw_noi_budget_monthly b
        JOIN uw_version v ON v.id = b.uw_version_id
        WHERE b.env_id = $1 AND b.business_id = $2::uuid
          AND b.asset_id = ANY($3::uuid[])
          AND b.period_month = ANY($4::date[])
      ) AS has_data`,
      [envId, businessId, entityIds, months],
    );
    hasBudget = budgetRes.rows[0]?.has_data === true;
  } catch (err) {
    console.error("[data-validator] Query error:", err);
  }

  // Apply per-widget logic
  return widgets.map((w) => {
    const widgetUsesComparison = (w.config.comparison as string) === "budget"
      || (w.config.title as string)?.toLowerCase()?.includes("budget")
      || (w.config.title as string)?.toLowerCase()?.includes("variance");

    const isFundWidget = entityType === "fund" && ["metrics_strip", "trend_line"].includes(w.type);

    let has_data = hasActuals;
    let missing_reason: string | undefined;

    if (isFundWidget) {
      has_data = hasFundMetrics;
      if (!has_data) {
        missing_reason = `No fund metrics found for ${quarter}. Run quarter close to compute IRR/TVPI/DPI.`;
      }
    } else if (!hasActuals) {
      missing_reason = `No actual financial data for ${quarter}. Upload actuals or check asset mappings.`;
    }

    return {
      widget_id: w.id,
      has_data,
      has_budget: widgetUsesComparison ? hasBudget : true,
      missing_reason: missing_reason
        || (widgetUsesComparison && !hasBudget ? `No budget data for ${quarter}. Upload a budget version.` : undefined),
    };
  });
}
```

---

## PHASE 2: Query Manifest Builder

### Step 2.1: Create `repo-b/src/lib/dashboards/query-manifest-builder.ts`

```typescript
/**
 * Query Manifest Builder
 *
 * For each widget in a dashboard spec, generates a human-readable
 * description of the API call that will fetch its data.
 */

import type { WidgetQueryManifest } from "./types";
import { METRIC_MAP } from "./metric-catalog";

interface WidgetSpec {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export function buildQueryManifest(
  widgets: WidgetSpec[],
  entityType: string,
  entityIds: string[],
  quarter: string,
): WidgetQueryManifest[] {
  const entityPath = entityType === "fund" ? "funds"
    : entityType === "investment" ? "investments"
    : "assets";

  const idPlaceholder = entityIds?.[0] || "{id}";

  return widgets.map((w) => {
    const metrics = (w.config.metrics as Array<{ key: string }>) || [];
    const metricLabels = metrics
      .map((m) => METRIC_MAP.get(m.key)?.label || m.key)
      .join(", ");

    switch (w.type) {
      case "metrics_strip":
      case "metric_card":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/quarter-state/${quarter}`,
          params: { metrics: metrics.map((m) => m.key).join(",") },
          description: `Fetches ${metricLabels || "KPI values"} for ${quarter}`,
        };

      case "trend_line":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: "IS",
            period_type: (w.config.period_type as string) || "quarterly",
            scenario: "actual",
          },
          description: `${metricLabels || "Metric"} trend over time from quarterly statements`,
        };

      case "bar_chart":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: "IS",
            period_type: "quarterly",
            scenario: "actual",
          },
          description: `Bar chart comparing ${metricLabels || "financial metrics"} for ${quarter}`,
        };

      case "waterfall":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: { statement: "IS", period_type: "quarterly" },
          description: `NOI bridge waterfall: EGI → Operating Expenses → NOI`,
        };

      case "statement_table": {
        const stmt = (w.config.statement as string) || "IS";
        const stmtLabel = stmt === "IS" ? "Income Statement"
          : stmt === "CF" ? "Cash Flow Statement"
          : stmt === "BS" ? "Balance Sheet"
          : "Financial Statement";
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: {
            statement: stmt,
            period_type: (w.config.period_type as string) || "quarterly",
            period: quarter,
            scenario: "actual",
            comparison: (w.config.comparison as string) || "none",
          },
          description: `Full ${stmtLabel} for ${quarter}`,
        };
      }

      case "comparison_table":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/variance/noi`,
          params: { quarter, entity_type: entityType },
          description: `Budget variance comparison across entities for ${quarter}`,
        };

      case "text_block":
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: "none",
          params: {},
          description: `Static text/notes block — no data fetch required`,
        };

      default:
        return {
          widget_id: w.id,
          widget_type: w.type,
          api_route: `/api/re/v2/${entityPath}/${idPlaceholder}/statements`,
          params: { statement: "IS", period_type: "quarterly" },
          description: `${w.type} widget fetching statement data for ${quarter}`,
        };
    }
  });
}
```

### Step 2.2: Add per-widget expandable info panel to `WidgetRenderer.tsx`

In the existing `WidgetRenderer` component, add:

1. A small info icon button (ℹ️) in the widget header area, only visible when `isEditing` is true
2. When clicked, expands a panel below the widget header showing:
   - **Data Source:** the API route and params from `query_manifest`
   - **Description:** the English explanation
   - **Data Status:** green checkmark if `has_data: true`, yellow warning if `has_data: false` with the `missing_reason`

The `query_manifest` and `data_availability` arrays need to be passed down from the dashboard page. Add optional props:

```typescript
interface Props {
  widget: DashboardWidget;
  envId: string;
  businessId: string;
  quarter?: string;
  onConfigure?: () => void;
  isEditing?: boolean;
  queryManifest?: WidgetQueryManifest;  // NEW
  dataAvailability?: DataAvailability;   // NEW
}
```

Add a collapsible panel component inside the widget card:

```tsx
{isEditing && (queryManifest || dataAvailability) && (
  <div className="border-t border-gray-100 mt-2">
    <button
      onClick={() => setShowInfo(!showInfo)}
      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 py-1 px-2"
    >
      {showInfo ? "▾" : "▸"} Query Info
    </button>
    {showInfo && (
      <div className="px-2 pb-2 text-xs text-gray-500 space-y-1">
        {queryManifest && (
          <>
            <div><span className="font-medium">Source:</span> {queryManifest.api_route}</div>
            <div><span className="font-medium">Params:</span> {JSON.stringify(queryManifest.params)}</div>
            <div>{queryManifest.description}</div>
          </>
        )}
        {dataAvailability && !dataAvailability.has_data && (
          <div className="text-amber-600 flex items-center gap-1">
            ⚠ {dataAvailability.missing_reason}
          </div>
        )}
        {dataAvailability?.has_data && (
          <div className="text-green-600">✓ Data available</div>
        )}
      </div>
    )}
  </div>
)}
```

### Step 2.3: Update `page.tsx` to pass manifest and availability to widgets

In the dashboard page (`repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx`):

1. Add state for the new response fields:
```typescript
const [dataAvailability, setDataAvailability] = useState<DataAvailability[]>([]);
const [queryManifest, setQueryManifest] = useState<WidgetQueryManifest[]>([]);
const [intentSource, setIntentSource] = useState<string>("regex");
```

2. In `handleGenerate`, capture the new fields:
```typescript
if (data.spec?.widgets) {
  setWidgets(data.spec.widgets);
  setDashboardName(data.name || "...");
  setLayoutArchetype(data.layout_archetype);
  setView("builder");
  setIsEditing(true);
  // NEW
  setDataAvailability(data.data_availability || []);
  setQueryManifest(data.query_manifest || []);
  setIntentSource(data.intent_source || "regex");
}
```

3. When rendering widgets, pass the per-widget data:
```tsx
<WidgetRenderer
  widget={w}
  envId={params.envId}
  businessId={businessId}
  quarter={quarter}
  isEditing={isEditing}
  queryManifest={queryManifest.find(m => m.widget_id === w.id)}
  dataAvailability={dataAvailability.find(d => d.widget_id === w.id)}
/>
```

---

## PHASE 3: LLM Intent Extraction via FastAPI Gateway

### Step 3.1: Create `backend/app/routes/ai_intent.py`

```python
"""
Thin endpoint for structured dashboard intent extraction.
Uses OpenAI directly (not the full AI Gateway streaming pipeline)
to extract a JSON intent object from a natural language prompt.
"""

import os
import json
import time
import logging
from fastapi import APIRouter
from pydantic import BaseModel
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai-intent"])

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

INTENT_MODEL = os.getenv("OPENAI_INTENT_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You extract dashboard composition intent from natural language prompts for real estate private equity portfolio managers.

Given a user prompt, return a JSON object with these fields:
{
  "archetype": string — the best-fit dashboard template,
  "requested_sections": string[] — specific data sections the user wants to see,
  "comparisons": string[] — comparison modes requested (e.g., "budget", "prior_year"),
  "time_view": string — time perspective ("quarterly", "monthly", "ttm", "ytd"),
  "confidence": number — 0.0 to 1.0 confidence in the extraction
}

Valid archetypes:
- "executive_summary" — high-level KPI overview, board-ready
- "operating_review" — deep dive into asset operations
- "monthly_operating_report" — monthly asset management report
- "watchlist" — underperformers, surveillance, risk flags
- "fund_quarterly_review" — LP/fund-level quarterly review
- "market_comparison" — comparing assets, benchmarking
- "underwriting_dashboard" — deal evaluation, UW analysis
- "portfolio_overview" — full portfolio aggregate view
- "debt_capital_stack" — debt maturity, leverage, LTV focus
- "investment_deal_evaluation" — investment memo, returns analysis

Valid sections:
- "kpi_summary" — top-level KPI strip
- "noi_trend" — NOI over time (trend chart)
- "actual_vs_budget" — budget variance analysis
- "underperformer_watchlist" — flagged underperforming assets
- "debt_maturity" — loan maturity schedule
- "income_statement" — P&L / income statement table
- "cash_flow" — cash flow statement
- "noi_bridge" — NOI waterfall (EGI → OpEx → NOI)
- "occupancy_trend" — occupancy rate over time
- "dscr_monitoring" — debt service coverage ratio trend
- "downloadable_table" — exportable summary table
- "returns_summary" — IRR, TVPI, DPI metrics
- "leverage_summary" — LTV, debt balance, capital stack
- "rent_analysis" — avg rent, rent per unit trends
- "valuation_trend" — asset value / NAV over time
- "revenue_breakdown" — revenue composition analysis
- "opex_breakdown" — expense category breakdown
- "capital_activity" — capex trend over time
- "net_cash_flow" — net cash flow and distributions

Rules:
1. Choose the SINGLE best archetype. When in doubt, use "executive_summary".
2. Extract ALL sections the user explicitly or implicitly wants. If the prompt says "NOI trend and budget variance", return ["noi_trend", "actual_vs_budget"].
3. If the user prompt is very generic (just "dashboard" or "overview"), return requested_sections: [] and let the archetype defaults take over.
4. Detect comparisons: "vs budget" → ["budget"], "year over year" → ["prior_year"].
5. Detect time views: "monthly" → "monthly", "trailing twelve" or "TTM" → "ttm", "year to date" → "ytd".
6. Return ONLY valid JSON. No markdown, no explanation, no code fences."""


class IntentRequest(BaseModel):
    prompt: str
    entity_type: str = "asset"


class IntentResponse(BaseModel):
    archetype: str = "executive_summary"
    requested_sections: list[str] = []
    comparisons: list[str] = []
    time_view: str = "quarterly"
    confidence: float = 0.5


@router.post("/intent/dashboard", response_model=IntentResponse)
async def extract_dashboard_intent(req: IntentRequest):
    start = time.time()
    try:
        response = await client.chat.completions.create(
            model=INTENT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Entity type: {req.entity_type}\nPrompt: {req.prompt}"},
            ],
            temperature=0,
            max_tokens=500,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content or "{}"
        parsed = json.loads(raw)
        elapsed = int((time.time() - start) * 1000)
        logger.info(f"[ai_intent] LLM intent extracted in {elapsed}ms: archetype={parsed.get('archetype')}, sections={parsed.get('requested_sections')}")

        return IntentResponse(
            archetype=parsed.get("archetype", "executive_summary"),
            requested_sections=parsed.get("requested_sections", []),
            comparisons=parsed.get("comparisons", []),
            time_view=parsed.get("time_view", "quarterly"),
            confidence=parsed.get("confidence", 0.5),
        )

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        logger.error(f"[ai_intent] LLM call failed after {elapsed}ms: {e}")
        # Return empty intent — caller will use regex fallback
        return IntentResponse()
```

### Step 3.2: Register the router in `backend/app/main.py`

Add near the other router imports:
```python
from app.routes.ai_intent import router as ai_intent_router
```

And in the router registration section:
```python
app.include_router(ai_intent_router)
```

### Step 3.3: Create frontend proxy `repo-b/src/app/api/ai/intent/route.ts`

This follows the same pattern as the existing `/bos/[...path]` proxy but specifically for the intent endpoint:

```typescript
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const BOS_API_BASE = (
  process.env.BOS_API_ORIGIN ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/**
 * POST /api/ai/intent
 * Proxies to FastAPI backend POST /api/ai/intent/dashboard
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(`${BOS_API_BASE}/api/ai/intent/dashboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[ai/intent] Backend returned ${res.status}`);
      return Response.json({ fallback: true }, { status: 200 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    console.warn("[ai/intent] Backend unreachable, will use regex fallback:", (err as Error).message);
    return Response.json({ fallback: true }, { status: 200 });
  }
}
```

### Step 3.4: Wire LLM intent into `generate/route.ts`

Add `parseLLMIntent()` function and replace the `parseIntent()` call in POST handler.

```typescript
/**
 * LLM-based intent extraction via FastAPI AI Gateway.
 * Falls back to deterministic regex on any error.
 */
async function parseLLMIntent(
  prompt: string,
  entityType: string,
): Promise<DashboardIntent> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `${process.env.BOS_API_ORIGIN || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/api/ai/intent/dashboard`.replace(/\/\/$/, "/"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, entity_type: entityType }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[generate] LLM intent call returned ${res.status}, falling back to regex`);
      return parseIntent(prompt.toLowerCase());
    }

    const data = await res.json();
    const elapsed = Date.now() - start;

    if (data.fallback || !data.archetype) {
      console.log(`[generate] LLM returned fallback signal, using regex (${elapsed}ms)`);
      return parseIntent(prompt.toLowerCase());
    }

    console.log(`[generate] LLM intent: archetype=${data.archetype}, sections=${JSON.stringify(data.requested_sections)}, confidence=${data.confidence} (${elapsed}ms)`);

    return {
      archetype: data.archetype,
      requested_sections: data.requested_sections || [],
      measures: [],
      comparisons: data.comparisons || [],
      time_view: data.time_view || "quarterly",
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    console.warn(`[generate] LLM intent failed after ${elapsed}ms:`, (err as Error).message, "— using regex fallback");
    return parseIntent(prompt.toLowerCase());
  }
}
```

Then in the POST handler, change line 31 from:
```typescript
const intent = parseIntent(promptLower);
```
to:
```typescript
const intent = await parseLLMIntent(prompt, scope.entity_type);
```

Also add `intent_source` to the response:
```typescript
const intentSource = intent === parseIntent(promptLower) ? "regex" : "llm";
// ... in response payload:
intent_source: intentSource,
```

Actually, tracking the source is easier with a flag:

```typescript
let intentSource = "regex";
let intent: DashboardIntent;
try {
  intent = await parseLLMIntent(prompt, scope.entity_type);
  intentSource = "llm";
} catch {
  intent = parseIntent(promptLower);
}
```

Wait — `parseLLMIntent` already handles its own fallback internally. Better approach: have it return a tagged result:

```typescript
interface TaggedIntent extends DashboardIntent {
  source: "llm" | "regex";
}
```

Then `parseLLMIntent` returns `{ ...intent, source: "llm" }` on success and `{ ...parseIntent(prompt), source: "regex" }` on fallback. The response includes `intent_source: taggedIntent.source`.

---

## PHASE 4: Integration in `generate/route.ts`

After all three phases, the POST handler flow becomes:

```typescript
export async function POST(request: Request) {
  // ... existing setup ...

  // 1. Parse intent via LLM (with regex fallback)
  const taggedIntent = await parseLLMIntent(prompt, scope.entity_type);

  // 2. Detect scope (unchanged)
  const scope = detectScope(promptLower, entity_type, entity_ids);

  // 2b. Auto-populate entity_ids (unchanged)
  // ...

  // 3. Detect metrics (unchanged)
  const requestedMetrics = detectMetrics(promptLower, scope.entity_type);

  // 4. Compose from intent (unchanged)
  const spec = composeFromIntent(taggedIntent, requestedMetrics, scope, quarter);

  // 5. Validate spec (unchanged)
  const validation = validateDashboardSpec(spec);

  // 5b. Intent coverage (unchanged)
  const coverageWarnings = validateIntentCoverage(taggedIntent, spec.widgets);

  // 6. NEW — Data availability check
  const dataAvailability = await validateDataAvailability(
    pool, spec.widgets, scope.entity_ids || [], effectiveQuarter,
    businessId, env_id, scope.entity_type,
  );

  // 7. NEW — Query manifest
  const queryManifest = buildQueryManifest(
    spec.widgets, scope.entity_type, scope.entity_ids || [], effectiveQuarter,
  );

  // 8. Generate name (unchanged)
  // 9. Resolve entity names (unchanged)

  return Response.json({
    ...existingFields,
    data_availability: dataAvailability,
    query_manifest: queryManifest,
    intent_source: taggedIntent.source,
  });
}
```

Add the imports at the top of the file:
```typescript
import { validateDataAvailability } from "@/lib/dashboards/data-validator";
import { buildQueryManifest } from "@/lib/dashboards/query-manifest-builder";
import type { DataAvailability, WidgetQueryManifest } from "@/lib/dashboards/types";
```

---

## Testing

### Backend
```bash
cd backend && python -m pytest tests/ -v 2>&1 | tail -20
```
Or manually test the intent endpoint:
```bash
curl -X POST http://localhost:8000/api/ai/intent/dashboard \
  -H "Content-Type: application/json" \
  -d '{"prompt": "show me noi over time by investment vs budget", "entity_type": "investment"}'
```

### Frontend
```bash
cd repo-b && npx tsc --noEmit 2>&1 | tail -20
make test-frontend 2>&1 | tail -30
```

### End-to-end
Deploy both services, then test on paulmalmquist.com:

1. **"noi over time by investment"**
   - LLM should detect: archetype=`operating_review` or `executive_summary`, sections=[`noi_trend`]
   - `data_availability` should show whether investment has actual data
   - Each widget should have expandable query info panel

2. **"show me what's underperforming vs budget in phoenix"**
   - LLM: archetype=`watchlist`, sections=[`underperformer_watchlist`, `actual_vs_budget`], comparisons=["budget"]
   - Budget availability check shows if budget data is loaded

3. **"executive summary"** (generic)
   - Both LLM and regex should produce same result
   - `intent_source: "llm"` in response

4. **Disable backend to test fallback:**
   - Stop the FastAPI service
   - Generate should still work via regex (console shows fallback log)
   - `intent_source: "regex"` in response

## Commit plan

```bash
# Phase 1+2: Frontend
git add repo-b/src/lib/dashboards/data-validator.ts \
       repo-b/src/lib/dashboards/query-manifest-builder.ts \
       repo-b/src/lib/dashboards/types.ts \
       repo-b/src/app/api/re/v2/dashboards/generate/route.ts \
       repo-b/src/components/repe/dashboards/WidgetRenderer.tsx \
       repo-b/src/app/lab/env/[envId]/re/dashboards/page.tsx
git commit -m "feat(dashboards): add data validation, query manifest, per-widget info panels"

# Phase 3: Backend
git add backend/app/routes/ai_intent.py \
       backend/app/main.py
git commit -m "feat(ai): add structured intent extraction endpoint for dashboard generation"

# Phase 3: Frontend proxy + LLM integration
git add repo-b/src/app/api/ai/intent/route.ts \
       repo-b/src/app/api/re/v2/dashboards/generate/route.ts
git commit -m "feat(dashboards): wire LLM intent extraction with regex fallback"
```

## Success criteria

- [ ] `make test-frontend` passes
- [ ] `make test-backend` passes
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] "noi over time by investment" produces a noi_trend-focused dashboard (not generic executive_summary)
- [ ] Response includes `data_availability` with per-widget `has_data` and `missing_reason`
- [ ] Response includes `query_manifest` with per-widget API routes and English descriptions
- [ ] Per-widget "Query Info" toggle visible in edit mode, shows API route + data status
- [ ] `intent_source: "llm"` when backend is up, `intent_source: "regex"` when down
- [ ] Console logs show `[generate] LLM intent took Xms`
- [ ] No regressions: existing saved dashboards still load
