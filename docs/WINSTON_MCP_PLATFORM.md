# Winston MCP Platform Architecture

> **Purpose:** Winston becomes the intelligence backend. Any AI interface — Claude Desktop, Claude Code, ChatGPT, custom web apps — becomes the operating surface. The Winston web frontend remains as the visual companion for dashboards, charts, and data views.
>
> **Last updated:** 2026-03-26

---

## Vision

The market is moving toward "bring your own AI." Companies will connect their preferred AI (OpenAI, Anthropic, Google) to their business tools via MCP or similar protocols. Winston's competitive advantage is not the chat UI — it's the 80+ MCP tools, the domain models, the data layer, and the audit infrastructure underneath.

The architecture is:

```
┌─────────────────────────────────────────────────────┐
│                   AI CLIENTS                         │
│  Claude Desktop  │  Claude Code  │  ChatGPT  │  Web │
└────────┬─────────┴───────┬───────┴─────┬──────┴──┬──┘
         │ MCP (stdio)     │ MCP (HTTP)  │ REST    │ REST
         ▼                 ▼             ▼         ▼
┌─────────────────────────────────────────────────────┐
│              WINSTON MCP GATEWAY                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  stdio   │  │ HTTP/SSE │  │ REST proxy       │  │
│  │ transport│  │ transport│  │ (ChatGPT-compat)  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────────────┘  │
│       └──────────────┼─────────────┘                │
│                      ▼                               │
│  ┌─────────────────────────────────────────────┐    │
│  │          TOOL REGISTRY (80+ tools)          │    │
│  │  CRM · Pipeline · REPE · PDS · Credit ·     │    │
│  │  Documents · RAG · Finance · Analytics ·     │    │
│  │  Governance · Environment · Query Engine     │    │
│  └──────────────────┬──────────────────────────┘    │
│                     ▼                                │
│  ┌─────────────────────────────────────────────┐    │
│  │  Auth · Audit · Rate Limit · Permissions    │    │
│  └──────────────────┬──────────────────────────┘    │
└─────────────────────┼───────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│              WINSTON BACKEND SERVICES                 │
│  FastAPI · Supabase · AI Gateway · RAG · Domain Svc │
└─────────────────────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│           WINSTON WEB (Visual Companion)             │
│  Dashboards · Charts · Data Views · Lab Environments │
│  Read-only visualization of what MCP tools create    │
└─────────────────────────────────────────────────────┘
```

---

## Transport Layers

### 1. Stdio Transport (Claude Code, Codex CLI)

**Status:** Existing, production-ready

- Entry point: `backend/app/mcp/server.py`
- Launch: `./scripts/run_mcp_server.sh`
- Config: `.codex/config.toml`
- Auth: `MCP_API_TOKEN` env var
- Best for: developers, CI/CD, Claude Code CLI

### 2. HTTP Transport (Claude Desktop, ChatGPT, Web Apps)

**Status:** NEW — just built

- Entry point: `backend/app/mcp/http_transport.py`
- Mounted at: `POST /mcp` (MCP JSON-RPC protocol)
- REST proxy: `POST /mcp/tools/{tool_name}` (simpler REST calls)
- Tool discovery: `GET /mcp/tools` (OpenAPI-compatible listing)
- Auth: `Authorization: Bearer <token>` header
- Health: `GET /mcp/health` (no auth required)

The HTTP transport serves three client types simultaneously:

| Client | Protocol | Endpoint |
|---|---|---|
| Claude Desktop / Cowork | MCP JSON-RPC over HTTP | `POST /mcp` |
| Claude Code (remote) | MCP JSON-RPC over HTTP | `POST /mcp` |
| ChatGPT (function calling) | REST + JSON schema | `GET /mcp/tools` + `POST /mcp/tools/{name}` |
| Custom web apps | REST | `POST /mcp/tools/{name}` |

### 3. Future: WebSocket Transport

For real-time bidirectional communication (streaming tool responses, live updates). Not needed yet — build when we have clients that need it.

---

## Tool Inventory

### Existing Tools (60+ registered)

