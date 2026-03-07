# Winston — Document-to-Asset Creation: Architecture Plan

> **Goal:** Allow a user to attach a PDF deal memo or property fact sheet in the Winston chat window, have Winston read it, extract the asset fields, confirm with the user, and create the asset record — all in one conversation turn.
>
> **Sample document:** `ashford_commons_fact_sheet.pdf` (created alongside this document) — this is the canonical test document for this feature.
>
> **No code in this document.** This is the architecture plan and implementation brief.

---

## The Interaction to Enable

```
User attaches ashford_commons_fact_sheet.pdf and types:
  "Add this property as an asset under the Ashford Commons deal"

Winston responds:
  "I found the following asset details in the attached document:

   Asset Name:     Ashford Commons Apartments
   Asset Type:     Property
   Property Type:  Multifamily
   Market:         Austin, TX
   Total Units:    248
   Current NOI:    $4,850,000
   Occupancy:      93.5%
   Deal:           Ashford Commons Acquisition (auto-resolved from scope)

   Shall I create this asset? I'll link it to the Ashford Commons Acquisition deal."

User: "Yes, proceed"

Winston: "Asset created. Ashford Commons Apartments (asset_id: ...) has been
          added to the Ashford Commons Acquisition deal."
```

---

## Current Architecture Gaps

| Gap | Impact |
|-----|--------|
| No file upload in `ConversationPane.tsx` | User has no way to attach a document |
| `askAi()` sends JSON only | Cannot transmit a binary file alongside the message |
| Next.js route reads `req.text()` → JSON only | Cannot receive multipart form data |
| FastAPI `/ask` endpoint accepts `GatewayAskRequest` (JSON body) | Cannot receive a file upload |
| No PDF text extraction utility | Cannot read the document content |
| `run_gateway_stream()` has no document text parameter | Extracted text cannot reach the model |
| `build_context_block()` has no document section | Extracted text cannot be injected into prompt |
| `_SYSTEM_PROMPT` has no document extraction instructions | Model doesn't know what to do with an attached document |
| `repe.create_asset` tool not yet registered | Write capability required for final step (per `WINSTON_AGENTIC_PROMPT.md`) |

---

## Full Data Flow (Target State)

```
[ConversationPane]
  User drops PDF + types message
  → attachedFile state set
  → submit calls askAi(message, contextEnvelope, file)

[assistantApi.ts — askAi()]
  file present → build FormData({ message, context_envelope_json, file })
  POST to /api/ai/gateway/ask with Content-Type: multipart/form-data
  Same SSE stream parsing as before

[route.ts — Next.js API route]
  Detect multipart Content-Type
  Parse FormData → extract message, context_envelope_json, file bytes
  Forward as multipart/form-data to FastAPI /api/ai/gateway/ask-doc
  Stream SSE response back to frontend unchanged

[FastAPI — /api/ai/gateway/ask-doc]
  Receive Form() params + UploadFile
  Validate: PDF only, ≤10MB, filename safe
  Call document_extractor.extract_pdf_text(file_bytes) → raw_text
  Build GatewayAskRequest-equivalent from form fields
  Call run_gateway_stream(..., document_text=raw_text)

[document_extractor.py — new utility]
  extract_pdf_text(bytes) → str
  Uses pdfplumber; falls back to pypdf if pdfplumber returns empty
  Limits output to first 8,000 characters (safety cap)
  Returns empty string on failure (never raises — caller handles gracefully)

[run_gateway_stream() — ai_gateway.py]
  Receives document_text: str | None
  Passes to build_context_block(envelope, scope, rag_chunks, document_text=document_text)

[build_context_block() — assistant_scope.py]
  When document_text present, appends:
    ## Attached Document
    {document_text[:8000]}
  This section appears after the existing context block, before the user message

[_SYSTEM_PROMPT — ai_gateway.py]
  New section: ## Document Processing Rules (injected when document_text is present)
  See "System Prompt Addition" section below

[Model]
  Reads ## Attached Document section
  Extracts asset fields per Document Processing Rules
  Presents structured summary for confirmation (Mutation Rules)
  On confirmation: calls repe.create_asset(...)

[repe.create_asset tool — repe_tools.py]
  Per WINSTON_AGENTIC_PROMPT.md: must be implemented before this feature is complete
  Requires confirmed: bool = True flag (per WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md)

[SSE stream]
  No new event types needed
  tool_call event shows repe.create_asset with extracted params
  done event includes new asset_id in trace
```

