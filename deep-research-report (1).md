# Contract-driven architecture for Winston chat consistency

## Diagnosis in the current codebase

The repository already contains the right strategic direction. The frontend app is explicitly described as the UI plus a same-origin proxy/BFF layer, and the Winston `/api/ai/gateway/ask` route in the frontend states that the backend AI Gateway is the only valid user-facing runtime and that direct provider fallback has been intentionally removed. The backend likewise centralizes chat, conversation CRUD, readiness, logs, stats, and tool-failure reporting under `/api/ai/gateway/*`. citeturn7view0turn20view0turn28view0

The remaining inconsistency is not primarily “wrong architecture,” but *incomplete contract enforcement*. The Next.js route still builds a fallback context envelope by inferring route, environment, business, scope, assistant mode, and launch source from partial request state, session state, and the `referer`; that means the backend can receive a semantically meaningful request even when the caller did not provide a fully valid contract. On the client side, the Winston parser still tolerates multiple shapes at the transport boundary: canonical SSE events, plain-text fragments when JSON parse fails, and a non-streaming JSON path when no reader is present. In parallel, the frontend and backend maintain separate handwritten definitions for context envelopes, scope receipts, response blocks, and turn metadata, which is precisely the kind of drift that produces environment-specific behavior. citeturn20view0turn38view1turn38view2turn30view0turn39view0

There are also still traces of “alternate runtime” thinking in the wire-adjacent types and logs. The frontend trace type allows execution paths such as `chat`, `tool`, `rag`, `hybrid`, `repe_fast_path`, and `unavailable`; the backend log serializer still exposes `fallback_used`; and current fail-closed error payloads mark transport failures with `canonical_runtime: false` and `degraded: true`, which conflates “completed but degraded answer” with “answer never validly materialized.” That ambiguity is exactly what creates partial UI states and inconsistent rendering. citeturn37view0turn32view4turn20view0

The good news is that the codebase already has strong enforcement primitives to build on. There is a launch-surface contract with required context fields and declared degraded behavior, a backend readiness check that validates schema version, required DB columns, required indexes, allowed thread kinds, allowed scope types, and supported surface IDs, and frontend tests that already reject OpenAI-style token streams from non-canonical runtimes and treat an empty terminal-only stream as unavailable. This means the highest-value solution is a *tightening pass*, not a platform rewrite. citeturn10view0turn46view0turn47view0

## Principles that should govern the redesign

For contract-first API design, the strongest baseline is to make the chat API an OpenAPI 3.1 contract backed by JSON Schema 2020-12, because OpenAPI 3.1 is aligned with modern JSON Schema and Pydantic can generate schemas compatible with both JSON Schema Draft 2020-12 and OpenAPI 3.1. That gives one canonical machine-readable source from which documentation, test fixtures, typed clients, and validation rules can all be derived. citeturn40search4turn40search12turn40search1turn41search0

For cross-stack validation, the pattern is straightforward: validate strictly on the backend at ingress and strictly on the frontend at the network boundary. Pydantic supports forbidding extra fields, and the Winston backend context models already do this in multiple places. On the frontend, Zod’s `safeParse()` is specifically designed for safe boundary validation without throwing, and TypeScript’s discriminated unions support exhaustive handling so impossible UI states can be eliminated at compile time rather than merely caught in QA. citeturn30view0turn43search18turn41search1turn42search0

Streaming needs a separate discipline because framework defaults are not enough. FastAPI validates and documents normal `response_model` responses, but when you return a `Response` directly, validation and automatic documentation are bypassed, and `StreamingResponse` hands chunks through as-is. Server-Sent Events themselves are intentionally low-level: the stream must use `text/event-stream`, UTF-8, and event framing based on fields plus blank-line delimiters. In other words, the HTTP framework will carry the stream, but *your application* must enforce event grammar, ordering, and terminal-state guarantees. citeturn43search0turn43search6turn43search8turn40search2turn40search6

