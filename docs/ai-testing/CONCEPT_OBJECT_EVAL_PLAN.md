# Concept-Object Eval Plan — Winston REPE NOI Variance v1

Source documents:
- `repe_agent_refactor.md` (repo root) — REPE language, concept mapping, scorer taxonomy, scenario templates
- `repe_agent_refactor_plan_help.md` (repo root) — phase/PR sequencing
- Plan file: `~/.claude/plans/you-are-refactoring-winston-sequential-galaxy.md`

## Guiding principle

Runtime evals prove the engine works. Browser simulations prove Winston works for a human. Both gates must pass before release.

## Phase 0 audit findings

### Existing runtime path — confirmed integration points

| Surface | File | Today | Concept extension |
|---|---|---|---|
| Plan dataclass | [backend/app/services/prompt_strategy.py:572](../../backend/app/services/prompt_strategy.py) | `CompositionPlan(profile, lane, skill_id, scope, thread_goal, summary_strategy, diagnostics)` | Add `concept_id`, `concept_match`, `concept_object_summary` |
| Strategize entry | [backend/app/services/prompt_strategy.py:593](../../backend/app/services/prompt_strategy.py) | `strategize()` runs profile classification, scope, intent hint, summary strategy | Insert `match_concept(...)` after `classify_profile()` (L131); profile bias rule when concept matches |
| Profile rules | [backend/app/services/prompt_strategy.py:111](../../backend/app/services/prompt_strategy.py) | `_PROFILE_RULES` keyword map | Concept match takes precedence over keyword rules |
| Compiler priority | [backend/app/services/context_compiler.py:39](../../backend/app/services/context_compiler.py) | `PRIORITY` dict: scope_entity=8, scope_page=10, rag=40 | Insert `concept_object: 9` (cut_strategy `trim` when matched), `concept_object_extended: 11` (cut_strategy `compress`) |
| Compiler item add | [backend/app/services/context_compiler.py:171](../../backend/app/services/context_compiler.py) | Items added by selection phase | Add `if plan.concept_id: add("concept_object", load_concept_summary(plan.concept_id, tier=1, behavior_tier=...))` |
| Redundancy pairs | [backend/app/services/context_compiler.py:350](../../backend/app/services/context_compiler.py) | `_REDUNDANCY_PAIRS` Jaccard check | Add `("thread_goal", "concept_object")`, `("skill_instructions", "concept_object")` |
| Prompt registry | [backend/app/assistant_runtime/prompt_registry.py](../../backend/app/assistant_runtime/prompt_registry.py) | Static skill prompt files, lru-cached | Concepts live in sibling module (`concepts/`); JSON files, lru-cached, validated at startup |
| Prompt receipt | [backend/app/services/prompt_receipts.py:101](../../backend/app/services/prompt_receipts.py) | `ReceiptRow` dataclass; `notes_json` is the diagnostics extension point | Extend `notes_json` with `concept_diagnostics` block |
| Turn receipt | [backend/app/assistant_runtime/turn_receipts.py:245](../../backend/app/assistant_runtime/turn_receipts.py) | `TurnReceipt` Pydantic | Add `ConceptReceipt` and `SourceDisciplineReceipt` Pydantic sub-models |
| Lifecycle | [backend/app/assistant_runtime/request_lifecycle.py:893](../../backend/app/assistant_runtime/request_lifecycle.py) | `run_request_lifecycle()` orchestrates strategize → compile → call → receipt | Concept matching lives inside `strategize()`; receipt assembly at L1535-L1659 picks up new sub-receipts |

### Existing eval harness — confirmed integration points

