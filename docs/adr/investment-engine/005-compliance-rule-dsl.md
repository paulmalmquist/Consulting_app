# ADR 005 — Compliance Rule DSL

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** Paul (owner), Investment Engine architecture
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 003 (bi-temporal), `docs/plans/investment-engine/wave-1-plan.md`

## Context

The compliance engine evaluates rules against trades (pre-trade) and positions (post-trade) and produces violations. Rules cover concentration limits, exposure caps, restricted lists, mandate constraints, and similar checks. Two ways to represent the rule set:

1. **Code-defined rules.** Each rule is a Python function. Adding a rule requires a deploy. Auditing the rule set means reading code. Easy to start; brittle at scale; non-engineers can't review or author rules.
2. **Data-defined rules (DSL).** Each rule is a row in a table; a fixed evaluator interprets the row. Adding a rule is a row insert. The rule set is queryable, exportable, and reviewable by compliance/legal without engineering.

Institutional compliance is a domain where regulators and auditors will ask "show me every rule active on 2026-03-31 for fund X" and expect an answer in seconds. That answer is much harder to produce when rules live in code than when they live in data.

The risk of a DSL is unbounded expressiveness — if every operator is added on demand, the DSL becomes a programming language and the evaluator becomes an interpreter. The standard mitigation is to fix the operator set up front and require an ADR to extend it.

## Decision

**Compliance rules are stored as rows in `inv_compliance_rule` with a fixed JSONB DSL evaluated by a single Python function. No code-defined rules. Adding a new operator requires an ADR amendment.**

1. **Fixed operator set for V1.1** — six operators only:

   | Operator | Semantics | Example |
   |---|---|---|
   | `max_pct_of_nav` | (target value) / (fund NAV) ≤ threshold | issuer concentration cap |
   | `max_issuer_exposure` | sum of position MV per issuer ≤ threshold (absolute) | absolute issuer cap |
   | `max_sector_exposure_pct` | sum per sector / NAV ≤ threshold | sector concentration |
   | `restricted_list` | none of (account, security) pairs in the named list | restricted securities |
   | `mandate_min_pct` | sum matching the predicate / NAV ≥ threshold | "≥80% in investment grade" |
   | `mandate_max_pct` | sum matching the predicate / NAV ≤ threshold | "≤20% in non-USD" |

   Each operator has a fixed input schema validated at rule insert time.

2. **Rule row shape:**
   ```json
   {
     "operator": "max_pct_of_nav",
     "scope": { "fund_id": "...", "scope_kind": "fund" | "portfolio" | "account" },
     "predicate": { "issuer": "ACME Corp" },
     "threshold": "0.05",
     "severity": "high",
     "reason": "Investor mandate clause 4.2",
     "active_from": "2026-01-01",
     "active_to": null
   }
   ```
   `predicate` shape varies per operator; the evaluator documents the expected keys per operator and rejects rules with unknown keys.

3. **One evaluator function per operator.** Implemented in `backend/app/services/compliance_engine.py` as private functions named `_eval_max_pct_of_nav(rule, ctx)` etc. The dispatcher maps `operator` strings to these functions. Adding a new operator means: ADR + new private function + extend the dispatcher + extend the CHECK constraint on `inv_compliance_rule.operator` + tests. Cannot be done by a rule-author alone.

4. **Rules are bi-temporal.** `active_from` (required) and `active_to` (nullable). A rule "active on" a date means `active_from <= date AND (active_to IS NULL OR active_to > date)`. Updating a rule's threshold is NOT an in-place edit — it's an `active_to`-stamp on the old row plus an insert of the new row. The evaluator joins by date, never by row identity.

5. **Pre-trade and post-trade share the evaluator.** Pre-trade evaluates against a hypothetical post-trade position set (current + the proposed trade applied). Post-trade evaluates against the actual position set as of an effective_date. Same operators; different `ctx` payload.

6. **Violations are append-only.** Storing a violation is one row in `inv_compliance_violation`, immutable on load-bearing fields (rule_id, evaluated_at, snapshot_value, threshold, severity, scope). Resolution metadata (`resolved_at`, `resolved_by`, `resolution_note`) is mutable, same pattern as `inv_reconciliation_break`. Pre-trade violations include `proposed_trade_id` for traceability.

7. **Rule rejection on insert.** Rules with unknown operators are rejected by the schema CHECK. Rules with predicate keys that don't match the operator's expected schema are rejected by the service before insert (returns `EngineResult(valid=False, code=invalid_rule_predicate)`). Bad rules cannot enter the system.

## Consequences

### Positive

- The rule set is queryable. "Show me every rule active for fund X on date Y" is a SQL query, not a code review.
- Compliance/legal can review rules without reading Python.
- New rules ship without a deploy. New *operators* still require an ADR + deploy, which is the right gate.
- Bi-temporality matches the rest of the system; rule changes are audit-clean.
- The fixed operator set keeps the DSL bounded; no risk of it becoming an interpreter.

