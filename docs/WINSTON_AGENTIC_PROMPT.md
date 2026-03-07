# Winston — Agentic Capabilities: Implementation Prompt

> **Scope:** This prompt is for getting Winston's agentic layer fully operational. The latency architecture (routing, parallel tools, conditional RAG, caching, prompt compaction) is already implemented. What remains is: (1) write/mutation tools so Winston can actually act on data, (2) the three missing frontend pieces that make the experience feel live, and (3) a tighter thinking indicator that reflects real execution state.
>
> Every file reference below is real. Do not rename files or change module boundaries.

---

## Role

You are a senior full-stack engineer working inside this monorepo. The Winston copilot is running and can read data. Your task is to make it agentic — able to create and modify REPE records, confirm mutations before executing them, and give the user live feedback at every step. This is not a latency task. It is a capability and UX completeness task.

---

## Current State

### What works today

- `run_gateway_stream()` in `backend/app/services/ai_gateway.py` — streaming chat with tool calls, routing, parallel execution
- Request router in `backend/app/services/request_router.py` — classifies requests into Lanes A/B/C/D
- All REPE read tools registered: `repe.list_funds`, `repe.get_fund`, `repe.list_deals`, `repe.list_assets`, `repe.get_asset`, `repe.get_environment_snapshot`
- SSE events: `context`, `status`, `citation`, `token`, `tool_call`, `tool_result`, `done`
- `WinstonTrace` in `repo-b/src/lib/commandbar/assistantApi.ts` includes `lane`, `timings`, full tool timeline
- `AdvancedDrawer.tsx` renders: execution path badge, tool timeline with durations, scope summary, REPE context, warnings, raw JSON

### What is missing

| Gap | Impact |
|-----|--------|
| No write tools registered for REPE | Winston refuses all mutations ("restriction on write operations") |
| `AdvancedDrawer.tsx` does not show lane (A/B/C/D) | Debug panel is blind to routing decisions |
| `AdvancedDrawer.tsx` does not show per-step timings (`timings` object from trace) | Cannot see where time is spent |
| `ThinkingIndicator` in `ConversationPane.tsx` shows generic "Thinking" even when `status` SSE provides real text | Dead status feed during tool-heavy requests |

---

## Part 1 — REPE Write Tools

### Context

`backend/app/services/repe.py` has fully implemented, production-grade write functions that are **not exposed as MCP tools**. The service layer handles SQL, referential integrity, UUID validation, and auto-seeding. Nothing needs to change there.

The only work is in `backend/app/mcp/tools/repe_tools.py` — add handler functions and register new `ToolDef` entries inside `register_repe_tools()`.

### Service functions to expose (all in `backend/app/services/repe.py`)

| Service function | Signature | What it does |
|-----------------|-----------|--------------|
| `create_fund()` | `(*, business_id: UUID, payload: dict) -> dict` | Creates fund row + optional `repe_fund_term` row. Requires: `name`, `vintage_year`, `fund_type`, `strategy`, `status`. Optional: `target_size`, `term_years`, `base_currency`, `management_fee_rate`, `preferred_return_rate`, `carry_rate`, `waterfall_style`, `seed_defaults` |
| `create_deal()` | `(*, fund_id: UUID, payload: dict) -> dict` | Creates deal in `repe_deal`. Auto-calls `re_integrity.ensure_investment_has_asset`. Requires: `name`, `deal_type` (`equity`/`debt`), `stage`. Optional: `sponsor`, `target_close_date` |
| `create_asset()` | `(*, deal_id: UUID, payload: dict) -> dict` | Creates asset + type-specific detail row (`repe_property_asset` or `repe_cmbs_asset`). Requires: `asset_type` (`property`/`cmbs`), `name`. Optional: `property_type`, `units`, `market`, `current_noi`, `occupancy` (property); `tranche`, `rating`, `coupon`, `maturity_date` (cmbs) |

### Tool schemas to define

Create Pydantic input models in `backend/app/mcp/schemas/repe_tools.py` (alongside existing models). Follow the same pattern as `ListFundsInput`, `GetFundInput` — each model inherits fields from `ResolvedScopeInput` or `ToolScopeInput` so `business_id`/`fund_id` can be auto-resolved from context.