| Surface | File | Today | Concept extension |
|---|---|---|---|
| Scenario source | [eval_loop/scenario_registry.json](../../eval_loop/scenario_registry.json), [eval_loop/golden_corpus.json](../../eval_loop/golden_corpus.json) | JSON; nested `expected` object | Add `concept_eval: true` and `concept_expected: {...}` sub-object |
| Kind dispatch | [eval_loop/runner.py:461-472](../../eval_loop/runner.py) | Routes `assistant_turn`, `tool_engine`, `frontend_contract`, `operator_readiness` | Add `concept_eval` → `score_concept_scenario()` |
| Scorers | [eval_loop/scorers.py:269-765](../../eval_loop/scorers.py) | Dispatcher pattern; returns `{score, passed, failure_category, mismatches[], ...}` | Add `score_concept_scenario()`; scorers report `applicable: bool`; track `score_coverage` and `source_discipline_coverage` |
| Hard fails | [eval_loop/scorers.py:526](../../eval_loop/scorers.py) | `is_critical_failure()` and `canonical_failures` | Register `wrong_concept_id`, `hallucinated_number`, `mixed_basis`, `stale_primary_source`, `conflict_ignored` |
| Postgres sink | [eval_loop/postgres_sink.py](../../eval_loop/postgres_sink.py) | `winston_eval_runs`, `winston_eval_results`, `winston_eval_baselines` | No schema change v1 — concept fields persist in existing JSON columns |
| Report writer | [eval_loop/docs_report_writer.py:101](../../eval_loop/docs_report_writer.py) | Markdown reports at `docs/ai-testing/reports/` | Add concept eval section after lane distribution |

### Net-new fields (no existing plumbing)

`scope_rule_applied`, `basis_rule_applied`, `freshness_status`, `conflict_summary`, `source_inventory`, `source_as_of_dates` — all live on the new `SourceDisciplineReceipt` Pydantic model and on the prompt receipt's `notes_json.concept_diagnostics` block. Many will be `None` in v1 because the data layer doesn't expose source as-of dates yet. Scorers gate on `applicable: bool` so missing plumbing skips, doesn't fail.

### Serialization decision

Plan called for YAML. PyYAML is not in `backend/requirements.txt` and not currently installed. v1 ships concept files as **JSON** (Python stdlib, no new dep, Pydantic validation works the same). Switch to YAML later if a clear need emerges; the schema is format-agnostic.

## PR sequence

1. **PR 1** — Concept schema, registry, NOI JSON, matcher tests (this PR, in progress)
2. **PR 2** — Wire matching into `prompt_strategy` + `context_compiler` + receipts
3. **PR 3** — `concept_eval` scenario kind, first 10 NOI scenarios, concept-aware scorers
4. **PR 4** — Scenarios 11-20, second-wave scorers, report writer concept section, release gates
5. **PR 5** — Mechanical strip-down: every prompt instruction must reference a concept/receipt/scorer
6. **PR 6** — Browser simulation harness (Playwright specs alongside existing ai-evals suite)

## Release gates

Backend (PR 3-4):
- Concept match ≥ 95%
- Output contract ≥ 95%
- Numeric / arithmetic closure ≥ 98% (within configured tolerance)
- Bridge closure ≥ 95% (within configured tolerance)
- Hard-gate failures = 0
- Receipt completeness = 100%
- `score_coverage` and `source_discipline_coverage` reported (informational v1)

Browser (PR 6):
- All 10 PR 6 scenarios pass on dev site
- No silent thread-context loss on refresh or cross-page navigation
- No agentic write without confirmation
- No invented drivers in rendered answers

## Confidence tier behavior (deterministic)

Enforced by templated instruction blocks in the concept_object payload, not by model judgment.

| Confidence | Behavior tier | Templated instruction |
|---|---|---|
| ≥ 0.7 | proceed | (none) |
| 0.5–0.7 | clarify | "Answer normally, then add one short clarification sentence inviting redirect." |
| 0.4–0.5 | confirm | "Reply with a single one-line confirmation question naming the concept and entity, and stop." |
| < 0.4 | none | (no concept match; default routing) |

## Follow-up inheritance