---

## File-by-File Change Summary

### New file: `backend/app/services/document_extractor.py`

Single responsibility: receive raw PDF bytes, return extracted plain text.

Responsibilities:
- Try `pdfplumber` first (better layout-aware extraction, good for structured fact sheets with tables)
- Fall back to `pypdf` if pdfplumber produces empty/None result
- Strip excessive whitespace, deduplicate blank lines
- Cap output at 8,000 characters (prevents token explosion; a well-formatted 1-page fact sheet is ≈1,500 characters)
- Return empty string `""` on any exception (never raise — the caller must handle "no document content" gracefully)
- Log the extraction attempt and character count at DEBUG level

---

### Modified: `backend/app/routes/ai_gateway.py`

Add a second POST endpoint alongside the existing `/ask`:

**`POST /api/ai/gateway/ask-doc`** — accepts `multipart/form-data` with:
- `message: str` (Form field)
- `context_envelope: str` (Form field — JSON string, same schema as `GatewayAskRequest.context_envelope`)
- `session_id: str | None` (Form field, optional)
- `conversation_id: str | None` (Form field, optional)
- `file: UploadFile` — the PDF attachment

The handler:
1. Validates `file.content_type == "application/pdf"` (return 400 otherwise)
2. Validates `file.size <= 10_000_000` bytes (return 413 otherwise)
3. Reads file bytes: `file_bytes = await file.read()`
4. Calls `document_extractor.extract_pdf_text(file_bytes)` → `document_text`
5. Parses `context_envelope` JSON string into `AssistantContextEnvelope`
6. Calls `run_gateway_stream(..., document_text=document_text)` with remaining form fields
7. Returns `StreamingResponse` exactly like `/ask`

Why a separate endpoint rather than modifying `/ask`? FastAPI's dependency injection cannot cleanly handle a Union of JSON body vs Form + File in the same path. Adding a sibling endpoint preserves the existing `/ask` contract for all non-file requests and keeps the routing logic clean in `route.ts`.

---

### Modified: `backend/app/services/ai_gateway.py`

**`run_gateway_stream()` signature change:**
Add `document_text: str | None = None` parameter. Pass it through to `build_context_block()`.

**`_SYSTEM_PROMPT` — Document Processing Rules section:**
This section is conditionally appended at prompt-build time (not part of the static constant) when `document_text` is non-empty. See "System Prompt Addition" below.

No other changes to the gateway loop. The model receives the document as structured context and uses existing tool + mutation machinery to act on it.

---

### Modified: `backend/app/services/assistant_scope.py`

**`build_context_block()` signature change:**
Add `document_text: str | None = None` parameter.

When `document_text` is present and non-empty, append a new section to the context block string:

```
## Attached Document
The user has attached a PDF document. The extracted text content is below.
Use this to answer questions or extract data as instructed.

{document_text}
```

This section appears after all other context blocks and before the conversation history. The model will see it as part of its system/context input, not as part of the user's message — which matters for how the model attributes the information ("I read this from the document" vs "the user said").

---

### Modified: `repo-b/src/app/api/ai/gateway/ask/route.ts`

**Detect multipart requests** in the `POST` handler. Currently the handler calls `req.text()` then `JSON.parse()`. Add a content-type branch:

When `Content-Type` header starts with `multipart/form-data`:
1. Call `await req.formData()` instead of `req.text()`
2. Extract `message`, `context_envelope` (JSON string), `session_id`, `conversation_id` from form fields
3. Extract the file blob from the `file` form field
4. Build a new `FormData` for the upstream FastAPI request
5. Forward to `{FASTAPI_BASE}/api/ai/gateway/ask-doc` (not `/ask`)
6. Stream the SSE response back to the client identically to how JSON requests are handled

The fallback OpenAI path does not need to support file uploads. If FastAPI is unavailable during a file-attach request, return a clear error ("Document processing requires the backend service.") rather than falling back to direct OpenAI.

---

### Modified: `repo-b/src/lib/commandbar/assistantApi.ts`

**`askAi()` signature change:**
Add optional `file?: File` parameter.

