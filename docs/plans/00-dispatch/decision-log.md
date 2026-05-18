# Decision Log

Durable architectural and product decisions that should not be relitigated in future sessions. Each entry has a date, a summary, the reasoning, and who or what session produced it.

If you are about to make a decision that contradicts an entry here — stop. Either the decision needs to be overturned explicitly (write a new entry) or the new idea is wrong.

---

## Template

```
### [Decision title] — YYYY-MM-DD
**Context:** Why this decision was needed.
**Decision:** What was decided.
**Reasoning:** Why this option over alternatives.
**Consequences:** What this rules out or requires going forward.
**Supersedes:** [link to earlier entry if this overturns one]
```

---

## Active decisions

### Authoritative state lock for REPE financials — 2026-05-16
**Context:** Multiple code paths were computing fund metrics in different ways, causing inconsistent numbers across surfaces.
**Decision:** All REPE financial reads for released periods must go through `re_authoritative_snapshots.get_authoritative_state` (backend) and `getReV2AuthoritativeState` / `useAuthoritativeState` (frontend). No legacy SQL aggregation or base-scenario read is permitted for released periods.
**Reasoning:** Consistency, auditability, and regulatory defensibility. A fund's IRR cannot be two different numbers on two different pages.
**Consequences:** Any new REPE financial surface must use the authoritative state layer. Violating code fails CI via `verification/lint/no_legacy_repe_reads.py`.

### env_id is the universal tenant isolation key — 2026-05-16
**Context:** The platform is multi-tenant. Every table that holds environment-scoped data must enforce tenant isolation.
**Decision:** Every new table must have `env_id TEXT NOT NULL`, RLS enabled, and a policy using `env_id = current_setting('app.env_id', true)`.
**Reasoning:** Security and compliance. Cross-tenant data leakage is a critical failure.
**Consequences:** No new table may be created without RLS. No financial or operational read may be served without env_id scoping.

### Manual Vercel deploy for repo-b — 2026-05-16
**Context:** Vercel is configured but does NOT auto-deploy on push to main for the repo-b project.
**Decision:** Every push that touches repo-b/ must be followed by `cd repo-b && vercel deploy --prod` explicitly.
**Reasoning:** Discovered in practice. Auto-deploy is disabled.
**Consequences:** No coding session should claim a frontend change is live without confirming the manual deploy ran.

### Waterfall-dependent metrics must fail closed — 2026-05-16
**Context:** Carry, promote, and gp_share require a full waterfall model that may not be available for all periods.
**Decision:** If waterfall model is unavailable, these metrics must return `null` with `null_reason: "out_of_scope_requires_waterfall"`. Approximation is forbidden.
**Reasoning:** A wrong carry number is worse than no carry number for a fund manager.
**Consequences:** Any surface that shows carry/promote/gp_share must handle null gracefully and display the null_reason to the user.

### bm_session is the one session cookie — 2026-05-16
**Context:** Multiple auth paths (Supabase, OIDC) could produce competing session cookies.
**Decision:** All auth paths mint a `bm_session` cookie using the same HMAC-signed JWT shape. No parallel cookies.
**Reasoning:** Middleware, apiFetch, and the environment switcher all read `bm_session`. Adding a second cookie breaks all of these.
**Consequences:** Any new sign-in path must mint `bm_session`. Do not invent a parallel cookie.