Referential follow-ups inherit the prior turn's `concept_id` rather than re-running matching. Detected via fixed phrase list ("what about", "compared to", "that", "this", short bare wh-questions, etc.). Without this rule, "What about underwriting?" silently drops the concept on turn 3 — the #1 real-world UX failure for follow-up chat.

## Capability inventory

Concept-object system delivers:
- File-based concept registry (`backend/app/assistant_runtime/concepts/`)
- Deterministic four-tier matcher (exact alias / substring + intent / keyword cluster / contextual trigger)
- Referential inheritance for follow-ups
- Pydantic schema (ConceptObject, RequiredContext, OutputContract, FailureMode, FreshnessPolicy, FileRequirements, CannotComputeRule, DiagnosticsContract, ConceptMatch)
- Tiered concept_object payload (Tier 1 always, Tier 2 gated on lane / missing context / low confidence)
- First concept: `repe.noi_variance` v0.1.0

## Addendum — known limits surfaced by post-PR-2 sanity check

A live end-to-end check (strategize → compile_context → build_receipt_from_compiled, against the seeded `repe.noi_variance` concept) on 2026-05-05 confirmed three of four expected scenarios pass. Two real limits remain. **Both must be resolved before concept eval scoring (PR 3) can be trusted** — the scorers grade against receipt fields that today either silently miss legitimate matches or report stale provisional values.

### Limit 1 — contextual trigger reads the message but not page context

The matcher's contextual_trigger tier requires entity + (metric_hint OR soft-language phrase from a small allowlist) + directional_phrase. The allowlist (`looks light`, `feels off`, `going on`, `what happened`) covers the obvious operator phrasings — `"This looks light, why?"` matches today at confidence 0.4 with `match_reason=contextual_trigger`. Existing tests at `backend/tests/test_concepts.py:147-180` and `backend/tests/test_prompt_strategy.py:472-488` confirm both the matcher and the full strategize pipeline route these prompts correctly.

The gap is everything off the allowlist. `"Why is this fund off?"`, `"Something doesn't add up here"`, or `"This is below where I expected"` all have an active entity + directional language but no metric word and no allowlist hit, so they fall through to no-match. The fix isn't tightening or loosening the gate — it's adding a third metric-inference channel: when `page_title` or `visible_widgets` mention NOI / revenue / expense / variance / occupancy / operating performance, the page context fills the metric slot.

**Resolution:** Plumb `page_title` and `visible_widgets` from scope through `match_concept` and `match_with_inheritance`. When an active entity + directional phrase exists and page context implies an NOI-family metric, fire contextual_trigger at the existing 0.4 confidence floor. Real-world coverage improvement, not a bug fix to existing behavior.

### Limit 2 — `required_context_missing` is provisional and over-reports

The receipt-builder today initializes `required_context_present: []` and `required_context_missing: list(required_field_names)` for every concept-matched receipt. Every receipt reports all 7 NOI variance required fields as missing, even when scope clearly resolves entity, period, and page.

The plan flagged this as deferred ("Defer population logic to PR 2; many will be `None` in v1"), but PR 3's `context_completeness_score` grades pass/fail on whether `required_context_missing` is empty. Without real population, every concept-matched scenario will either fail context_completeness or PR 3's scorer will need to be artificially relaxed — both bad outcomes.

**Resolution:** Populate the present/missing split from `plan.scope` for fields the system can actually know today: entity (from scope.entity_id or scope.entity_label), period (from scope.quarter), scope/page (from scope.page_title). Leave source-discipline fields (sources, basis, currency, comparison_set) as missing — PR 3 scorers should treat those as not-yet-available rather than failing a context gate the data layer cannot satisfy.

### Status

Both limits are blockers for PR 3 release gates and are scheduled to be resolved before PR 3 work begins. Once fixed, the contextual matcher and the receipt's required-context block become trustable signals for `concept_match_score` and `context_completeness_score` respectively.
