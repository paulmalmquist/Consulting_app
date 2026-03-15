---
id: winston-behavior-guardrails
kind: prompt
status: active
source_of_truth: true
topic: behavior-guardrails
owners:
  - docs
  - backend
intent_tags:
  - docs
  - research
triggers:
  - behavior guardrails
  - what went wrong
  - lost the plot
entrypoint: true
handoff_to:
  - architect-winston
when_to_use: "Use when the user explicitly asks for the Winston behavior guardrails prompt or the post-mortem around agent behavior failures."
when_not_to_use: "Do not use as the general router for repo work; CLAUDE.md should already have selected a prompt or workflow."
surface_paths:
  - docs/
  - backend/
---

# Winston — Behavior Guardrails: What Went Wrong and How to Fix It

> **Purpose:** This is a post-mortem and architectural remediation prompt. Use it to understand the specific failure modes that caused Winston to "lose the plot," and to guide the changes needed to prevent recurrence. No code is written here — this is a diagnosis, a set of behavioral principles, and a structural plan.

---

## What Went Wrong

### Root Cause: Promised Capabilities Without Infrastructure

The immediate cause was a **broken contract between the system prompt and the tool registry.** In this order:

1. The `## Mutation Rules` section was added to `_SYSTEM_PROMPT` in `ai_gateway.py`. This tells the model: *"You can create, update, and delete records. Confirm with the user before calling a write tool."*

2. The `_WRITE_RE` pattern was added to `request_router.py` and write requests were routed to Lane C with `skip_tools=False, max_tool_rounds=3`.

3. The write tools themselves — `repe.create_fund`, `repe.create_deal`, `repe.create_asset` — were **never registered** in the MCP tool registry.

The result: the model was told to use tools that did not exist, given multiple rounds to try, and no escape hatch when they weren't found. Winston didn't "misbehave" — it followed its instructions faithfully into a dead end.

---

### Failure Mode 1: Hallucinated Success

When the model is told it has write tools, confirms parameters with the user, the user says "proceed," and then the tool call returns nothing — the model fills the gap. It does not know the tool is missing at the architecture level. It knows only that no result came back, and its instruction says "After a successful write, report what was created and its ID." So it fabricates an ID and declares success.

This is the most dangerous failure mode. The user believes a record was created. No record was created. The data is now lying.

**Where this happens:** OpenAI tool calls that reference names not in the tool list are either rejected by the API (error propagated back as a function call failure, which the model misreads as a data error) or silently swallowed (the round completes with no tool result, and the model invents one).

---

### Failure Mode 2: Confirmation Loop Without Exit

The mutation rules say to confirm before acting. But with no write tool to eventually call, the model enters a state where:

- Round 1: Model asks for confirmation
- User confirms
- Round 2: Model attempts write tool → fails or gets empty result
- Round 3: Model retries with slightly different arguments, or tries to use a read tool to verify the write it thinks succeeded
- Lane C allows `max_tool_rounds=3`, so all three rounds are consumed

At round 3 the answer is returned — typically garbled, contradictory, or falsely confident. Winston has "lost the plot" because it burned all its tool rounds chasing a tool that doesn't exist.

---

### Failure Mode 3: Pattern Over-Matching

The `_WRITE_RE` pattern matches on keyword co-occurrence: `create|add|new|set up|register|insert` near `fund|deal|investment|asset|property`. This is too broad. It catches:

- "Create a comparison of these assets" → not a write operation, this is analytics (Lane C)
- "Add some context to our investment thesis" → not a write operation, this is a note
- "What's new in this fund?" → `new` and `fund` co-occur in a read question
- "Show me new investments in the pipeline" → same problem

When these queries misroute to the write lane with `skip_tools=False`, the model's mutation rules activate and it starts trying to confirm write parameters for a question that was never asking to write anything. The user says "what's new in this fund" and Winston responds "Shall I create a new fund record for you?" — this is the "lost the plot" experience.

---

### Failure Mode 4: System Prompt Contradiction

After the mutation rules were added, the system prompt contains this tension:

- **Tooling Rules:** "Call tools with EMPTY parameters — business_id, env_id, and fund_id are auto-resolved from context."
- **Mutation Rules:** "For any create/update/delete action, ALWAYS confirm the parameters with the user before calling the write tool."

For a write tool call, the model must simultaneously: (a) call the tool with empty params (trusting auto-resolution), and (b) confirm all parameters with the user first. These instructions are in tension. The model ends up either confirming parameters it shouldn't (making the confirmation dialog verbose and confusing) or skipping confirmation it should (proceeding without the safety gate).

This ambiguity compounds under the already-broken state above.

---

### Failure Mode 5: No Graceful Degradation Path

There is no instruction telling Winston what to do when a capability it has been told it possesses is unavailable at runtime. The current system prompt covers:

- What to do when tools succeed
- What to do when scope resolution fails
- What to do when the user's question is ambiguous