| Module | Tools | Domain |
|---|---|---|
| business | 7 | Business provisioning, templates, departments |
| repe_* | 20+ | Fund management, waterfalls, Monte Carlo, scenarios, LP analytics |
| credit | 5+ | Credit decisioning, underwriting |
| document | 2+ | Document management, extraction |
| query | 1 | Natural language → SQL/Python router |
| env | 2 | Environment configuration |
| meta | 3 | Health, system description, tool listing |
| git, fe, db, repo | 5+ | Dev infrastructure |
| governance | 2+ | Governance, audit |

### NEW: CRM + Revenue Tools (21 tools)

| Tool | Permission | What it does |
|---|---|---|
| `crm.list_accounts` | read | List all CRM accounts |
| `crm.create_account` | write | Create prospect/client account |
| `crm.get_account` | read | Get account details |
| `crm.list_pipeline_stages` | read | List pipeline stages with probabilities |
| `crm.list_opportunities` | read | List all deals with stage/amount |
| `crm.create_opportunity` | write | Create a sales opportunity |
| `crm.move_opportunity_stage` | write | Move deal through pipeline |
| `crm.list_activities` | read | List calls, meetings, notes |
| `crm.create_activity` | write | Log a call, meeting, or note |
| `crm.create_lead` | write | Create qualified lead with scoring |
| `crm.list_leads` | read | List leads by qualification tier |
| `crm.create_proposal` | write | Create proposal with margin calc |
| `crm.list_proposals` | read | List proposals with status |
| `crm.send_proposal` | write | Mark proposal as sent |
| `crm.list_outreach_templates` | read | List message templates |
| `crm.create_outreach_template` | write | Create reusable template |
| `crm.log_outreach` | write | Log outreach touch |
| `crm.record_reply` | write | Record prospect reply |
| `crm.create_engagement` | write | Create client engagement |
| `crm.list_engagements` | read | List engagements |
| `crm.pipeline_scoreboard` | read | Live revenue metrics |

---

## Auth Architecture

### Current: Single Token

```
MCP_API_TOKEN=<shared-secret>
```

Works for single-operator use (Paul running Novendor).

### Next: Per-Client API Keys

```
Client → Authorization: Bearer <client_api_key>
  → Lookup client_id, scope, rate_limit
  → McpContext(actor=client_id, scope=allowed_modules)
```

Implementation plan:
1. Add `mcp_api_key` table: `id, client_id, key_hash, scope_modules[], rate_limit_rpm, is_active, created_at`
2. Update auth.py to look up keys and populate McpContext with client scope
3. Filter tool listing by client's authorized modules
4. Audit every call with client_id for billing/usage tracking

### Future: JWT + OAuth

For enterprise clients who need SSO integration:
- Client authenticates via OAuth2
- Receives JWT with embedded scope
- JWT validated on every MCP request
- Scope controls which tool modules are accessible

---

## Client Integration Patterns

### Pattern A: Claude Desktop / Cowork (via Plugin)

```json
// .claude/settings.json or plugin config
{
  "mcpServers": {
    "winston": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-remote", "https://winston-backend.railway.app/mcp"],
      "env": {
        "MCP_API_TOKEN": "<token>"
      }
    }
  }
}
```

Or as a Cowork plugin that auto-configures the MCP connection.

### Pattern B: Claude Code CLI

```toml
# .codex/config.toml (local, stdio)
[mcp_servers.winston]
command = "./scripts/run_mcp_server.sh"

# OR remote HTTP
[mcp_servers.winston]
command = "npx"
args = ["-y", "@anthropic/mcp-remote", "https://winston-backend.railway.app/mcp"]
```

### Pattern C: ChatGPT (Function Calling)

ChatGPT connects via REST:
1. Discover tools: `GET /mcp/tools` → returns tool list with JSON schemas
2. Call tools: `POST /mcp/tools/crm.list_opportunities` → returns result
3. Auth: `Authorization: Bearer <token>` on every request

The REST proxy at `/mcp/tools/{tool_name}` automatically unwraps MCP protocol framing into simple JSON request/response.

### Pattern D: Custom Web App