Failure behavior and cross-service observability have equally clear best practices. Security guidance recommends failing along the same path as “deny” rather than quietly continuing down a weaker path; improper error handling is a classic source of fail-open behavior. For multi-service request tracing, the strongest interoperable baseline is a propagated trace context, with logs correlated to trace identifiers and, where necessary, limited downstream context carried as baggage. For contract testing, consumer-driven contracts are a recognized pattern, and schema-driven test generation is a practical way to systematically exercise edge cases. citeturn40search3turn40search19turn45search0turn45search1turn45search2turn41search6turn41search2turn44search5

## Proposed canonical contract

The concrete design I recommend is a **single backend-authored Winston wire contract** with two layers. The first layer is the normal REST contract, published as OpenAPI 3.1 from the backend. The second layer is a versioned JSON Schema for each SSE event shape, referenced by the backend and consumed by the frontend. This takes advantage of what the repo already has: strict backend Pydantic models, a contract folder in the frontend, and launch-surface contract loading on both sides. It avoids adding a separate contract registry or runtime framework while still making drift impossible to hide. citeturn30view0turn46view1turn41search0turn44search0turn44search3

The backend should remain the source of truth for **request semantics**. `WinstonChatRequest` should be the canonical ingress model and should include only fields that have stable product meaning: `message`, `conversation_id`, `business_id`, `env_id`, `context_envelope`, and the explicit pending-action fields already in use. The frontend should stop maintaining handwritten parallel request types for these shapes and instead consume generated types from the backend schema. That is the cleanest way to remove backend/frontend schema skew with minimum added complexity. citeturn30view0turn39view0turn44search0turn44search3

The backend should also become the source of truth for **outcome semantics**. I would split terminal outcomes into two unambiguous families:

- **Transport-level/unavailability outcomes**: the request never produced a valid assistant turn. These are returned as ordinary JSON error responses before or instead of streaming.
- **Turn-level completion outcomes**: the request produced a valid terminal `done` event with `status: "success"` or `status: "degraded"` and, if degraded, a closed-enum `degraded_reason`.

That is materially better than the current pattern, where transport failures can still carry `degraded: true`, because it stops the UI from mistaking “no valid result” for “valid but degraded result.” citeturn20view0turn39view0

The existing launch-surface contract should be elevated from “helpful metadata” to **hard context policy**. The repo already defines route patterns, `thread_kind`, `scope_type`, required context fields, and expected degraded behavior for each supported Winston surface, and the backend readiness check already validates those definitions against allowed thread kinds and scope types. The missing step is to make request acceptance depend on that contract. If a request targets a known launch surface and required fields are absent after deterministic server-side hydration, the backend should return `409 context_unresolved` rather than silently substituting a generic copilot mode. Degradation should remain allowed, but only when the canonical runtime explicitly declares it as part of a valid final turn. citeturn10view0turn46view0turn20view0

A minimal canonical event union would look like this:

```ts
type WinstonStreamEvent =
  | { type: "ack"; seq: number; request_id: string; contract_version: string; conversation_id?: string; runtime: { canonical_runtime: true } }
  | { type: "context"; seq: number; context_envelope: AssistantContextEnvelope; resolved_scope: ResolvedAssistantScope | null }
  | { type: "tool_call"; seq: number; tool: AssistantToolActivityItem }
  | { type: "tool_result"; seq: number; tool_name: string; success: boolean; result_preview?: string }
  | { type: "response_block"; seq: number; block: AssistantResponseBlock }
  | { type: "token"; seq: number; text: string }
  | { type: "citation"; seq: number; citation: AssistantCitationItem }
  | { type: "heartbeat"; seq: number }
  | { type: "done"; seq: number; status: "success" | "degraded"; answer: string; response_blocks: AssistantResponseBlock[]; turn_receipt: TurnReceipt; trace: WinstonTrace }
  | { type: "error"; seq: number; code: string; message: string; retryable: boolean };
```

The important point is not the names, but the *closed union*. Every event must validate against one of these shapes, and nothing else is renderable.

## Deterministic streaming lifecycle

