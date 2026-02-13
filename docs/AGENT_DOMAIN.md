# Agent Domain Reference

This document defines the authoritative glossary and disambiguation rules
for any AI agent (Codex CLI, MCP, or automated scripts) operating within
the Business Machine monorepo.

## Domain Glossary

| Term | Definition | Source of Truth |
|------|-----------|-----------------|
| **Environment** | A Demo Lab client workspace — a row in the `environments` table exposed via repo-c `/v1/environments`. Contains `env_id`, `client_name`, `industry`, `schema_name`, `is_active`. | `repo-c/app/main.py` |
| **Business** | A Business OS workspace record created during onboarding. Contains `business_id`, `name`, `slug`, `region`. | `backend/app/routes/business.py` |
| **Department** | An organisational unit (e.g., Accounting, HR, Legal) from the department catalog. Part of the Business OS capability registry. | `backend/app/routes/business.py` → `GET /api/departments` |
| **Capability** | A functional page/feature within a department (e.g., "Invoice Processing"). Defined per department, toggled per business. | `backend/app/routes/business.py` → `GET /api/departments/{key}/capabilities` |
| **Document** | A file stored in Supabase Storage, indexed for RAG retrieval. Uploaded per-environment. | `repo-c POST /v1/environments/{env_id}/upload` |
| **Execution** | A backend task execution record (stub/planned). | `backend/app/routes/` (in progress) |
| **Pipeline** | A Kanban-style workflow board per environment. Contains stages, items, and cards. | `repo-c /v1/pipeline`, `/v1/environments/{env_id}/pipeline` |
| **Template** | A provisioning blueprint that pre-selects departments and capabilities for a new business. | `backend GET /api/templates` |

## Disambiguation Rules

These rules are **critical** for avoiding "Python environment" confusion:

| User says | Interpret as | Action |
|-----------|-------------|--------|
| "list environments" / "name all environments" / "show environments" | Demo Lab environments | `bmctl lab env list` → `GET /v1/environments` |
| "create environment X" | Create Demo Lab environment named X | `bmctl lab env create --name "X"` → `POST /v1/environments` |
| "python env" / "venv" / "conda" / "pip" / "requirements" | Developer Python environment | Use standard Python tooling directly |
| "workspace" / "company" / "onboarding business" | Business OS business record | `bmctl bos business create` → `POST /api/businesses` |
| "department" / "add department" | Business OS department | Check `/api/departments` catalog |
| "upload document" / "index file" | Demo Lab document upload | `POST /v1/environments/{envId}/upload` |
| "/lab/*" routes | Demo Lab UI | Frontend at `FRONTEND_BASE_URL/lab/...` |
| "/app/*" or "/onboarding" | Business OS UI | Frontend at `FRONTEND_BASE_URL/...` |

## Canonical Endpoints

### Demo Lab Backend (repo-c) — Default port 8001

```
GET    /health
GET    /v1/environments
POST   /v1/environments                  {client_name, industry?, industry_type?, notes?}
PATCH  /v1/environments/{env_id}         {client_name?, industry?, is_active?, notes?}
DELETE /v1/environments/{env_id}
POST   /v1/environments/{env_id}/reset
GET    /v1/environments/{env_id}/documents
POST   /v1/environments/{env_id}/upload
GET    /v1/pipeline
GET    /v1/environments/{env_id}/pipeline
POST   /v1/chat                          {question, env_id}
GET    /v1/audit?env_id={env_id}
GET    /v1/metrics?env_id={env_id}
GET    /v1/queue
POST   /v1/queue/{queue_id}/decision
```

### Business OS Backend (backend) — Default port 8000

```
GET    /health
GET    /api/templates
POST   /api/businesses                   {name, slug, region?}
POST   /api/businesses/{id}/apply-template  {template_key, enabled_departments?, enabled_capabilities?}
POST   /api/businesses/{id}/apply-custom    {enabled_departments, enabled_capabilities}
GET    /api/businesses/{id}/departments
GET    /api/businesses/{id}/departments/{dept_key}/capabilities
GET    /api/departments
GET    /api/departments/{dept_key}/capabilities
```

### Frontend (repo-b) — Default port 3001

The Next.js app proxies API calls:
- `/v1/*` → Demo Lab backend (via catch-all route handler)
- `/api/*` → Business OS backend (or handled by Next.js route handlers)
- `/api/v1/environments` → Proxy with fallback to local DB

## Control CLI

Use `scripts/bmctl` to execute domain commands deterministically:

```bash
# Lab operations
./scripts/bmctl lab env list
./scripts/bmctl lab env create --name "Acme Corp" --industry "Finance"
./scripts/bmctl lab env open --id <envId>

# Business OS operations
./scripts/bmctl bos business create --name "Acme" --slug "acme"
./scripts/bmctl bos dept list
./scripts/bmctl bos template list

# System
./scripts/bmctl health
```

## Agent Behaviour Contract

1. **Default assumption**: user is asking about the PRODUCT domain, not developer tooling.
2. **Before acting**: identify the source-of-truth endpoint → run a query → confirm output.
3. **Plan first**: show a short plan (max 8 bullets) before modifying code.
4. **Verify after**: run a smoke test (health check, list call) after changes.
5. **Never hand-wave**: if you don't know an endpoint shape, find it in code via search.
