# Winston Legal — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Seed pack verification** — `backend/app/services/environment_seed_packs_v2/legal_ops_starter.py` — Confirm this seed pack creates usable demo data (matters, contracts, documents). Report what it actually creates.
- [ ] **Contract list renders data** — `/lab/env/[envId]/legal/contracts` — Verify this shows a real contract list, not an empty state.

## UX improvements
- [ ] **Matter status clarity** — `/lab/env/[envId]/legal/matters` — Confirm matters show status, responsible attorney, and open/close dates.
- [ ] **Outside counsel spend** — `/lab/env/[envId]/legal/outside-counsel` — Verify spend data is visible per firm.

## Backend / API
- [ ] **Contract admin AI capabilities** — `backend/app/routes/winston_contract_admin.py` — Determine whether this route handles AI contract analysis (clause extraction, risk flagging) or just CRUD. Document capabilities.
- [ ] **Knowledge base RAG source** — Determine what documents populate the legal knowledge base and how queries are answered.

## Data / migrations
- [ ] **Legal table schema** — Needs repo verification. Identify Supabase tables for matters, contracts, documents.

## Tests
- [ ] **No known tests for legal ops routes** — `backend/app/routes/legal_ops.py` needs unit and integration tests.
- [ ] **Seed pack test** — Verify the seed pack applies without errors on a fresh environment.

## Documentation
- [ ] **Prompt files for Winston Legal** — Find and document which prompts drive Winston Legal AI responses.

## Nice-to-have
- [ ] Contract redline / version comparison
- [ ] Matter deadline calendar integration

## Completed
_(none yet)_