When `file` is present:
- Build a `FormData` object instead of a JSON string
- Append `message`, `context_envelope` (JSON-stringified), `session_id`, `conversation_id`
- Append `file` with the filename preserved
- Send `fetch(url, { method: "POST", body: formData })` — **do not set `Content-Type` manually**; the browser sets the correct `multipart/form-data; boundary=...` header automatically when the body is FormData
- The response is an SSE stream — parsing remains identical

When `file` is absent: existing JSON path unchanged.

---

### Modified: `repo-b/src/components/commandbar/ConversationPane.tsx`

**New state:** `attachedFile: File | null` and `attachedFileName: string | null`.

**File attachment UI — three entry points:**

1. **Paperclip button** in the input toolbar (left of the text field): `<input type="file" accept=".pdf" hidden ref={fileInputRef}>`; clicking the paperclip programmatically clicks the hidden input.

2. **Drag-and-drop zone** on the entire conversation pane: `onDragOver` + `onDrop` handlers on the outer container. When a `.pdf` file is dropped, set `attachedFile` state. Show a visual drop-target highlight on `onDragOver`.

3. **Paste handler** (optional, Phase 2): detect `application/pdf` in clipboard paste events.

**File preview pill** (shown above the text input when a file is attached):
A dismissible chip showing a PDF icon, the filename (truncated to 32 chars), and an `×` button that clears `attachedFile`. Styled to match the existing input area.

**Submit handler change:**
When `attachedFile` is set, call `askAi(message, contextEnvelope, attachedFile)` instead of `askAi(message, contextEnvelope)`. Clear `attachedFile` after submit (whether success or error).

**Constraint enforcement:**
Client-side validate before submitting: reject non-PDF files (`file.type !== "application/pdf"`), reject files >10MB. Show an inline error in the chat if validation fails rather than surfacing a network error.

---

## System Prompt Addition — Document Processing Rules

This section is injected into the system prompt **only when** `document_text` is non-empty. It should be appended programmatically inside `run_gateway_stream()` rather than being part of the static `_SYSTEM_PROMPT` constant. (This follows the Principle 1 established in `WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md` — capability declarations are conditional on runtime state.)

```
## Document Processing Rules
An attached document has been provided by the user. Its extracted text appears in the
"## Attached Document" section of the context block.

When processing an attached document to create an asset:
1. Read the document and identify every field that maps to the asset schema:
   - asset_type: look for property type indicators (multifamily, office, retail, industrial → "property"; CMBS, tranche, bond → "cmbs")
   - name: the property or asset name
   - property_type: subcategory (multifamily, office, retail, industrial, mixed_use, etc.)
   - market: city/metro (e.g., "Austin, TX")
   - units: total unit count (multifamily/residential only)
   - current_noi: net operating income in dollars (may appear as "NOI", "In-Place NOI", "Annualized NOI")
   - occupancy: as a decimal (93.5% → 0.935) or percentage string
2. Present the extracted fields in a clear table. Mark any required fields that are
   missing from the document as "[not found — please confirm]".
3. Ask the user: "Shall I create this asset with the above details?"
4. Do NOT call repe.create_asset until the user explicitly confirms.
5. After confirmation, call repe.create_asset with the confirmed parameters.
   deal_id is auto-resolved from scope — do not pass it.
6. If the document is not about a real estate asset, say so clearly and do not attempt to create anything.
7. Never invent values for fields not present in the document.
```

---

## What Must Be in Place Before This Feature Works End-to-End

This feature has a hard dependency on the write tools from `WINSTON_AGENTIC_PROMPT.md`. The document reading and extraction pipeline can be built and tested independently, but the final "create asset" step requires:

- `repe.create_asset` tool registered in `repe_tools.py` with `permission="write"`
- The `confirmed: bool` safety gate on write tools (per `WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md`)
- The conditional `## Mutation Rules` prompt injection (also per behavior guardrails doc)

In other words: **implement write tools first, then implement this document pipeline**. The reverse order leads to the same failure mode already documented — the model is told it can create assets, a confirmation dialog appears, the user says yes, and nothing happens.

---

## Implementation Order

### Phase 1 — Backend extraction pipeline (no UI changes)
1. Create `document_extractor.py` with `extract_pdf_text()` and a smoke test
2. Add `/api/ai/gateway/ask-doc` FastAPI endpoint; test with `curl --form`
3. Add `document_text` parameter to `run_gateway_stream()` and `build_context_block()`
4. Add Document Processing Rules prompt injection (conditional on `document_text`)
5. Manual test: POST to `/ask-doc` with `ashford_commons_fact_sheet.pdf` and confirm the `## Attached Document` section appears in the model's context (visible via a debug log or trace)