**`CreateFundInput`**
```python
class CreateFundInput(BaseModel):
    resolved_scope: ResolvedScopeInput | None = None
    # Required fields
    name: str
    vintage_year: int
    fund_type: str        # "closed_end", "open_end", etc.
    strategy: str         # "core", "value_add", "opportunistic", etc.
    status: str           # "fundraising", "investing", "harvesting", "closed"
    # Optional fields
    target_size: float | None = None
    term_years: int | None = None
    base_currency: str = "USD"
    management_fee_rate: float | None = None
    preferred_return_rate: float | None = None
    carry_rate: float | None = None
    waterfall_style: str | None = None
    seed_defaults: bool = True
```

**`CreateDealInput`**
```python
class CreateDealInput(BaseModel):
    resolved_scope: ResolvedScopeInput | None = None
    fund_id: str | None = None   # auto-resolved from scope if omitted
    name: str
    deal_type: str    # "equity" or "debt"
    stage: str        # "pipeline", "active", "realized", etc.
    sponsor: str | None = None
    target_close_date: str | None = None   # ISO date string
```

**`CreateAssetInput`**
```python
class CreateAssetInput(BaseModel):
    resolved_scope: ResolvedScopeInput | None = None
    deal_id: str | None = None   # auto-resolved from scope if omitted
    asset_type: str   # "property" or "cmbs"
    name: str
    property_type: str | None = None
    units: int | None = None
    market: str | None = None
    current_noi: float | None = None
    occupancy: float | None = None
    tranche: str | None = None
    rating: str | None = None
    coupon: float | None = None
    maturity_date: str | None = None
```

### Handler functions to add (in `repe_tools.py`)

Follow the same resolution pattern as `_list_funds`, `_get_fund` etc. — use `_resolve_business_id()`, `_resolve_fund_id()`, `_resolve_deal_id()` helpers already in the file, then call the service function and return serialized result.

```python
def _create_fund(ctx: McpContext, inp: CreateFundInput) -> dict:
    business_id = _resolve_business_id(inp, ctx)
    payload = inp.model_dump(exclude={"resolved_scope"}, exclude_none=False)
    payload.pop("resolved_scope", None)
    fund = repe.create_fund(business_id=business_id, payload=payload)
    return {"fund": _serialize(fund), "created": True}


def _create_deal(ctx: McpContext, inp: CreateDealInput) -> dict:
    fund_id = _resolve_fund_id(inp, ctx)
    payload = inp.model_dump(exclude={"resolved_scope", "fund_id"}, exclude_none=False)
    for k in ("resolved_scope", "fund_id"):
        payload.pop(k, None)
    deal = repe.create_deal(fund_id=fund_id, payload=payload)
    return {"deal": _serialize(deal), "created": True}


def _create_asset(ctx: McpContext, inp: CreateAssetInput) -> dict:
    deal_id = _resolve_deal_id(inp, ctx)
    if deal_id is None:
        raise ValueError("deal_id is required to create an asset")
    payload = inp.model_dump(exclude={"resolved_scope", "deal_id"}, exclude_none=False)
    for k in ("resolved_scope", "deal_id"):
        payload.pop(k, None)
    asset = repe.create_asset(deal_id=deal_id, payload=payload)
    return {"asset": _serialize(asset), "created": True}
```

### ToolDef registrations to add inside `register_repe_tools()`

Use `AuditPolicy` with `redact_keys=[]` (same as read tools). Use `permission="write"` (not `"read"`).

```python
registry.register(ToolDef(
    name="repe.create_fund",
    description=(
        "Create a new fund for the current business. "
        "Required: name, vintage_year, fund_type (closed_end/open_end), strategy (core/value_add/opportunistic), status (fundraising/investing/harvesting/closed). "
        "business_id is auto-resolved from context — do not pass it. "
        "Returns the created fund record."
    ),
    module="repe",
    permission="write",
    input_model=CreateFundInput,
    audit_policy=policy,
    handler=_create_fund,
))

registry.register(ToolDef(
    name="repe.create_deal",
    description=(
        "Create a new deal/investment in the current fund. "
        "Required: name, deal_type (equity/debt), stage (pipeline/active/realized). "
        "fund_id is auto-resolved from the current fund scope — do not pass it. "
        "Returns the created deal record."
    ),
    module="repe",
    permission="write",
    input_model=CreateDealInput,
    audit_policy=policy,
    handler=_create_deal,
))

registry.register(ToolDef(
    name="repe.create_asset",
    description=(
        "Create a new asset under the current deal/investment. "
        "Required: asset_type (property/cmbs), name. "
        "deal_id is auto-resolved from the current deal scope — do not pass it. "
        "For property assets: optionally provide property_type, units, market, current_noi, occupancy. "
        "For cmbs assets: optionally provide tranche, rating, coupon, maturity_date. "
        "Returns the created asset record."
    ),
    module="repe",
    permission="write",
    input_model=CreateAssetInput,
    audit_policy=policy,
    handler=_create_asset,
))
```

