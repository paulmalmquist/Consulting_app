# Winston Legal — Architecture

**Last updated:** 2026-05-16  
**Status:** Draft — needs repo verification

## Frontend map

### Routes
| Route | File | Purpose |
|---|---|---|
| `/lab/env/[envId]/legal` | `repo-b/src/app/lab/env/[envId]/legal/` | Legal root |
| `.../legal/ai-briefing` | `.../legal/ai-briefing/` | AI legal briefing |
| `.../legal/compliance` | `.../legal/compliance/` | Compliance dashboard |
| `.../legal/contracts` | `.../legal/contracts/` | Contract management |
| `.../legal/documents` | `.../legal/documents/` | Document library |
| `.../legal/governance` | `.../legal/governance/` | Governance view |
| `.../legal/knowledge-base` | `.../legal/knowledge-base/` | Knowledge base |
| `.../legal/litigation` | `.../legal/litigation/` | Litigation tracking |
| `.../legal/matters` | `.../legal/matters/` | Matter management |
| `.../legal/outside-counsel` | `.../legal/outside-counsel/` | Outside counsel mgmt |
| `.../legal/reports` | `.../legal/reports/` | Reports |
| `.../legal/spend` | `.../legal/spend/` | Legal spend analysis |
| `/app/legal` | `repo-b/src/app/app/legal/` | Legal app surface |

## Backend map

### Routes
| File | Purpose |
|---|---|
| `backend/app/routes/legal_ops.py` | Core legal ops endpoints |
| `backend/app/routes/winston_contract_admin.py` | Contract administration |
| `backend/app/routes/winston_demo.py` | Demo/evaluation endpoints |
| `backend/app/routes/winston_eval_admin.py` | Eval administration |

### Services
- `backend/app/services/environment_seed_packs_v2/legal_ops_starter.py` — seed pack for legal environments
- Needs repo verification for winston_*.py service files

### Schemas
| File | Purpose |
|---|---|
| `backend/app/schemas/legal_ops.py` | Legal ops schemas |
| `backend/app/schemas/doc_completion.py` | Document completion schemas |

## Data map

- Needs repo verification — identify Supabase tables for matters, contracts, documents
- Likely tables: `legal_matters`, `legal_contracts`, `legal_documents`, `outside_counsel_invoices`
- RLS expected via `env_id`
- Seed pack: `backend/app/services/environment_seed_packs_v2/legal_ops_starter.py`

## AI / MCP / Runtime map

- Winston AI for legal: `backend/app/routes/winston_contract_admin.py`
- Document intelligence: `backend/app/schemas/doc_completion.py`
- Knowledge base: `.../legal/knowledge-base/` — likely RAG-backed
- Needs repo verification for prompt files used by Winston Legal

## Test map

- Needs repo verification — check `backend/tests/` for legal_ops or winston test files

## Needs verification

- [ ] Supabase table names for legal matters, contracts, documents
- [ ] Whether legal seed pack creates usable demo data
- [ ] How the knowledge base is populated (RAG source, chunking strategy)
- [ ] Whether `winston_contract_admin.py` handles AI contract analysis or just CRUD
- [ ] Prompt files used by Winston Legal AI