It does not cover: **what to do when a tool call fails because the tool does not exist.** The model falls through to its priors — which is to reason through the task anyway, often hallucinating.

---

## How to Prevent This Going Forward

### Principle 1: Capability Declarations Must Match Tool Registry State

The system prompt's `## Mutation Rules` section must only be injected into the prompt **when write tools are actually registered.** If `repe.create_fund` is not in the registry, the prompt must not tell Winston it can create funds. This should be enforced dynamically, not by convention.

The correct architecture: `_SYSTEM_PROMPT` has a base section (always injected) and optional sections (injected conditionally based on what tools are registered). Write rules are an optional section. Read-only rules are always present. The gateway reads the registry at prompt-build time, checks what permissions are available (`read` vs. `write`), and includes only the relevant instruction sections.

---

### Principle 2: Mutation Routing Requires Write Tools

Lane C write routing (`_WRITE_RE` → Lane C, `skip_tools=False`) must be gated on whether write tools exist. If no write tools are registered, `_WRITE_RE` matches should fall through to the default analytical routing — or better, to a Lane A response that explains "write operations are not available in the current configuration."

The router and the prompt must be co-validated at startup: if mutation rules are in the prompt, write tools must be in the registry. If they are not, startup should log a warning and the mutation prompt section should be suppressed.

---

### Principle 3: Write Pattern Matching Must Be Tighter

The `_WRITE_RE` pattern must distinguish intent-to-mutate from intent-to-query. The current pattern false-positives on analytical and navigational queries.

Tighter discriminators:
- Require a clear object-creation verb (`create`, `add a new`, `set up a`, `register a`) directly preceding the entity noun — not anywhere in the sentence
- Exclude comparative and analytical framing (`compare`, `show`, `analyze`, `what is`)
- The confirmation loop itself provides a safety valve: if the model correctly asks "Shall I create X?", a false-positive mutation route is recoverable because the user will say no. But false-positives that bypass confirmation are not recoverable.

---

### Principle 4: The Confirmation Gate Must Be Structural, Not Prompt-Only

Currently, "confirm before writing" exists only as an instruction to the model. The model can skip it. The model can misinterpret it. The model can hallucinate that it already confirmed when it didn't.

The confirmation gate should be enforced architecturally:

- Write tools should check for a `confirmed: true` flag in their input before executing
- This flag is only present if the frontend explicitly sends it after a user approval action
- If `confirmed` is absent or false, the write tool returns a "pending_confirmation" response (not an error), and the gateway emits a special SSE event type (e.g., `confirmation_required`) that the frontend surfaces as a modal or inline prompt
- The user clicks "Confirm" in the UI, which re-sends the request with the same parameters plus `confirmed: true`
- Only then does the write execute

This eliminates the possibility of Winston writing without user approval regardless of what the model "decides" to do.

---

### Principle 5: Tool Failure Must Have a Documented Recovery Path

The system prompt must tell Winston what to do when a tool call returns an error or is unavailable. Currently there is no such instruction. Add a section covering:

- If a tool call returns an error: surface the error plainly ("I tried to create the fund but got: [error]. Here is what I needed: [parameters]. Would you like to try again or adjust the inputs?")
- If a write tool is unavailable (no such tool in the registry): respond with "Write operations are not available in the current session. I can read and analyze data, but creating or modifying records requires a configuration that is not currently active."
- Never invent a result when a tool fails. Silence from a tool call is not success.

---

### Principle 6: Write Confirmation Must Be Visible in the Debug Panel

Currently, the AdvancedDrawer shows tool calls and results in the trace. Write tool calls are visually identical to read tool calls. This makes it impossible for the user to audit what Winston created, modified, or failed to create during a session.

Write-related tool events should be visually distinct in the trace:
- A different color or badge on `tool_call` events where `permission == "write"`
- A "Pending Confirmation" state shown inline if the write is waiting for approval
- The `tool_result` for a write should show the created entity's ID and a link to view it

---

## Architectural Changes Required

### Change 1: Conditional System Prompt Injection

Move `## Mutation Rules` out of the static `_SYSTEM_PROMPT` constant. Instead, build the system prompt dynamically inside `run_gateway_stream()` by checking the registered tool permissions. This is a one-time structural change to `ai_gateway.py` — the prompt string becomes a function of the registry state, not a hardcoded constant.

Specifically: check whether any `ToolDef` with `permission="write"` is registered. If yes, inject the mutation rules block. If no, inject a substitute block that explicitly tells Winston it operates in read-only mode.

---

### Change 2: Two-Phase Mutation Flow

Replace the single-round "confirm then write" instruction with a two-phase flow enforced at the API layer:

**Phase 1 — Confirmation Request**
The model responds with a structured confirmation request (not a tool call). The frontend detects this and renders a confirmation UI. No write executes. This phase can use Lane B (lightweight, no tools needed).

