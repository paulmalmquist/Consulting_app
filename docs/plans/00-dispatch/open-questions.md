# Open Questions

Unresolved questions that span multiple environments or require external input to answer. Review this list at the start of any architectural session.

Mark questions resolved with a date and answer when they are confirmed.

---

## Format

```
### [Question] — opened YYYY-MM-DD
**Context:** Why this question matters.
**Blocking:** What work is blocked until this is answered.
**Status:** Open / In progress / Resolved
**Resolution:** (fill in when resolved)
```

---

## Open

### What Supabase tables exist for CRM, accounting, and environment records? — 2026-05-16
**Context:** Multiple environment plan files have "Needs repo verification" for table names. Until these are confirmed, RLS checks and data map sections cannot be completed.
**Blocking:** `novendor-crm-accounting/architecture.md`, `control-tower/architecture.md`, and 6 other environment architecture files.
**Status:** Open
**Resolution:** —

### Is Senior Housing a dedicated environment template or a REPE variant? — 2026-05-16
**Context:** `senior-housing/architecture.md` is almost entirely unverified. It may reuse REPE infrastructure with a property_type filter, or it may have dedicated tables and routes.
**Blocking:** `senior-housing/architecture.md` and `senior-housing/eval-plan.md`
**Status:** Open
**Resolution:** —

### Is the Supply Chain Genie integration real or a UI mockup? — 2026-05-16
**Context:** The Genie NL query surface exists in the frontend but no backend integration was confirmed.
**Blocking:** `supply-chain-databricks/architecture.md` and `supply-chain-databricks/eval-plan.md`
**Status:** Open
**Resolution:** —

### Is pds.py or pds_v2.py the active API for Stone PDS? — 2026-05-16
**Context:** Both route files exist. If pds.py is deprecated, dead routes should be removed.
**Blocking:** `stone-pds/architecture.md` backend map
**Status:** Open
**Resolution:** —

### What data sources populate the Winston Legal knowledge base? — 2026-05-16
**Context:** Legal knowledge base queries depend on RAG. The source documents, chunking strategy, and embedding model are unknown.
**Blocking:** `winston-legal/eval-plan.md` (retrieval quality evals)
**Status:** Open
**Resolution:** —

### What vector store does Demo Lab use for RAG embeddings? — 2026-05-16
**Context:** Likely Supabase pgvector, but not confirmed. This affects the embedding index query pattern and the migration needed.
**Blocking:** `demo-lab/architecture.md` and `demo-lab/eval-plan.md`
**Status:** Open
**Resolution:** —

### What triggers the early-period IRR outliers in Meridian (IGF VII 456%, MCOF I 366%)? — 2026-05-16
**Context:** Implausible IRR values are in released snapshots. Suspected: XIRR on sparse early cash flows. Not confirmed.
**Blocking:** `meridian-repe/backlog.md` bug item
**Status:** Open — needs investigation in `backend/app/finance/irr_engine.py`
**Resolution:** —

## Resolved

_(none yet)_
