# Risk Controls

Blocked or gated actions:

- File deletions require soft-delete ledger entry.
- SQL schema drops require touched migration file (`repo-b/db/schema/NNN_*.sql`).
- Large multi-file replacements require preview-plan marker.
- `.env*` edits require `CONFIRM HIGH RISK`.
- Changes under `orchestration/` or `.orchestration/` require `CONFIRM HIGH RISK`.