### System prompt update

**File:** `backend/app/services/ai_gateway.py`, `_SYSTEM_PROMPT` constant.

Add a `## Mutation Rules` section so the model knows how to handle write requests:

```
## Mutation Rules
- When the user asks to CREATE, ADD, or SET up a fund, deal, or asset, use the appropriate repe.create_* tool.
- Before calling any write tool, confirm the key parameters in your response (name, type, status) so the user can correct them.
- After a successful write, confirm what was created with the returned ID.
- Never guess required fields. If name, type, or status is missing, ask before calling the write tool.
- Write tools auto-resolve fund_id and deal_id from scope — do not pass IDs you read from context.
```

### Router update for write requests

**File:** `backend/app/services/request_router.py`

Add a write-intent pattern before the `_DEEP_RE` check. Write requests need tools enabled and at least 1 round:

```python
_WRITE_RE = re.compile(
    r"\b(create|add|set up|register|make|new fund|new deal|new asset|new investment)\b",
    re.IGNORECASE,
)
```

In `classify_request()`, before the `_DEEP_RE` check:

```python
if _WRITE_RE.search(message):
    return RouteDecision(
        lane="B",
        skip_rag=True,
        skip_tools=False,
        max_tool_rounds=2,
        max_tokens=1024,
        temperature=0.1,   # Low temp — mutations should be deterministic
    )
```

### Invalidate tool cache after registration

**File:** `backend/app/services/ai_gateway.py`

The `_cached_tools` module-level cache is populated on first call. Since tools are registered at startup in `main.py`, this is fine — but add a reset function so tests can clear it:

```python
def _reset_tool_cache() -> None:
    global _cached_tools
    _cached_tools = None
```

---

## Part 2 — AdvancedDrawer: Lane + Timings

### File: `repo-b/src/components/commandbar/AdvancedDrawer.tsx`

### 2a. Add lane badge to Overview tab

**Current code (lines 128–151)** — the execution summary row shows `execution_path`, tool count, elapsed_ms, token count. Add a lane badge right after the execution path badge.

After this block:
```tsx
<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pathBadgeColor(winstonTrace.execution_path)}`}>
  {winstonTrace.execution_path.toUpperCase()}
