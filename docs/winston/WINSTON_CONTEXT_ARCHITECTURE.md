# Winston Context Architecture

## Architecture Diagram

```text
Next.js page / modal
  |
  | collects route + env + page entity + visible data
  v
window.__APP_CONTEXT__ bridge
  |
  | merged with command-bar snapshot + session cookie
  v
Context Envelope
  |
  | POST /api/ai/gateway/ask
  v
Next.js AI gateway route
  |
  | fills any missing envelope fields from request/session/referer
  v
FastAPI AI gateway
  |
  | resolve_assistant_scope()
  | build hidden context block
  | log envelope + resolved scope
  v
OpenAI tool-calling loop
  |
  | auto-inject resolved_scope into RE tools
  v
RE tools / RAG / environment snapshot
  |
  | SSE: context, citation, tool_call, tool_result, token, done
  v
Winston UI + Advanced Debug panel
```

## Context Envelope Spec

Every Winston request carries three layers:

```json
{
  "session": {
    "user_id": null,
    "org_id": "business_uuid",
    "actor": "user:env_uuid",
    "roles": ["env_user"],
    "session_env_id": "env_uuid"
  },
  "ui": {
    "route": "/lab/env/{envId}/re/funds",
    "surface": "fund_portfolio",
    "active_module": "re",
    "active_environment_id": "env_uuid",
    "active_environment_name": "Meridian Capital Management",
    "active_business_id": "business_uuid",
    "schema_name": "env_meridian_capital",
    "industry": "repe",
    "page_entity_type": "environment",
    "page_entity_id": "env_uuid",
    "selected_entities": [],
    "visible_data": {
      "funds": [],
      "investments": [],
      "assets": [],
      "models": [],
      "pipeline_items": [],
      "metrics": {},
      "notes": []
    }
  },
  "thread": {
    "thread_id": "conversation_uuid",
    "assistant_mode": "environment_copilot",
    "scope_type": "environment",
    "scope_id": "env_uuid",
    "launch_source": "winston_modal"
  }
}
```

## Implementation

### Frontend context injection

- `repo-b/src/lib/commandbar/appContextBridge.ts`
  - publishes `window.__APP_CONTEXT__`
  - stores environment context and visible page data
- `repo-b/src/components/repe/workspace/ReEnvProvider.tsx`
  - publishes active `environment_id`, `business_id`, `schema_name`, `industry`
- `repo-b/src/app/app/repe/funds/page.tsx`
  - publishes visible funds and portfolio metrics
- `repo-b/src/app/lab/env/[envId]/re/funds/[fundId]/page.tsx`
  - publishes current fund + visible investments + KPI metrics
- `repo-b/src/lib/commandbar/contextEnvelope.ts`
  - merges app bridge, route, snapshot, and session cookie into one envelope

### Scope resolver

- `backend/app/services/assistant_scope.py`
  - normalizes the context envelope
  - resolves scope in this order:
    1. explicit entity named in the user message from UI-visible entities
    2. selected/page entity for deictic prompts like "this fund"
    3. active environment from UI context
    4. thread scope
    5. session default environment
  - enriches resolved scope with `business_id`, `schema_name`, and `industry`
  - builds the hidden application context block for the model

### Tool contract updates

- `backend/app/mcp/schemas/repe_tools.py`
  - RE tools now accept `scope` and `resolved_scope`
  - primitive IDs are optional when current context already identifies the entity
- `backend/app/mcp/tools/repe_tools.py`
  - defaults tool calls from `ctx.resolved_scope`
  - `repe.list_assets` can aggregate assets across the current fund
  - adds `repe.get_environment_snapshot`
- `backend/app/services/ai_gateway.py`
  - auto-injects `resolved_scope` into RE tool calls before execution

### Debugging instrumentation

- Every AI request logs:
  - `context_envelope`
  - `resolved_scope`
  - tool call args
  - tool result previews
- SSE debug events now include:
  - `context`
  - `tool_call`
  - `tool_result`
  - `done`
- `repo-b/src/components/commandbar/AdvancedDrawer.tsx`
  - shows context envelope, resolved scope, and tool activity

## Migration Plan

1. Populate page-level context publishers for remaining high-value routes.
2. Migrate any non-RE Winston tools to accept `resolved_scope` where applicable.
3. Add selected-row publishing for grids so multi-select workflows can resolve without text hints.
4. Extend the same envelope into dashboard agents and SQL agents.
5. Keep the envelope contract stable and additive; avoid route-specific prompt hacks.

## Example Requests

### Funds page

User route:

```text
/lab/env/env_123/re/funds
```

User prompt:

```text
which funds do we have?
```

Expected behavior:

- use visible UI funds first
- default to active environment
- do not ask for a business ID

### Fund detail page

User route:

```text
/lab/env/env_123/re/funds/fund_1
```

User prompt:

```text
show assets in this fund
```

Expected behavior:

- resolve selected/page fund scope
- call `repe.list_assets` with resolved fund scope if needed

## Test Scenarios

- funds page + visible funds + prompt `which funds do we have?`
  - assistant returns visible funds
- fund detail page + prompt `what is the strategy for IGF VII?`
  - assistant resolves explicit fund name from UI data
- fund detail page + prompt `show assets in this fund`
  - assistant resolves current fund from page scope
- fund detail page + prompt `which funds do we have?`
  - assistant defaults back to environment scope, not the current fund

## Code Skeletons

### Frontend request

```ts
const contextEnvelope = buildAssistantContextEnvelope({
  context,
  snapshot,
  conversationId,
  launchSource: "winston_modal",
});

await askAi({
  message,
  business_id: contextEnvelope.ui.active_business_id || undefined,
  env_id: contextEnvelope.ui.active_environment_id || undefined,
  conversation_id: conversationId || undefined,
  context_envelope: contextEnvelope,
});
```

### Backend scope resolution

```py
envelope = ensure_context_envelope(
    context_envelope=context_envelope,
    env_id=str(env_id) if env_id else None,
    business_id=str(business_id) if business_id else None,
    conversation_id=str(conversation_id) if conversation_id else None,
    actor=actor,
)
resolved_scope = resolve_assistant_scope(
    user=actor,
    context_envelope=envelope,
    user_message=message,
)
```

### Tool execution

```py
raw_args = _maybe_attach_scope(tool_def, raw_args, resolved_scope.model_dump())
tool_result = execute_tool(tool_def, ctx, raw_args)
```