### Negative

- Six operators won't cover everything. Some real-world mandates (e.g., "duration ≤ benchmark + 0.5y") need more than six. ADR amendment + new operator function is the path.
- Rule-author UX is worse than "write a Python function" — they must learn the JSONB shape and fixed predicate keys. Mitigated by a UI form per operator.
- The evaluator dispatcher grows linearly with operator count. Acceptable; the count is bounded by ADR.

### Neutral

- Schema impact: two new tables (`inv_compliance_rule`, `inv_compliance_violation`) plus a `compliance_violation` CHECK constraint enumerating allowed severities. Snapshot semantics not required (rules and violations are not authoritative outputs the way NAV is — they're operational state).

## Alternatives Considered

**Code-defined rules.** Rejected. See §1 of Context.

**Open DSL with arbitrary operators.** Rejected. The mitigation against an interpreter-grade DSL is keeping the operator set fixed by ADR.

**External rule engine (Drools, Camunda DMN, Open Policy Agent).** Rejected for V1.1. Adds a JVM/external process, and the operator surface we need is small enough that owning it in Python is the right call. Revisit if the rule count exceeds ~200 or the operators become recursive (neither is on the horizon).

**Rules stored as Python expressions evaluated via `eval`.** Rejected unconditionally. Code injection risk is non-negotiable.

**Rule-level severity (rule defines own severity) vs evaluator-derived severity.** Chose rule-level. The same operator can be "low" for some funds and "critical" for others depending on mandate language; encoding severity on the rule is correct.

## Implementation Notes

Schema (migration 484, defined in the Wave 1 plan):

```sql
CREATE TABLE inv_compliance_rule (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id          text NOT NULL,
    business_id     uuid NOT NULL,
    fund_id         uuid REFERENCES inv_fund(id),    -- nullable: env-wide rules
    scope_kind      text NOT NULL CHECK (scope_kind IN ('env','fund','portfolio','account')),
    operator        text NOT NULL CHECK (operator IN (
        'max_pct_of_nav','max_issuer_exposure','max_sector_exposure_pct',
        'restricted_list','mandate_min_pct','mandate_max_pct')),
    predicate       jsonb NOT NULL DEFAULT '{}'::jsonb,
    threshold       numeric(20,10),                    -- nullable for non-numeric ops
    threshold_list  text[],                             -- for restricted_list
    severity        text NOT NULL DEFAULT 'high' CHECK (severity IN ('low','medium','high','critical')),
    reason          text,
    active_from     date NOT NULL,
    active_to       date,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (active_to IS NULL OR active_to > active_from)
);

CREATE TABLE inv_compliance_violation (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    env_id              text NOT NULL,
    business_id         uuid NOT NULL,
    rule_id             uuid NOT NULL REFERENCES inv_compliance_rule(id),
    fund_id             uuid REFERENCES inv_fund(id),
    portfolio_id        uuid REFERENCES inv_portfolio(id),
    account_id          uuid REFERENCES inv_account(id),
    proposed_trade_id   uuid,                           -- pre-trade only; nullable
    eval_kind           text NOT NULL CHECK (eval_kind IN ('pre_trade','post_trade')),
    severity            text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    snapshot_value      numeric(28,8),
    threshold           numeric(20,10),
    evidence            jsonb NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at        timestamptz NOT NULL DEFAULT now(),
    -- resolution metadata (mutable)
    resolved_at         timestamptz,
    resolved_by         text,
    resolution_note     text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
```

Plus the `inv_block_compliance_violation_field_edit` trigger (mirrors `inv_block_break_field_edit` from Wave 0): blocks edits to all fields except resolution metadata.

Service signatures (`backend/app/services/compliance_engine.py`):

```python
def evaluate_pre_trade(
    *, env_id: str, fund_id: UUID, proposed_trade: dict, as_of_date: date,
) -> EngineResult: ...

def evaluate_post_trade(
    *, env_id: str, fund_id: UUID, as_of_date: date,
) -> EngineResult: ...
```

Both return `EngineResult` with `value = {"violations": [...], "summary": {...}}` and the violations list (when persisted by the orchestrator) lands in `inv_compliance_violation`.

## Verification

- Unit test: each of the six operators produces a violation when threshold is breached and clean when within threshold.
- Unit test: rule with unknown operator → `valid=False, code=invalid_rule_operator` on insert.
- Unit test: rule with predicate keys not matching operator schema → rejected.
- Unit test: bi-temporal rule lookup — a rule with `active_to=2026-03-31` is NOT included in evaluations for `as_of_date=2026-04-01`.
- Unit test: pre-trade with a hypothetical sell shows a violation that wouldn't exist post-trade (proves the engine applies the proposed trade before evaluating).
- Unit test: violation row is append-only on load-bearing fields; resolution metadata is mutable.
- Determinism: 50-run loop on the same inputs produces identical violation set.
