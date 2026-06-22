## Winston system invariants — read before responding

You are reviewing or generating planning artifacts for the **Winston / Consulting_app** repo. The following rules govern everything you produce.

### Routing precedence
1. Explicit skill, agent, harness, or command mention.
2. Explicit file path or owning surface match.
3. Dominant intent in the request.
4. Supporting docs from the selected doc's `handoff_to`.

`CLAUDE.md` at the repo root is the canonical router. Skills under `skills/`, `.skills/`, and agents under `agents/` own their surfaces.

### Plan-first rule
Non-trivial work routes through the planning system **before** any code is written. Active implementation plans live at:

```
docs/plans/03-implementation-plans/active/NNNN-environment-short-title.md
```

Plan naming is strict: zero-padded sequential number, environment identifier, short kebab title. Do not invent alternate locations.

### Acceptance-criteria format
Every plan ticket must define acceptance in this shape:

- **Screen** — what the user sees / interacts with (if applicable).
- **API** — endpoints touched, payload shapes, status codes.
- **DB** — tables/columns added or migrated; RLS policies; tenant-isolation guarantees.
- **AI** — prompts, retrieval, model routing, eval cases (if applicable).
- **Evals** — automated checks that pass/fail the ticket.
- **Regression Guard** — what existing behavior must not break.

Omit a row only when it is genuinely not in scope; don't leave silent gaps.

### Authoritative-state lock (REPE financial reads)
For any released `(entity, quarter)`:
- All reads go through `re_authoritative_snapshots.get_authoritative_state` (backend) and `getReV2AuthoritativeState` / `useAuthoritativeState` (frontend).
- Waterfall-dependent metrics fail closed with `null` + `null_reason: "out_of_scope_requires_waterfall"`.
- Every audited page accepts `?audit_mode=1` and renders `AuditDrawer`.

If a plan touches REPE reads and ignores this, flag it loudly.

### Database guardrails
- Every `CREATE TABLE` → `ENABLE ROW LEVEL SECURITY` + tenant-isolation policy using `env_id = current_setting('app.env_id', true)`.
- Every user-facing table includes `env_id TEXT NOT NULL` and `business_id UUID NOT NULL` unless explicitly exempted.
- New schema files: `NNN_module_description.sql` in `repo-b/db/schema/`, next sequential number.
- Approved table-name prefixes only.
- `COMMENT ON TABLE` for every new table.

### Dirty-tree discipline
Never stage unrelated files. Confirm `git diff --cached --name-only` before every commit. Split shared files. New commits, not amends.

### tips.md append rule
Reusable repo-wide lessons, commands, gotchas, and preferences go into `docs/tips.md` at session end — not into session notes, not into the plan file.

### Style
Follow `docs/anti-ai-style.md`. Write the way a clear-thinking person would write if they respected the reader's time. No filler transitions, no apologetic hedging, no celebratory language.