**Phase 2 — Execution**
The user approves the confirmation. The frontend re-sends the exact same message with a `pending_action` object in the context envelope that contains the confirmed parameters. The backend detects this, skips re-routing and re-confirmation, and directly executes the write tool with the confirmed payload.

This separates reasoning (what should be created) from execution (actually creating it) at the protocol level, not just the prompt level.

---

### Change 3: Write Tool Registry Guard at Startup

In `main.py` (or wherever `register_repe_tools()` is called), after tool registration completes, run a validation check: if `## Mutation Rules` is in the system prompt string, assert that at least one tool with `permission="write"` is registered. If the assertion fails, either log a prominent warning and suppress the mutation prompt section at runtime, or raise a startup error.

This prevents the prompt/registry drift that caused this incident.

---

### Change 4: Separate Routing for Confirmed Writes vs. Write Attempts

Writes that are in Phase 1 (confirmation) route differently from writes in Phase 2 (execution). Phase 1 is cheap — it's just the model presenting parameters. It should be Lane B or even Lane A if the parameters are inferable from scope. Phase 2 is a single-tool call with no model reasoning needed beyond the pre-confirmed payload.

Currently, write routing sends all write-matched requests to Lane C with `max_tool_rounds=3`. This is appropriate for Phase 2. It is wasteful for Phase 1. And when write tools don't exist at all, it is the engine of the failure described above.

---

### Change 5: Graceful Degradation Response for Unavailable Capabilities

Add a pre-flight check in `run_gateway_stream()`: before entering the model loop, check whether the route decision requires write tools and whether write tools are registered. If the request needs write capability but none exists, emit a single `token` SSE event explaining the limitation and a `done` event — without ever calling the model. This is deterministic, fast, and honest.

---

### Change 6: Tighten `_WRITE_RE` Scope

The pattern must be refactored to require explicit creation intent, not keyword co-occurrence. Until write tools are registered and the two-phase flow is in place, consider disabling `_WRITE_RE` matching entirely in `request_router.py` so write-sounding queries fall through to Lane C (analytical) without activating mutation rules. This is a safety valve while the full architecture is built.

---

## Sequencing: What to Build in What Order

These changes are not independent. They must be deployed together or in a specific sequence to avoid creating new contradictions.

**Step 1 — Suppress mutation rules while write tools are absent**
Before anything else, add the conditional prompt injection guard (Change 1). This stops the hallucination and loop failures immediately. It requires no new tools, no new UI work.

**Step 2 — Register write tools**
Implement `repe.create_fund`, `repe.create_deal`, `repe.create_asset` as MCP ToolDefs with `permission="write"` (per `WINSTON_AGENTIC_PROMPT.md`). Once registered, the mutation rules section will be re-enabled automatically by the guard from Step 1.

**Step 3 — Add confirmed flag to write tool inputs**
Modify the write tool input schemas to include `confirmed: bool = False`. The tools refuse to execute if `confirmed=False` and instead return a structured `{"pending_confirmation": true, "summary": {...}}` object. This enforces the safety gate at the tool layer regardless of what the model decides.

**Step 4 — Frontend: handle `confirmation_required` SSE event**
The frontend needs to detect when a write is pending confirmation and render an appropriate UI (inline banner, modal, or structured message in the conversation pane). This is the user-facing gate. The model cannot bypass it because the tool itself enforces it.

**Step 5 — Tighten `_WRITE_RE` and add false-positive tests**
After the safety gates are in place, refine the routing pattern. False positives are now recoverable (user sees confirmation UI and says no), but they should still be minimized to keep the UX clean.

---

## Guardrails Checklist (for Future Capability Additions)

Before adding any new capability to Winston, validate:

- [ ] The tool is registered in the MCP registry before the system prompt references it
- [ ] The system prompt block for this capability is conditional on the tool being present
- [ ] The router pattern for this capability has been tested for false positives against representative non-mutation queries
- [ ] There is a clear error recovery instruction in the system prompt for when this tool fails
- [ ] The debug drawer surfaces this tool's calls and results distinctly (especially for mutations)
- [ ] A graceful degradation response exists for when the tool is unavailable
- [ ] If the capability is a write/mutation, the two-phase confirmation flow is in place before the tool is enabled in production

---

## Summary

Winston lost the plot because three things happened simultaneously:

1. The model was told it had write capabilities (system prompt)
2. Write requests were routed to a tool-enabled lane (router)
3. The write tools did not exist (registry)

This is a configuration coherence failure, not a model failure. The model did exactly what it was instructed to do — and the infrastructure under it was lying. The fix is to make the system self-consistent: capabilities declared in the prompt must exist in the registry, routes that enable tools must validate those tools exist, and write operations must have an enforcement layer that is not bypassed by prompt drift.

Winston's behavioral issues are symptoms. The disease is a deployment process that allows the system prompt, the router, and the tool registry to go out of sync.
