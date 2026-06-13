# Security and trust boundaries — PR 1

PR 1 is a read-only surface. The guarantees:

- **No writes.** No ADE endpoint mutates ADO, GitHub, Vercel, Railway, Supabase, or any
  external system. Write tools stay behind the existing MCP confirmation and audit rules
  (`backend/app/mcp/registry.py`, `backend/app/mcp/audit.py`); ADE only reads their
  contracts and receipts.
- **Status is declared, not probed.** Connector statuses come from a static declaration
  (`backend/app/services/ade_connectors.py`). No external calls, no credential
  validation, no provider CLIs, no inferring liveness from env-var presence.
- **No secrets displayed.** ADE never reads raw secret values. Receipt redaction is
  applied at write time by each tool's `AuditPolicy`; ADE shows what audit stored.
- **Fail closed.** Anything ADE cannot evidence returns empty data plus a `null_reason`
  (`mcp_registry_unavailable`, `audit_read_unavailable`). The frontend renders the
  reason; it never fabricates a healthy state.
- **Auth.** ADE routes follow the telemetry read posture exactly: the auth middleware
  populates request state but does not reject reads, and the routes require scoped query
  params rather than a session guard. That means registry metadata and redacted receipt
  summaries are readable to anyone who can reach the API origin — the same exposure the
  telemetry surface accepts. Tightening reads behind an authenticated dependency is a
  PR 2 item (tracked in `roadmap.md`).
- **Scoping.** Endpoints accept `env_id` and `business_id`. Audit events carry no
  `env_id` column, so receipt reads are scoped by `business_id` only; `env_id` is
  accepted for route-shape portability and is not an enforcement boundary. If the audit
  read fails for any reason the endpoint returns `null_reason: "audit_read_unavailable"`
  rather than unscoped or partial rows.
- **Model access.** All model traffic goes through Winston's managed OpenAI account
  (ADR 0001). BYO keys, provider abstraction, and the data-classification/redaction gate
  are roadmap, not code.