</span>
```

Add:
```tsx
{winstonTrace.lane && (
  <span className="inline-flex items-center rounded-full border border-bm-border/40 bg-bm-surface/30 px-2 py-0.5 text-[10px] font-mono text-bm-muted2">
    Lane {winstonTrace.lane}
  </span>
)}
```

### 2b. Add a Timings section to the Runtime tab

**Current Runtime tab** (around line 298) shows the tool timeline. Add a new section above it showing the per-step backend timings from `winstonTrace.timings`.

The `WinstonTrace` type already has `timings?: Record<string, number>` (or add it if missing — it's populated by the backend as `timings: dict[str, int]` in the `done` event).

Add this helper function near the other helpers at the top of the file:

```tsx
function TimingBar({ label, ms, totalMs }: { label: string; ms: number; totalMs: number }) {
  const pct = totalMs > 0 ? Math.min(100, (ms / totalMs) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="w-36 flex-shrink-0 text-[10px] text-bm-muted2 truncate">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-bm-surface/40">
        <div className="h-1 rounded-full bg-bm-accent/50" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right font-mono text-[10px] text-bm-text/70">{ms}ms</span>
    </div>
  );
}
```

In the Runtime tab panel, above the tool timeline section, add:

```tsx
{winstonTrace?.timings && Object.keys(winstonTrace.timings).length > 0 && (
  <div className="mb-3 rounded-md bg-bm-surface/20 px-2 py-1.5">
    <p className="text-[10px] text-bm-muted2 uppercase tracking-wider mb-2">Step Timings</p>
    {[
      ["Context resolution", winstonTrace.timings.context_resolution_ms],
      ["RAG search", winstonTrace.timings.rag_search_ms],
      ["Prompt build", winstonTrace.timings.prompt_construction_ms],
      ["Time to first token", winstonTrace.timings.ttft_ms],
      ["Model total", winstonTrace.timings.model_ms],
    ]
      .filter(([, ms]) => ms != null && ms > 0)
      .map(([label, ms]) => (
        <TimingBar
          key={label as string}
          label={label as string}
          ms={ms as number}
          totalMs={winstonTrace.timings!.total_ms ?? winstonTrace.elapsed_ms}
        />
      ))}
  </div>
)}
```

### 2c. Update `WinstonTrace` type

**File:** `repo-b/src/lib/commandbar/assistantApi.ts`

The `WinstonTrace` type (line 80) should include `timings`:

```typescript
export type WinstonTrace = {
  execution_path: "chat" | "tool" | "rag" | "hybrid";
  lane?: "A" | "B" | "C" | "D";
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tool_call_count: number;
  tool_timeline: WinstonToolTimeline[];
  data_sources: WinstonDataSource[];
  citations: unknown[];
  rag_chunks_used: number;
  warnings: string[];
  elapsed_ms: number;
  resolved_scope: Record<string, unknown> | null;
  repe: WinstonRepeMetadata | null;
  visible_context_shortcut: boolean;
  timings?: {
    context_resolution_ms?: number;
    rag_search_ms?: number;
    prompt_construction_ms?: number;
    ttft_ms?: number;
    model_ms?: number;
    total_ms?: number;
    [key: string]: number | undefined;
  };
};
```

---

## Part 3 — ThinkingIndicator: Live Status Text

### File: `repo-b/src/components/commandbar/ConversationPane.tsx`

### Current state

`ThinkingIndicator` (lines 6–38) accepts `status?: string` and renders `{status || "Thinking"}`. The `status` prop is set from `setThinkingStatus` which is wired to `onStatus` in `askAi()`. The `status` SSE event from the backend sends:

```json
{ "message": "Processing (B): Meridian Capital Management", "lane": "B", "scope": "Meridian Capital Management" }
```

The `onStatus` callback only receives the `message` string (line 940 of `assistantApi.ts`). The lane is not parsed out.

### Change 1: Parse lane from status message

**File:** `repo-b/src/lib/commandbar/assistantApi.ts`, around line 938–941.

Extract lane separately and expose it via a second callback, or encode it into the status string in a way the UI can parse:

```typescript
else if (currentEvent === "status" && parsed.message) {
  const lane = parsed.lane as string | undefined;
  const scope = parsed.scope as string | undefined;
  // Build a human-readable status line
  const statusText = scope
    ? `${scope}${lane ? ` · Lane ${lane}` : ""}`
    : parsed.message;
  input.onStatus?.(statusText);
  continue;
}
```

### Change 2: Show tool name during execution

When a `tool_call` SSE event arrives during streaming, update the thinking status to reflect which tool is running. In the `tool_call` block (around line 910–930 of `assistantApi.ts`):

```typescript
else if (currentEvent === "tool_call") {
  debug.toolCalls.push(parsed as AssistantToolEvent);
  // Surface tool name in the thinking indicator
  const toolName = (parsed as AssistantToolEvent).tool_name;
  if (toolName) {
    const shortName = toolName.replace("repe.", "").replace(/_/g, " ");
    input.onStatus?.(`Running ${shortName}…`);
  }
}
```

### Change 3: Richer status display in `ThinkingIndicator`

**File:** `repo-b/src/components/commandbar/ConversationPane.tsx`

Replace the plain text span with a two-line display that separates the action from the scope:

```tsx
function ThinkingIndicator({ status }: { status?: string }) {
  // Split "Meridian Capital Management · Lane B" into parts
  const parts = status?.split(" · ") ?? [];
  const primary = parts[0] || "Thinking";
  const meta = parts[1] ?? null;

  return (
    <div className="flex items-start gap-3 animate-winston-fade-in">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <svg
          className="h-4 w-4 animate-winston-spin text-bm-accent"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-0 pt-0.5">
        <div className="flex items-center gap-1">
          <span className="text-sm text-bm-muted animate-winston-glow">{primary}</span>
          <span className="inline-flex gap-0.5 ml-0.5">
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-1" />
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-2" />
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-3" />
          </span>
        </div>
        {meta && (
          <span className="text-[10px] text-bm-muted2 font-mono">{meta}</span>
        )}
      </div>
    </div>
  );
}
```

---

## Implementation Order

Do these in order. Each step is independently testable.

### Step 1 — REPE write tool schemas

Add `CreateFundInput`, `CreateDealInput`, `CreateAssetInput` to `backend/app/mcp/schemas/repe_tools.py`. Run `python -c "from app.mcp.schemas.repe_tools import CreateFundInput; print('OK')"` from the backend directory to confirm imports.

### Step 2 — REPE write handlers + registrations

Add `_create_fund`, `_create_deal`, `_create_asset` handler functions in `backend/app/mcp/tools/repe_tools.py`. Register them inside `register_repe_tools()`. Restart the backend and verify the tools appear: `GET /api/mcp/tools` should now list `repe.create_fund`, `repe.create_deal`, `repe.create_asset`.

### Step 3 — System prompt + router write pattern

Update `_SYSTEM_PROMPT` in `ai_gateway.py` with the `## Mutation Rules` section. Add `_WRITE_RE` and the Lane B write route in `request_router.py`.

