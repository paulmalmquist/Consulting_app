# Prepare Winston MCP server for Claude Cowork

## Current MCP infrastructure in `Consulting_app`

You already have a complete MCP stack in-repo, with two transports:

- **Stdio MCP server (local process)**: `backend/app/mcp/server.py` registers all tool groups and serves MCP JSON-RPC over stdin/stdout. fileciteturn10file0  
  - Local runner script: `scripts/run_mcp_server.sh` activates the backend venv and starts the stdio server (`python -m app.mcp.server`). fileciteturn20file0  
  - Local config for Claude Code / Codex CLI: `.codex/config.toml` and `repo-b/.codex/config.toml`. fileciteturn15file0turn16file0  

- **HTTP MCP server (remote / web)**: `backend/app/mcp/http_transport.py` exposes:
  - `POST /mcp` (MCP JSON-RPC over HTTP: `initialize`, `tools/list`, `tools/call`)
  - `GET /mcp/tools` (REST discovery)
  - `POST /mcp/tools/{tool_name}` (REST proxy)
  - `GET /mcp/health` (no-auth health check) fileciteturn9file0  
  This router is **mounted on the backend FastAPI app** via `app.include_router(mcp_http_router)` in `backend/app/main.py`, and tools are registered at startup by `_register_all_tools()`. fileciteturn14file0  

**Auth model (current):** HTTP MCP requires `Authorization: Bearer <token>` where the token must match `MCP_API_TOKEN` on the server. fileciteturn9file0  
This aligns with MCP’s documented “Bearer token in Authorization header” expectation for HTTP-based transports. citeturn4view0

## What Claude Cowork expects for remote MCP connectors

Important Cowork-specific constraints:

- **Cowork remote connectors are brokered from entity["company","Anthropic","ai safety company"] cloud infrastructure**, not from the user’s local machine network. So your MCP server must be publicly reachable over HTTPS, and if you’re behind a firewall you must allow inbound traffic from Anthropic’s published IP ranges. citeturn2view0turn1view0turn8view0  
- entity["company","Anthropic","ai safety company"] supports **Streamable HTTP** remote MCP servers (recommended) and SSE (but SSE may be deprecated). Your server is already Streamable HTTP. citeturn1view0 fileciteturn9file0  
- Cowork custom connectors are added via **Customize → Connectors** (or organization connector settings), not just by editing local JSON config files. citeturn2view0turn1view0  

## Cowork integration checklist

### Ensure the MCP endpoint is production-reachable

1) Deploy the backend such that this endpoint is reachable:

- `https://<your-backend-host>/mcp/health` (should return `{status:"ok", tool_count: ...}`) fileciteturn9file0  

2) If you run behind a firewall, allowlist Anthropic egress ranges for outbound requests (these are the source IPs for MCP tool calls from Claude’s infrastructure):

- Outbound IPv4: `160.79.104.0/21` citeturn8view0  
- Outbound IPv6: `2607:6bc0::/48` citeturn8view0  

(If you’re on a public host like entity["company","Railway","deployment platform"] with no restrictive firewall rules, you typically don’t need explicit allowlisting—just ensure the service is public.)

### Configure server environment variables

On your backend deployment, set:

- `MCP_API_TOKEN=<strong random token>` fileciteturn9file0  
- `MCP_ACTOR_NAME=claude_cowork` (helps audit logs attribute calls) fileciteturn9file0  
- `MCP_RATE_LIMIT_RPM=60` (optional) fileciteturn12file0  
- `ENABLE_MCP_WRITES=false` initially (recommended for first connect) fileciteturn12file0turn22file0  

Then, only after you confirm tool visibility and correct environment scoping, flip:

- `ENABLE_MCP_WRITES=true` (enables write tools; write tools are still expected to require two-phase confirmation inside the tool handler flow) fileciteturn22file0turn9file0  

### Add the custom connector in Cowork

Use Cowork / Claude UI flow:

- Go to **Customize → Connectors → Add custom connector** and enter your MCP server URL:
  - `https://<your-backend-host>/mcp` citeturn2view0  

If Cowork prompts you to “Connect” / authenticate:
- If it supports a **token field**, supply the same token as `MCP_API_TOKEN` (your server expects a Bearer token). fileciteturn9file0 citeturn4view0  
- If it requires **OAuth**, you’ll need an OAuth implementation (see “Hardening” below). citeturn4view0turn7view0  

### Validate in Cowork

Use a minimal prompt that forces tool discovery:

- “What tools do you have available from the Winston connector?”

You should see tool names from `tools/list` (served by `backend/app/mcp/http_transport.py`). fileciteturn9file0  

## Recommended hardening for Cowork use

This part is not strictly required to “connect,” but it prevents the two most common failures when you expose a large internal MCP registry to a remote connector:

### Limit the tool surface area exposed to Cowork

Right now, `tools/list` returns **everything**: infra tools, repo tools, db tools, etc. fileciteturn10file0turn9file0  
For Cowork, you usually want something like:

- `repe_*` (Meridian / REPE)
- `pds_*` (PDS)
- `resume_*` (Paul resume environment)
- `crm_*` (if you want operational workflows)
- `meta.*` (health/list)

But not:

- `git.*`, `fe.*`, `repo.*`, `db.*` (especially dangerous over a remote connector)

**Low-effort patch:** implement an env var allowlist in `backend/app/mcp/http_transport.py`, e.g.:

- `MCP_HTTP_MODULE_ALLOWLIST=repe,finance,pds,resume,crm,meta`

Then filter `registry.list_all()` and `registry.get()` accordingly. Your platform doc explicitly anticipates scoped tool access as a next step (per-client keys + scope modules). fileciteturn6file0  

### Add MCP “tool safety annotations” in `tools/list`

Anthropic’s directory guidance requires tools to have “readOnlyHint” or “destructiveHint” annotations. citeturn7view0  
You already have the underlying information (`ToolDef.permission == "read"|"write"`) in `backend/app/mcp/registry.py`. fileciteturn21file0  

**Practical patch:** in `backend/app/mcp/http_transport.py`, when building each tool entry in `tools/list`, add:

- `annotations: { readOnlyHint: true }` for read tools
- `annotations: { destructiveHint: true }` for write tools

This improves Cowork UI affordances and reduces accidental “Allow always” misuse.

### Decide whether you need OAuth now or later

If you intend to:
- distribute beyond yourself,
- have multiple users,
- or submit to a directory,

then OAuth is the correct route (directory guidance: OAuth is required if auth is required). citeturn7view0turn4view0  

If you are single-operator (Paul-only) and Cowork supports a static token entry, your current `MCP_API_TOKEN` bearer token approach can be sufficient as a stepping stone. fileciteturn9file0

## Concrete validation commands

Run these from anywhere to validate the remote server before touching Cowork:

```bash
# Health (no auth required)
curl -s https://<your-backend-host>/mcp/health | jq .

# Tool inventory (auth required)
curl -s https://<your-backend-host>/mcp/tools \
  -H "Authorization: Bearer <MCP_API_TOKEN>" | jq '.tool_count'

# MCP JSON-RPC initialize (auth required)
curl -s https://<your-backend-host>/mcp \
  -H "Authorization: Bearer <MCP_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | jq .

# MCP tools/list (auth required)
curl -s https://<your-backend-host>/mcp \
  -H "Authorization: Bearer <MCP_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '.result.tools | length'
```

These flows correspond directly to the methods your server implements (`initialize`, `tools/list`, `tools/call`). fileciteturn9file0