### Phase 2 — Frontend file attachment UI
6. Add `file?: File` to `askAi()` in `assistantApi.ts`; use FormData when file present
7. Update `route.ts` to detect multipart and forward to `/ask-doc`
8. Add file attachment state, paperclip button, drag-drop, and preview pill to `ConversationPane.tsx`
9. Manual test: drag `ashford_commons_fact_sheet.pdf` into Winston → confirm extraction fields appear in response

### Phase 3 — Write tools (prerequisite for full flow, but developed in parallel)
10. Implement `repe.create_asset` tool per `WINSTON_AGENTIC_PROMPT.md`
11. Add confirmed flag per `WINSTON_BEHAVIOR_GUARDRAILS_PROMPT.md`
12. End-to-end test: drag PDF → review extracted fields → confirm → verify asset row in database

---

## Edge Cases to Handle

| Case | Handling |
|------|----------|
| Scanned PDF (image-only, no text layer) | `extract_pdf_text` returns empty → Winston responds: "I couldn't extract text from this PDF. It may be a scanned document. Please try a text-based PDF or paste the key details manually." |
| Password-protected PDF | `pdfplumber` raises; returns `""` → same "couldn't extract" response |
| Multi-page PDF (e.g., full OM) | Extract first 8,000 characters with a note in the document block: "Document truncated to 8,000 characters." |
| Non-PDF file attached (Word, Excel) | Client-side validation rejects before upload; if bypassed, FastAPI returns 400 |
| File too large (>10MB) | Client-side check rejects; FastAPI also enforces 10MB limit |
| Document describes multiple assets | Winston should present all extracted assets and ask which one (or all) to create |
| Required field missing (e.g., no asset_type) | Winston marks it `[not found]` in the confirmation table and asks user to supply it before proceeding |
| User attaches file but types an unrelated question | Winston answers the question normally; the document context is available but the model should not automatically try to create an asset if the user isn't asking for it |

---

## Testing the Feature

**Test 1 — Extraction fidelity:**
Attach `ashford_commons_fact_sheet.pdf` and ask "what are the key details in this document?" (no create intent). Winston should summarize the property details accurately from the document without calling any write tools.

**Test 2 — Asset creation from document:**
Attach `ashford_commons_fact_sheet.pdf` and ask "add this as an asset." Winston should present the extracted fields, ask for confirmation, and create the asset after approval.

**Test 3 — Missing field handling:**
Prepare a stripped-down version of the fact sheet without the `market` field. Winston should present the fields, mark `market` as `[not found]`, and ask for it before proceeding.

**Test 4 — Scanned PDF rejection:**
Attach a scanned/image PDF. Winston should respond gracefully without crashing.

**Test 5 — Non-asset document:**
Attach a document that isn't a property fact sheet (e.g., a legal agreement). Winston should not try to create an asset.

---

## Files Changed Summary

| File | Change Type | What Changes |
|------|-------------|--------------|
| `backend/app/services/document_extractor.py` | **New** | `extract_pdf_text(bytes) -> str` using pdfplumber/pypdf |
| `backend/app/routes/ai_gateway.py` | **Modified** | Add `/api/ai/gateway/ask-doc` endpoint accepting Form + UploadFile |
| `backend/app/services/ai_gateway.py` | **Modified** | Add `document_text` param to `run_gateway_stream()`; conditional Document Processing Rules prompt injection |
| `backend/app/services/assistant_scope.py` | **Modified** | Add `document_text` param to `build_context_block()`; inject `## Attached Document` section |
| `repo-b/src/app/api/ai/gateway/ask/route.ts` | **Modified** | Detect multipart Content-Type; parse FormData; forward to `/ask-doc` |
| `repo-b/src/lib/commandbar/assistantApi.ts` | **Modified** | Add `file?: File` param; use FormData when file present |
| `repo-b/src/components/commandbar/ConversationPane.tsx` | **Modified** | Add file attachment state, paperclip button, drag-drop zone, file preview pill |
| `backend/app/mcp/tools/repe_tools.py` | **Prerequisite** | `repe.create_asset` must be registered (per `WINSTON_AGENTIC_PROMPT.md`) |