### Step 4 — Smoke test a create_fund call

Send to Winston: *"Create a fund called Test Fund I, vintage 2026, closed-end, value-add strategy, currently fundraising."* Confirm it returns a `repe.create_fund` tool call in the `tool_call` SSE event and the response contains a `fund_id`. Check the database.

### Step 5 — WinstonTrace type update

Add `timings` to the `WinstonTrace` type in `assistantApi.ts`.

### Step 6 — AdvancedDrawer: lane badge + timings section

Apply the two changes to `AdvancedDrawer.tsx`. Test by asking a simple question (should show Lane A or B), then a complex one (Lane C/D). Open the debug drawer and confirm the lane badge and timings bars appear.

### Step 7 — ThinkingIndicator + status parsing

Apply changes to `assistantApi.ts` (status parse) and `ConversationPane.tsx` (richer indicator). Test: ask a question that triggers a tool call. The indicator should show the tool name while the tool is executing, then the scope/lane after the status event.

---

## Acceptance Criteria

- `POST /api/ai/gateway/ask` with message "create a fund called Meridian III..." results in a `repe.create_fund` tool call (visible in `tool_call` SSE event) and a new row in `repe_fund`
- Write requests are classified as Lane B in the trace
- The debug drawer Overview tab shows a `Lane B` badge next to the execution path badge
- The debug drawer Runtime tab shows a step timings breakdown (context, RAG, TTFT, model total)
- The ThinkingIndicator shows scope name + lane while streaming (e.g. "Meridian Capital Management · Lane B")
- When a tool is running, the indicator updates to e.g. "Running list funds…"
- No regressions on existing read tool paths (list funds, get environment snapshot, etc.)

---

## Files Changed Summary

| File | Change |
|------|--------|
| `backend/app/mcp/schemas/repe_tools.py` | Add `CreateFundInput`, `CreateDealInput`, `CreateAssetInput` |
| `backend/app/mcp/tools/repe_tools.py` | Add `_create_fund`, `_create_deal`, `_create_asset` handlers + 3 `registry.register()` calls |
| `backend/app/services/ai_gateway.py` | Add `## Mutation Rules` to `_SYSTEM_PROMPT`; add `_reset_tool_cache()` helper |
| `backend/app/services/request_router.py` | Add `_WRITE_RE` pattern + Lane B write route in `classify_request()` |
| `repo-b/src/lib/commandbar/assistantApi.ts` | Add `timings` to `WinstonTrace` type; update `status` SSE parsing; update `tool_call` SSE to call `onStatus` with tool name |
| `repo-b/src/components/commandbar/AdvancedDrawer.tsx` | Add lane badge in Overview tab; add `TimingBar` component + timings section in Runtime tab |
| `repo-b/src/components/commandbar/ConversationPane.tsx` | Replace `ThinkingIndicator` with two-line version that parses `primary · meta` format |