The stream should follow one lifecycle only: **`ack` → optional `context` → zero or more content/tool/citation/heartbeat events → exactly one terminal event (`done` or `error`)**. Every event should carry a monotonic `seq`, and the client should assert contiguous ordering. If `seq` jumps, if an event type is unknown, if the payload does not validate, or if the stream closes without a terminal event, the client should fail closed and transition to an unavailable/error state. This is the lifecycle discipline that sits on top of the SSE framing rules from the platform spec. citeturn40search2turn40search6turn43search6

The terminal event must be the **authoritative final state**. Tokens are for progressive display only. `response_block` events may be rendered optimistically if they validate, but the UI should still reconcile against the final `done.response_blocks`. The `done` event should carry the final answer text, the final block list, the final turn receipt, and the final trace. That gives the frontend a single authoritative object for persistence, replay, and rendering, while still preserving a responsive stream. The repo already points in this direction: the client records response blocks, turn receipts, and trace data from the `done` event, and tests already assert that canonical success includes `runtime.canonical_runtime: true`. citeturn38view1turn47view0

The current client parser should be tightened further. Today it already refuses OpenAI-style delta tokens from non-canonical runtimes and already marks an empty stream as unavailable, which is exactly the right instinct. But it should stop accepting plain-text parse fallbacks and stop using the non-streaming JSON branch for Winston chat. After this redesign, `/api/ai/gateway/ask` should mean one thing only: canonical Winston SSE. If a backend or proxy returns any other shape, that is not “best effort”; it is a contract violation. citeturn38view1turn38view2turn47view0

Because FastAPI does not validate streaming chunks for you, the backend should validate each event object *before* serializing it into SSE lines. The cheapest way to do that is to introduce explicit backend event models and a single `emit_event(event_model)` helper that validates, serializes, appends `seq`, and yields the final wire representation. That ensures that malformed events never leave the canonical runtime in any environment. citeturn43search6turn43search8turn41search0

A practical lifecycle contract would be:

```text
1. Backend validates request.
2. Backend emits ack(seq=0, canonical_runtime=true, contract_version=...).
3. Backend emits context once scope is resolved.
4. Backend emits tool_call / token / response_block / citation events as work progresses.
5. Backend emits heartbeat every N seconds during long tool/model waits.
6. Backend emits exactly one terminal done or error.
7. Client renders completed state only from terminal payload.
8. Missing terminal payload => unavailable state, never partial success.
```

That is deterministic enough to make dev, staging, and production behave identically.

## Failure handling and runtime observability

The central fail-closed rule should be this: **there is only one Winston runtime, and every other condition is absence of Winston, not an alternate Winston**. That means no frontend fallback, no direct vendor path, no browser-only parser mode, and no separate “fast path” that changes the contract. Optimizations may still exist internally, but they should be represented as trace metadata, such as `optimizer: "repe_fast_path"`, not as a different execution path with different wire behavior. The external contract must remain invariant even when the backend takes an optimized internal branch. citeturn20view0turn37view0

That same rule should clean up status semantics. I recommend four final UI-level result classes: `completed`, `degraded`, `failed`, and `unavailable`. `degraded` should only mean “a valid `done` was produced, but the backend declared a controlled limitation using a closed-enum reason.” `unavailable` should only mean “no valid final turn existed,” such as backend unreachable, bad contract, unauthorized, context unresolved, or stream terminated without terminal event. This sharp boundary removes the ambiguity in the current error payloads and prevents the UI from trying to render half-valid assistant turns. citeturn20view0turn39view0turn47view0

For observability, the best pattern is to stop treating `x-request-id` as the primary cross-service identity and instead propagate a real trace context end to end, while still logging a human-friendly request ID if desired. The standard trace header exists precisely to let multiple services correlate one request, and OpenTelemetry can correlate logs with trace and span identifiers automatically; baggage can carry carefully selected non-sensitive routing context downstream. For Winston specifically, every trace/log/span should include `contract_version`, `launch_surface_id`, `conversation_id`, `turn_status`, `degraded_reason`, `lane`, `optimizer`, `terminal_event_seen`, and `ui_final_state`, while the backend’s existing `/logs`, `/stats`, and `/tool-failures` endpoints should surface those fields for debugging and regression analysis. citeturn45search0turn45search1turn45search2turn41search23turn32view4turn28view0

