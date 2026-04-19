# Winston Managed Agent v1

This repo now includes an internal operator-side Anthropic Managed Agent setup for Winston.

## Terminology
- **Agent**: model, system prompt, tools, MCP servers, and skills.
- **Environment**: managed container template and networking policy.
- **Session**: a running agent instance in an environment.
- **Events**: the streamed runtime protocol between your app and the session.

Vaults and credentials are **auth infrastructure**, not core runtime primitives. In this v1 implementation, the vault is a deliberate temporary shortcut for internal operator use.

## What This Does
- Keeps Winston’s current product runtime unchanged.
- Creates or reuses an Anthropic Agent, Environment, Vault, and static bearer credential for Winston’s remote MCP server.
- Verifies Winston’s deployed MCP endpoint is actually usable by Managed Agents:
  - `GET /mcp/health`
  - JSON-RPC `initialize`
  - JSON-RPC `tools/list`
  - remote HTTP / streamable-HTTP-compatible transport gate
- Starts a smoke session and fails bootstrap if the session stream surfaces MCP auth or other session errors.

## Files
- [scripts/winston_managed_agent_profile.json](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/winston_managed_agent_profile.json)
- [scripts/winston_managed_agent_bootstrap.py](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/winston_managed_agent_bootstrap.py)
- [scripts/winston_managed_agent_chat.py](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/scripts/winston_managed_agent_chat.py)
- [backend/app/services/winston_managed_agent.py](/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app/backend/app/services/winston_managed_agent.py)

## Required Environment Variables
- `ANTHROPIC_API_KEY`
- `MCP_API_TOKEN`

Optional overrides:
- `WINSTON_MANAGED_AGENT_NAME`
- `WINSTON_MANAGED_AGENT_MODEL`
- `WINSTON_MANAGED_ENV_NAME`
- `WINSTON_MANAGED_MCP_URL`
- `WINSTON_MANAGED_VAULT_NAME`
- `WINSTON_MANAGED_AGENT_VERSION`

## Bootstrap
Run:

```bash
python3 scripts/winston_managed_agent_bootstrap.py
```

Default behavior:
- loads the tracked profile
- reuses matching resources by stable name + metadata when available
- rotates or creates the static bearer credential for the configured MCP URL
- runs a smoke session using Winston MCP tools
- writes local state to `scripts/.winston_managed_agent_state.json`

To print only and skip the local state file:

```bash
python3 scripts/winston_managed_agent_bootstrap.py --no-state-file
```

To skip the smoke session:

```bash
python3 scripts/winston_managed_agent_bootstrap.py --skip-smoke
```

## Chat
Create a new session:

```bash
python3 scripts/winston_managed_agent_chat.py Summarize the Business Machine MCP capabilities.
```

Resume an existing session:

```bash
python3 scripts/winston_managed_agent_chat.py --session-id sesn_... Continue from the last result and go one level deeper.
```

Pin a specific agent version for a new session:

```bash
python3 scripts/winston_managed_agent_chat.py --agent-version 3 What changed in this version of Winston?
```

Auto-approve all tool confirmations for the current turn:

```bash
python3 scripts/winston_managed_agent_chat.py --auto-approve List five Winston tools and what they do.
```

By default the chat script reads Anthropic resource IDs from `scripts/.winston_managed_agent_state.json`, which is written by bootstrap.

## Permission Policy
The Winston MCP toolset is created with an explicit `always_ask` permission policy in v1.

That means:
- tool calls pause on `session.status_idle` with `stop_reason: requires_action`
- the operator script must answer with `user.tool_confirmation`
- write intent remains confirmation-first

No broad allowlisting is configured in this phase. Only explicitly safe read-only MCP tools should be considered for later allowlisting.

## Failure Handling
- Bootstrap treats any failed MCP preflight gate as a hard failure.
- Bootstrap treats any `session.error` during the smoke turn as a hard failure.
- This is especially important for MCP auth: Anthropic will still create a session even if the vault credential is bad, then emit `session.error` later.
- The chat script also fails loudly on `session.error` instead of silently continuing degraded.

## Temporary Shared Vault
This v1 uses a shared operator vault on purpose, but it is not the long-term target.

Anthropic’s vault model is session-scoped and designed for per-user credential mapping. The next step after this internal operator phase is:
- one vault per end user
- one or more credentials per user vault
- passing `vault_ids` per session based on the actual user identity
