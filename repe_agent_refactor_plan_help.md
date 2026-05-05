# Winston REPE Concept System — Handoff Plan (Pre-Deep Research)

## Objective

Refactor Winston from a generic assistant into a **concept-object-driven operator system** with **evaluation gates**, starting with REPE reporting (NOI variance).

This is **incremental, test-driven, and fail-closed**.

---

## Repo Context

Key files and systems:

* Prompt strategy:
  `backend/app/services/prompt_strategy.py`

* Context compiler:
  `backend/app/services/context_compiler.py`

* Skill registry:
  `backend/app/assistant_runtime/prompt_registry.py`

* Eval harness:

  ```
  eval_loop/
    runner.py
    scenario_loader.py
    scorers.py
    postgres_sink.py
    environment_matrix.py
    docs_report_writer.py
    contamination_checks.py
  ```

* CLI runner:
  `scripts/winston-eval-loop.mjs`

⚠️ Do NOT create a new eval system. Extend existing.

---

## Phase 0 — Audit First

Before writing code:

1. Review:

   * prompt_strategy
   * context_compiler
   * prompt + turn receipts
   * eval_loop system

2. Document gaps:

   ```
   docs/ai-testing/CONCEPT_OBJECT_EVAL_PLAN.md
   ```

3. Keep all changes:

   * small
   * reversible
   * testable

---

## Phase 1 — Concept Object System

Create:

```
backend/app/assistant_runtime/concepts/
backend/app/assistant_runtime/concepts/schema.py
backend/app/assistant_runtime/concepts/registry.py
backend/app/assistant_runtime/concepts/repe/noi_variance.yaml
```

### Concept Object Schema

Each concept must include:

* concept_id
* version
* canonical_question
* aliases
* environment
* entity_types
* required_context
* preferred_sources
* driver_taxonomy
* reasoning_steps
* output_contract
* failure_modes
* freshness_policy
* diagnostics_contract

---

## Phase 2 — Deterministic Concept Matching

Implement:

```
match_concept(message, environment, entity_type)
```

Rules:

* deterministic only (no LLM)
* priority:

  1. exact alias
  2. substring alias
  3. keyword cluster
* avoid false positives

### Acceptance

✔ Matches:

* “Why is NOI off plan?”
* “Explain net property income variance”

✘ Does NOT match:

* “What is NOI?”

---

## Phase 3 — Prompt Strategy Integration

Update `prompt_strategy.py`:

Add to `CompositionPlan`:

* concept_id
* concept_match
* concept_object_summary

Behavior:

* If concept matches:
  → force analysis / entity_question profile

Diagnostics:

* concept_id
* matched_alias
* confidence
* match_reason

---

## Phase 4 — Context Compiler Integration

Update `context_compiler.py`:

Add new block:

```
concept_object
```

Priority:

```
user > entity > concept_object > rag/history
```

Include compact concept payload:

* canonical question
* required context
* driver taxonomy
* reasoning steps
* output contract
* failure modes

---

## Phase 5 — Receipts & Diagnostics

Extend receipts:

### Add:

* concept_id
* concept_version
* matched_alias
* concept_confidence
* concept_object_included
* required_context_present
* required_context_missing
* output_contract_expected
* failure_modes_available

### Add source discipline (if available):

* source_inventory
* source_as_of_dates
* freshness_status
* conflict_summary
* basis_rule_applied
* scope_rule_applied

---

## Phase 6 — Eval Scenarios

Extend existing eval scenarios (DO NOT rebuild system).

### Add fields:

* concept_eval: true
* expected.concept_id
* concept_expected.required_sections
* concept_expected.must_not_invent_numbers
* concept_expected.required_basis
* concept_expected.required_scope

---

## NOI Variance Scenario Set (Minimum)

1. Why is NOI off plan?
2. Net property income variance
3. Miss vs underwriting
4. Variance vs budget
5. Variance vs forecast
6. Same-store NOI decline
7. Bridge Q1 → Q2
8. Occupancy vs rate driver
9. Concessions drag
10. Bad debt impact
11. Expense overrun
12. Timing vs recurring
13. Missing underwriting → fail
14. Missing entity → ask
15. Conflicting sources → surface
16. Stale data → caveat
17. Mixed basis → reject
18. Missing driver detail → bounded answer
19. Portfolio roll-up
20. Board-level summary

---

## Phase 7 — Concept Scorers

Extend `eval_loop/scorers.py`.

### Add:

* concept_match_score
* alias_normalization_score
* context_completeness_score
* output_contract_score
* missing_data_failure_mode_score
* source_discipline_score
* freshness_score
* conflict_handling_score
* basis_fidelity_score
* scope_fidelity_score
* arithmetic_closure_score
* driver_attribution_score
* generic_filler_penalty
* unsupported_claim_penalty

---

## Hard Fail Conditions

Immediate failure if:

* hallucinated numbers
* mixed accounting basis (cash vs GAAP)
* stale data used silently
* conflicting sources ignored
* wrong concept_id

---

## Phase 8 — Reporting + Release Gates

Update report output:

Include:

* pass rate by concept
* pass rate by scorer
* failing scenarios
* unsupported claims
* stale source failures
* bridge closure failures

### Release Gates

* concept match ≥ 95%
* output contract ≥ 95%
* arithmetic closure ≥ 98%
* bridge closure ≥ 95%
* hard failures = 0
* receipts completeness = 100%

---

## Phase 9 — Strip Down Rule

Remove anything that cannot be:

* evaluated
* traced
* tested

### Rules:

* concept > skill
* structured data > RAG
* no silent assumptions

If Winston does not know:
→ it must say so

---

## Phase 10 — PR Sequence

### PR 1

* concept schema + registry
* NOI concept YAML
* unit tests

### PR 2

* prompt strategy integration
* context compiler integration
* receipts

### PR 3

* eval scenarios (first 10)
* scorers

### PR 4

* full scenario set
* reporting
* release gates

### PR 5

* strip down generic logic

---

## Commands

```
pytest backend/tests/test_prompt_strategy.py
pytest backend/tests/test_context_compiler.py
pytest backend/tests/test_concepts.py

python -m eval_loop.runner --smoke --environment meridian
python -m eval_loop.runner --full --environment meridian --concept-id repe.noi_variance
```

---

## Final Acceptance Criteria

Winston must:

1. Match NOI variance concept
2. Resolve entity / period / basis / scope
3. Include concept_object in prompt
4. Follow output contract
5. Surface missing/conflicting/stale data
6. Avoid invented attribution
7. Emit receipts
8. Pass eval gates before release

---

## Guiding Principle

This is not a chatbot.

This is a **deterministic operator system**.

If it cannot:

* identify the concept
* identify the data
* validate the inputs

→ it must fail clearly, not improvise
