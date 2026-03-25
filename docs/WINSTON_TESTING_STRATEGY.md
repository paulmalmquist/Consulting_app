# Winston — Testing Strategy

> **Approach:** All tests hit real running endpoints. No mocks, no fake cursors. The FastAPI backend and Next.js frontend must be running. Tests verify that the system works end-to-end — real SSE streams, real database writes, real PDF extraction, real model responses.
>
> **Coverage:** Every capability added across the five Winston architecture prompts, plus a regression suite that confirms nothing existing broke.

---

## Prerequisites

```
# Backend running at http://localhost:8000
cd backend && uvicorn app.main:app --reload

# Frontend running at http://localhost:3000
cd repo-b && npm run dev

# Playwright installed
cd repo-b && npx playwright install

# httpx for scripted API calls
pip install httpx pytest --break-system-packages
```

All tests require:
- `OPENAI_API_KEY` set in backend env
- A seeded test environment (Meridian Capital Management) — see seed step below
- `ashford_commons_fact_sheet.pdf` in the project root (already generated)

---

## Seed: Create the Test Environment

Every test run starts by creating a fresh Meridian Capital demo environment. This endpoint already exists in the app:

```
POST http://localhost:3000/api/winston-demo/create_env_meridian
```

Returns `{ env: { env_id: "..." }, business_id: "..." }`. Store both IDs — every subsequent test uses them.

This is the same seed call used in `winston-institutional-demo.spec.ts`.

---

## Test Suite 1 — Request Router & Model Dispatch

**Goal:** Confirm that lane classification and model selection are correct in the live system.

Each test sends a real question to `POST /api/ai/gateway/ask` and reads the `done` SSE event's `trace` field.

### How to read the SSE stream in tests

```
POST /api/ai/gateway/ask
Content-Type: application/json

{
  "message": "...",
  "env_id": "{seeded_env_id}",
  "business_id": "{seeded_business_id}",
  "session_id": "test-session-001"
}
```

Read the stream until the `done` event. The `done` event payload contains `trace.lane`, `trace.model`, `trace.timings`, `trace.tool_call_count`.

| Test | Message sent | Assert on trace |
|------|-------------|-----------------|
| Lane A routes correctly | `"what environment is this"` | `trace.lane == "A"`, `trace.tool_call_count == 0`, no RAG citations |
| Lane A uses fast model | Same | `trace.model == "gpt-4o-mini"` (or configured fast model) |
| Lane B routes correctly | `"list the funds in this environment"` | `trace.lane == "B"`, `trace.tool_call_count >= 1` |
| Lane C routes correctly | `"compare the NOI across all assets in this environment"` | `trace.lane == "C"` |
| Lane C uses heavy model | Same | `trace.model == "gpt-4o"` (or configured heavy model) |
| Lane D routes correctly | `"build a sensitivity analysis for Fund III under three rate scenarios"` | `trace.lane == "D"` |
| Write routes to Lane C | `"create a fund called Test Fund I"` | `trace.lane == "C"` |
| Non-mutation phrasing doesn't write-route | `"what's new in this fund"` | `trace.lane != "C-write"` — no `repe.create_*` in tool timeline |

---

## Test Suite 2 — RAG & Re-Ranking

**Goal:** Verify the re-ranking pipeline is active and producing better results than raw cosine alone.

### 2a. RAG fires on Lane C/D

Send an analytical question. Check the `done` event trace:

| Test | Message | Assert |
|------|---------|--------|
| RAG runs on Lane C | `"what does the operating agreement say about distributions"` | `trace.rag_chunks_used > 0` |
| RAG skips on Lane A | `"what environment am I in"` | `trace.rag_chunks_used == 0` |
| RAG skips on Lane B | `"list all funds"` | `trace.rag_chunks_used == 0` |

### 2b. Citations are emitted

Collect all SSE events. For any Lane C query with docs indexed:

- At least one `citation` event is emitted before `done`
- Each `citation` event has `chunk_id`, `score`, `snippet`, `section_heading`
- All `score` values are ≥ `RAG_MIN_SCORE` (no noise chunks leaked through)

### 2c. Re-ranking metadata in trace

After the re-ranking pipeline is implemented, the `done` trace should include a `rag` object:

```json
"rag": {
  "candidates_retrieved": 20,
  "candidates_after_threshold": N,
  "candidates_after_rerank": 5,
  "rerank_method": "cohere",
  "hybrid_search": true
}
```

| Test | Assert |
|------|--------|
| Over-retrieval is happening | `trace.rag.candidates_retrieved > trace.rag_chunks_used` |
| Threshold is filtering | `trace.rag.candidates_after_threshold < trace.rag.candidates_retrieved` |
| Hybrid search active on Lane C | `trace.rag.hybrid_search == true` |

### 2d. Entity-scope boost (qualitative)

Ask the same financial question twice: once while scoped to Fund III, once scoped to Fund VII. The citation scores for Fund III documents should rank higher in the first response. Assert that the top citation's `section_heading` or `snippet` contains "Fund III" when scoped there.

