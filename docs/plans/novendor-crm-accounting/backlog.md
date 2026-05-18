# Novendor CRM / Accounting — Backlog

**Last updated:** 2026-05-16

## Bugs
- [ ] **Verify ECC brief renders real data** — `/lab/env/[envId]/ecc/brief` — Confirm whether this page shows real accounting data or a placeholder. Mark actual vs. placeholder.
- [ ] **Receipt ingestion status** — `backend/app/routes/nv_receipt_intake.py` — Verify receipts submitted via the intake endpoint appear in the accounting queue.

## UX improvements
- [ ] **ECC approval queue clarity** — `/lab/env/[envId]/ecc/approvals` — Confirm queue items have clear approve/reject actions and show relevant metadata (amount, vendor, date).
- [ ] **VIP contact list** — `/lab/env/[envId]/ecc/vips` — Verify this shows meaningful contact data, not an empty state.

## Backend / API
- [ ] **Apollo sync endpoint** — Verify whether a sync endpoint exists that pulls Apollo contacts into the Novendor CRM, or if this is manual/MCP-only.
- [ ] **Accounting snapshot writer** — `backend/app/services/accounting_snapshot_writer.py` — Determine what triggers snapshot writes and verify they work.

## Data / migrations
- [ ] **CRM table schema** — Needs repo verification. Identify tables in Supabase for contacts, deals, and accounts. Confirm env_id and RLS.
- [ ] **Accounting entries table** — Confirm the table name and schema for accounting entries/receipts.

## Tests
- [ ] **No known tests for accounting queue** — `backend/app/services/nv_accounting_queue.py` — Needs unit tests.
- [ ] **No known tests for receipt intake** — `backend/app/routes/nv_receipt_intake.py` — Needs integration tests.

## Documentation
- [ ] **Link design handoff** — `design_handoff_accounting_command_desk/` exists — reference it from architecture.md when content is verified.

## Nice-to-have
- [ ] Email-based receipt ingestion (forward to an address)
- [ ] Slack/Telegram notifications for approval queue items

## Completed
_(none yet)_