Any web app can connect:
```javascript
const response = await fetch('https://winston-backend.railway.app/mcp/tools/crm.pipeline_scoreboard', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ business_id: '...' }),
});
const scoreboard = await response.json();
```

---

## Deployment

### Current: Railway (Backend) + Vercel (Frontend)

The HTTP transport is mounted on the existing FastAPI app, so it deploys automatically with the backend. No additional infrastructure needed.

```
Railway (backend) → /mcp/* routes live here
Vercel (repo-b)   → Visual companion frontend
```

### Rate Limiting

- Default: 60 RPM per process (configurable via `MCP_RATE_LIMIT_RPM`)
- Future: per-client rate limits from `mcp_api_key` table
- Rate limit headers returned on 429: `retry_after_seconds`

### Write Protection

- All write tools gated behind `ENABLE_MCP_WRITES=true`
- Two-phase confirmation: `confirm: false` → dry run, `confirm: true` → execute
- Every write audited with actor, timestamp, input, output

---

## Operating Novendor Through MCP

### Current Workflow (What Paul Can Do Today)

From Claude Cowork or Claude Code, Paul can now:

```
"Show me all open opportunities"
→ Claude calls crm.list_opportunities

"Create a lead for Blackstone — they're hiring a VP of AI"
→ Claude calls crm.create_lead with details

"Move the Meridian deal to proposal stage"
→ Claude calls crm.move_opportunity_stage

"What's my pipeline look like?"
→ Claude calls crm.pipeline_scoreboard

"Log that I had a discovery call with Acme Corp"
→ Claude calls crm.create_activity

"Draft a proposal for the AI Diagnostic at $7,500"
→ Claude calls crm.create_proposal

"Send the proposal"
→ Claude calls crm.send_proposal
```

The Winston web frontend shows the visual state: pipeline board, engagement dashboards, proposal status. But the operating commands go through Claude.

### Future: Voice Interface

Same MCP tools, different input:
```
Paul (phone) → Telegram/voice → Claude → MCP tools → Winston backend
```

---

## Roadmap

### Phase 1: Foundation (NOW — this build)
- [x] CRM + Revenue tools (21 tools)
- [x] HTTP transport (streamable HTTP + REST proxy)
- [x] Tool discovery endpoint
- [x] Module-filtered tool listing
- [ ] Verify build compiles and tools register correctly

### Phase 2: Environment Management Tools
- [ ] Environment CRUD (create, list, configure lab environments)
- [ ] Data seeding tools (seed demo data into environments)
- [ ] Health check tools (programmatic health verification)
- [ ] Dashboard generation tools (create dashboards via MCP)

### Phase 3: Per-Client Auth
- [ ] `mcp_api_key` table and management
- [ ] Scope-based tool filtering per client
- [ ] Usage metering and billing hooks
- [ ] Client onboarding flow

### Phase 4: ChatGPT / OpenAI Integration
- [ ] OpenAPI spec generation from MCP tool schemas
- [ ] ChatGPT plugin manifest (`ai-plugin.json`)
- [ ] Tool description optimization for GPT-4 function calling
- [ ] Conversation context bridging

### Phase 5: Client Self-Service
- [ ] Client portal for API key management
- [ ] Usage dashboard
- [ ] Tool module marketplace (clients enable/disable modules)
- [ ] Webhook subscriptions for real-time events

---

## Files Created / Changed

| File | Action | Purpose |
|---|---|---|
| `backend/app/mcp/schemas/crm_tools.py` | Created | Pydantic schemas for 21 CRM tools |
| `backend/app/mcp/tools/crm_tools.py` | Created | CRM tool handlers + registration |
| `backend/app/mcp/http_transport.py` | Created | HTTP transport with MCP protocol + REST proxy |
| `backend/app/mcp/server.py` | Modified | Added CRM tools to registration |
| `backend/app/services/crm.py` | Modified | Added `list_activities`, `move_opportunity_stage`, `body` param |
| `backend/app/main.py` | Modified | Mounted MCP HTTP router |
| `docs/WINSTON_MCP_PLATFORM.md` | Created | This architecture document |