---

## Test Suite 3 — Write Tools & Confirmation Gate

**Goal:** Verify the confirmation gate holds and write tools create real database records.

### 3a. Confirmation request fires before write

Send: `"Create a fund called Cypress Point Fund I, vintage 2026, closed-end, value-add, currently fundraising"`

Expected SSE stream:
1. `status` event — routing/thinking
2. `token` events — Winston presents a field summary table and asks "Shall I proceed?"
3. `done` event — NO `tool_call` event for `repe.create_fund` in this turn

Assert: `trace.tool_timeline` contains no `repe.create_fund` entry.

### 3b. Write executes after confirmation

Continue the same conversation. Send: `"Yes, proceed"`

Expected SSE stream:
1. `tool_call` event with `tool_name == "repe.create_fund"`
2. `tool_result` event with a `fund_id` in the result
3. `done` event

Assert:
- `trace.tool_timeline` contains a `repe.create_fund` entry with a `duration_ms`
- `fund_id` from the tool result is a valid UUID
- Database check: `SELECT * FROM repe_fund WHERE name = 'Cypress Point Fund I'` returns one row

### 3c. Write does NOT fire without confirmation

Send the create request in a fresh conversation. Without replying "yes", send a different message: `"actually never mind, what funds do we have"`

Assert: no `repe.create_fund` in the tool timeline for either turn.

### 3d. Same for create_deal and create_asset

| Test | Message | Assert |
|------|---------|--------|
| create_deal confirms before executing | `"add a deal called Riverside Tower to the first fund"` | Confirmation response shown; no `repe.create_deal` tool call yet |
| create_deal executes after yes | Follow up with `"yes"` | `repe.create_deal` appears in tool timeline; DB row created |
| create_asset confirms before executing | `"add a multifamily property called Lakeview Commons to the Riverside Tower deal"` | Confirmation shown; no `repe.create_asset` yet |
| create_asset executes after yes | Follow up with `"yes"` | `repe.create_asset` in tool timeline; DB row created |

---

## Test Suite 4 — Document-to-Asset Flow

**Goal:** Verify the full pipeline: PDF upload → extraction → field presentation → confirmation → asset created.

### 4a. Backend: `/api/ai/gateway/ask-doc` endpoint

```
POST http://localhost:8000/api/ai/gateway/ask-doc
Content-Type: multipart/form-data

message: "add this property as an asset"
env_id: {seeded_env_id}
business_id: {seeded_business_id}
session_id: test-doc-001
file: @ashford_commons_fact_sheet.pdf
```

| Test | Assert |
|------|--------|
| Endpoint exists and accepts multipart | Response is a streaming SSE response (200, `text/event-stream`) |
| Document text reaches the model | `token` events include a table with "Ashford Commons", "248", "Austin", "4,850,000" |
| Field "Occupancy" extracted | Response text contains "93.5" |
| Confirmation requested, not yet created | `done` event trace has no `repe.create_asset` in tool timeline |
| Non-PDF rejected | POST same endpoint with a `.txt` file | `400` response, no SSE stream |
| Oversized file rejected | POST with file > 10MB | `413` response |

### 4b. Frontend: Playwright flow

```typescript
test("attach pdf and create asset from it", async ({ page, request }) => {
  // Seed
  const { env } = await request.post("/api/winston-demo/create_env_meridian").json();

  // Navigate to a deal page
  await page.goto(`/lab/env/${env.env_id}/re/investments`);

  // Open Winston
  await page.getByRole("button", { name: /winston/i }).click();
  await expect(page.locator("[data-winston-panel]")).toBeVisible();

  // Drop the PDF
  await page.locator("[data-winston-drop-zone]").dispatchEvent("drop", {
    dataTransfer: { files: [ashfordPdfFile] }
  });
  await expect(page.locator("[data-file-pill]")).toContainText("ashford_commons");

  // Send message
  await page.locator("[data-winston-input]").fill("add this as an asset");
  await page.keyboard.press("Enter");

  // Winston presents extracted fields
  await expect(page.locator("[data-winston-messages]")).toContainText("Ashford Commons Apartments", { timeout: 15000 });
  await expect(page.locator("[data-winston-messages]")).toContainText("248");
  await expect(page.locator("[data-winston-messages]")).toContainText("Austin");

  // Confirm
  await page.locator("[data-winston-input]").fill("Yes, proceed");
  await page.keyboard.press("Enter");

  // Asset created
  await expect(page.locator("[data-winston-messages]")).toContainText("asset_id", { timeout: 15000 });
});
```

### 4c. Non-asset document response

Upload a non-real-estate PDF (e.g., a generic legal agreement). Assert Winston responds with something like "this document doesn't appear to describe a real estate asset" without calling any write tools.

---

## Test Suite 5 — Latency Verification

**Goal:** Confirm the latency targets are being met. Run against the live dev server with a warm cache.

Send 10 requests per lane and collect the `trace.elapsed_ms` from each `done` event.