The readiness endpoint should also move from “nice diagnostic” to **deployment gate**. The repository already checks launch-surface contract integrity, schema version marker, required columns, required indexes, and allowed scope definitions. Every environment deployment should fail promotion if readiness is not clean, and every frontend build should know the expected backend contract version before it is deployable. That is one of the simplest ways to prevent staging and production from drifting apart. citeturn46view0turn28view0

## UI final-state enforcement and rollout safeguards

The UI should be modeled as a **finite state machine encoded with a discriminated union**, not as a cluster of booleans. TypeScript’s exhaustiveness checking is exactly the right tool for this, and the repo already has useful turn-status vocabulary and a typed block union that can feed such a reducer. The winning minimal-complexity design is a typed reducer with exhaustive `switch` handling rather than a new dependency-heavy state-machine runtime. citeturn42search0turn39view0

A good state model would look like this:

```ts
type ChatUiState =
  | { kind: "idle" }
  | { kind: "submitting"; requestId: string }
  | { kind: "streaming"; requestId: string; lastSeq: number; previewText: string; blocks: AssistantResponseBlock[] }
  | { kind: "completed"; requestId: string; done: DoneEvent }
  | { kind: "degraded"; requestId: string; done: DoneEvent }
  | { kind: "failed"; requestId: string; error: ErrorEvent }
  | { kind: "unavailable"; requestId: string; reason: UnavailableReason };
```

The render rule then becomes simple: only `completed` and `degraded` may show final assistant content; `failed` and `unavailable` may show a single validated error block; `streaming` may show provisional preview text but must never be persisted as the final turn.

That is how you eliminate malformed composite states such as “token text visible + invalid cards + no terminal receipt.” The repo’s current parser already has pieces of this idea: it collects blocks, trace, and turn receipts, and it already falls back to an unavailable message when nothing valid materializes. The redesign turns those heuristics into a hard UI contract. citeturn38view1turn38view2turn47view0

For regression protection, best practice would be consumer/provider contract verification, but this repo can get most of the value with a lighter monorepo approach first. The frontend already has contract-validation tests and SSE behavior tests; extend that pattern into **golden transcript replay**. Check in a small set of canonical SSE transcripts and run them through both backend event-schema tests and frontend parser/render tests. Add OpenAPI drift detection in CI, fail the build when generated frontend contract artifacts are stale, and run post-deploy smoke tests in dev, staging, and production that verify the same request yields the same contract version, the same launch surface resolution, a valid terminal event, and no unknown events. If the frontend and backend later split into separate repos, then adding Pact-style contract publication and provider verification becomes worthwhile. citeturn47view0turn47view1turn41search6turn41search2turn44search5turn46view0

The highest-reliability, lowest-complexity implementation sequence is therefore:

- **Generate the Winston request/response/event contract from the backend and consume generated types in the frontend.** This removes handwritten drift at the boundary. citeturn30view0turn39view0turn44search0turn44search3
- **Replace generic fallback context synthesis with deterministic hydration plus hard context rejection.** If required launch-surface context is missing, return `context_unresolved`; do not silently downgrade mode or scope. citeturn10view0turn46view0turn20view0
- **Make the SSE grammar closed and terminal.** One canonical Winston stream format, one terminal event, and no plain-text or alternative JSON parsing at the chat boundary. citeturn40search2turn43search6turn38view1turn38view2
- **Render from finite UI states only.** Tokens are provisional; final UI comes from validated `done` or validated `error/unavailable`. citeturn42search0turn39view0turn47view0
- **Gate every deployment on readiness plus transcript smoke tests.** That is the simplest practical safeguard against dev/staging/production divergence. citeturn46view0turn28view0turn47view0

If you implement only those five changes, Winston chat will behave as a single canonical system across environments, silent fallback behavior will disappear, every request will end in an explicit valid final state, partial rendering will be structurally prevented, and the repo will gain durable regression checks without taking on much new runtime complexity. citeturn20view0turn46view0turn47view0turn42search0