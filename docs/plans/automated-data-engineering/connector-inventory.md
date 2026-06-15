# Connector inventory

Honest status per provider. Vocabulary is exactly `live | stub | script | missing` —
never softened to "available" or "connected". Status is declared here and mirrored in
code; nothing probes liveness.

| Provider | Status | Mode | Evidence path | Reason |
|---|---|---|---|---|
| OpenAI (model provider) | live | managed_model | `backend/app/services/ai_gateway.py` | Winston-managed key. BYO-key and enterprise endpoints are roadmap (ADR 0001). |
| Git (local repo) | live | mcp_tools | `backend/app/mcp/tools/git_tools.py` | git.diff and git.commit, local only, no push. |
| Supabase/Postgres | live | service_layer | `backend/app/db.py` | App database through the service layer. Not a direct skill. |
| Confluent Cloud / Kafka | live | streaming | `backend/app/events/transport.py` | Stargate streaming lane. Not yet exposed as a governed MCP skill. |
| Microsoft Graph (Outlook) | live | background_service | `backend/app/services/msgraph_email_sync.py` | Email sync service. Not yet an MCP tool. |
| Azure DevOps | script | import_file | `TELEMETRY_TEMPLATE/ado/gen_ado_backlog.py` | Backlog generator exists. PR 1 does not mutate live ADO. |
| Databricks | stub | sql_connector | `backend/app/data/databricks_source.py` | Stub raises NotImplementedError, awaits client deployment config. |
| GitHub (PRs/issues) | missing | planned | (none) | No gh integration in app code. Roadmap. |
| Vercel | missing | planned | (none) | Operator CLI only. No in-app connector. |
| Railway | missing | planned | (none) | Operator CLI only. No in-app connector. |
| BigQuery / Google Cloud | missing | planned | (none) | Planned in RS_ANALYTICS_PLATFORM_PLAN.md. Not implemented. |

## Maintenance

When the inventory changes, update **both** this file and
`backend/app/services/ade_connectors.py`. The backend never parses markdown; the two are
kept in sync by hand and checked in review. PR 2 may replace this with a generated JSON
source if drift becomes painful.