| Lane | Message example | P95 target |
|------|----------------|------------|
| A | "what environment am I in" | < 1,000ms |
| B | "list the funds in this environment" | < 4,000ms |
| C | "compare NOI across all assets" | < 8,000ms |

For each lane, assert P95 ≤ target. Log P50 and P95 to a timing report.

### Cache hit verification

Send the same Lane C query twice within 60 seconds. Assert:
- Second request `trace.elapsed_ms` is at least 300ms less than the first (RAG cache hit)
- Second request `trace.timings.rag_search_ms` is near zero

### Re-ranker timeout fallback

Configure a short Cohere API timeout via env var. Send a Lane C query. Assert:
- Response still arrives (no 500 error)
- `trace.rag.rerank_method` is `"fallback"` or `"cosine"` (indicates fallback fired)
- `trace.elapsed_ms` is within reasonable bounds (not stuck waiting)

---

## Test Suite 6 — AdvancedDrawer & ThinkingIndicator (Playwright)

**Goal:** The debug panel shows correct information; the thinking indicator is live during streaming.

| Test | Steps | Assert |
|------|-------|--------|
| Lane badge shown | Ask any question; open AdvancedDrawer Overview | Lane badge (A/B/C/D) visible |
| Model name shown | Same | Model name (`gpt-4o` or `gpt-4o-mini`) visible in Overview |
| Step timings shown | Any request with tools | Runtime tab shows timing bars for context, RAG, TTFT, model |
| Tool timeline shown | Lane B/C with tool calls | Runtime tab lists tools with `duration_ms` |
| Re-ranking stats shown | Lane C request | Runtime tab shows `candidates_retrieved`, `candidates_after_threshold` |
| ThinkingIndicator shows lane | Lane C question during streaming | Indicator shows colored lane badge while streaming |
| ThinkingIndicator shows tool name | Question requiring tool | Indicator text shows "Running list funds…" while tool executes |
| Indicator disappears on done | Any request | Thinking indicator not visible after `done` event received |

---

## Regression Test Suite

These must pass unchanged after every implementation. They verify nothing existing broke.

### Read tool paths (Playwright)

```typescript
test("existing read tools still work", async ({ page, request }) => {
  const { env } = await request.post("/api/winston-demo/create_env_meridian").json();
  // Ask for fund list — uses repe.list_funds
  // Assert Winston returns fund names visible in the environment
  // Assert trace.tool_timeline contains "repe.list_funds"
  // Assert no errors in console
});
```

### SSE event contract

Collect all events from a Lane C request. Assert:
- `token` events all have `{ text: string }`
- `citation` events all have `chunk_id`, `doc_id`, `score`, `snippet`
- `tool_call` events have `tool_name`, `arguments`
- `tool_result` events have `tool_name`, `result`
- `done` event has `trace.lane`, `trace.model`, `trace.elapsed_ms`, `trace.timings`, `trace.tool_timeline`
- No unexpected event types appear
- `done` is always the final event

### Conversation persistence

Send two turns in the same conversation:
1. `"which funds do we have"` → note fund names returned
2. `"tell me more about the first one"` — deictic follow-up

Assert the second response correctly references the fund from the first turn, proving conversation history is being loaded and passed to the model.

### Scope resolution

Ask `"how many assets does this fund have"` while on a fund page (route includes `fund_id`). Assert:
- `trace.resolved_scope.entity_type == "fund"`
- Response references the correct fund without Winston asking "which fund?"

---

## Test Execution Order

```
1. Seed: POST /api/winston-demo/create_env_meridian

2. Smoke (30s): Lane A works, SSE stream is valid, done event arrives

3. Core (3–5min):
   - Suite 1: Router & model dispatch
   - Suite 2: RAG & re-ranking
   - Suite 3: Write tools & confirmation gate
   - Suite 4: Document-to-asset flow

4. Regression (2min): SSE contract, read tools, conversation persistence

5. Performance (5min, optional): Latency targets, cache hit rate

6. E2E Playwright (5–15min): Full user flows with UI assertions
```

### Playwright config

```typescript
// playwright.config.ts additions
use: {
  baseURL: "http://localhost:3000",
  trace: "on-first-retry",
},
timeout: 30_000,  // Winston responses can take up to 20s (Lane D)
```

---

## What a Passing Run Looks Like

- No `repe.create_*` tool calls fire without a prior confirmation turn
- Every `citation` event has a score ≥ `RAG_MIN_SCORE`
- Lane A and B responses never contain a `repe.create_*` tool call
- Lane C/D responses use the heavy model (`gpt-4o`)
- Lane A/B responses use the fast model (`gpt-4o-mini`)
- PDF upload correctly extracts Ashford Commons fields (name, units, market, NOI, occupancy)
- Asset is created in the database after user confirmation
- All existing read tool responses return the same data they did before
- The SSE event format is unchanged
- The AdvancedDrawer debug panel shows lane, model, timings, and re-ranking stats
