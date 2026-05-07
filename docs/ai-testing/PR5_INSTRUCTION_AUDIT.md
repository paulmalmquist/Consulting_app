# PR 5 — Instruction Audit (Winston runtime, model-facing instructions)

> **Revision note (2026-05-06):** This file was rewritten after the original was discovered to reference Meridian guardrail lines that no longer exist in `prompt_registry.py`. The actual guardrail has 2 instructions, not 6. All row numbers and references below reflect the current codebase.


This audit applies the mechanical rule from the refactor plan:

> An instruction is **kept** if and only if it is referenced by at least one of:
> - a concept-object field (`canonical_question`, `required_context`, `driver_taxonomy`, `output_contract`, `failure_modes`, `freshness_policy`, `diagnostics_contract`)
> - a receipt field (`ReceiptRow`, `TurnReceipt`, `ConceptReceipt`, `SourceDisciplineReceipt`)
> - a scorer (any function in `eval_loop/scorers.py`)
> - a response-contract rule (`backend/app/assistant_runtime/response_contract*.py`, hard-gate categories, contract-failure scoring)
> - a tool/confirmation safety rule (`request_lifecycle.py` write-intent intercept, `pending_action` receipt, `AdvancedDrawer` flow)
>
> Otherwise the instruction is **removed** or **rewritten** to attach to one.

A sixth implicit reference type is allowed: a **runtime invariant enforced in code** (e.g., authoritative-state immutability triggers). When the runtime forces the behavior deterministically and the model has no role, an instruction telling the model the rule is decorative — those are candidates for removal.

## Scope

The audit covers **model-facing instructions** — text that ships into the prompt the model sees. Categories:

1. `backend/app/assistant_runtime/prompts/system_base.txt`
2. The five `SKILL_PROMPT_FILES` (`skill_explain_metric.txt`, `skill_analysis.txt`, `skill_lookup_entity.txt`, `skill_generate_lp_summary.txt`, `skill_create_entity.txt`)
3. The Meridian structured guardrail block in `prompt_registry.py:14-21` (conditional, injected when scope is Meridian)
4. The lane-A minimal-mode tag in `prompt_strategy.py:563`
5. The context-anchor pattern in `prompt_strategy.py:247`

## Out of audit scope (explicitly noted, intentionally not included)

The following surfaces produce text that ships to **users**, not to the model. They are tested by other means and are intentionally outside the strip-down rule:

- `backend/app/assistant_runtime/degraded_responses.py` — runtime-emitted user-facing responses when a skill cannot run. Tested by `backend/tests/test_*` against the `degraded_reason` enum and the existing `forbidden_generic_degraded` product check.
- `backend/app/assistant_runtime/request_lifecycle.py:382` — the hardcoded `"Ready to create {label}. Confirm to proceed."` response that intercepts create-intent before the LLM. Deterministic safety guardrail; tested by the write-confirmation flow tests.
- `CLAUDE.md` — a router for repo-local *prompt-engineering* behavior (which skill/agent/playbook to use), not a runtime model prompt.

## Audit table

Reference notation:
- `concept:<concept_id>:<field>` — a concept-object field
- `receipt:<class>.<field>` — a Pydantic / dataclass field
- `scorer:<function_name>` — a scorer in `eval_loop/scorers.py`
- `safety:<rule>` — a tool/confirmation safety rule with file:line
- `runtime:<file:line>` — a runtime invariant enforced in code

| # | Instruction | Source | Decision | Reference | Rationale |
|---|---|---|---|---|---|
| 1 | `Follow the runtime contract in order: context, skill, lane, tools, execution, receipts.` | [system_base.txt:4](../../backend/app/assistant_runtime/prompts/system_base.txt#L4) | KEEP | `runtime:request_lifecycle.py:run_request_lifecycle` + `receipt:TurnReceipt` | Pipeline order is real and observable in receipts. `_receipt_completeness()` grades presence of each section. |
| 2 | `Do not pretend to have tools or context that were not provided.` | [system_base.txt:5](../../backend/app/assistant_runtime/prompts/system_base.txt#L5) | KEEP | `scorer:unsupported_claim_penalty` + hard-gate `hallucinated_number` | Hard-gate critical category. Maps to measurable failure. |
| 3 | `If the data is missing, say what specific field or record is unavailable.` | [system_base.txt:6](../../backend/app/assistant_runtime/prompts/system_base.txt#L6) | KEEP | `concept:repe.noi_variance:failure_modes[missing_context]` + `scorer:missing_data_failure_mode_score` + `receipt:ConceptReceipt.required_context_missing` | Failure mode requires naming the specific gap. Scorer grades it. Receipt records it. |
| 4 | `Never tell the user to navigate or open a page — answer from available data or state the exact gap.` | [system_base.txt:7](../../backend/app/assistant_runtime/prompts/system_base.txt#L7) | REMOVE | (covered by #2 and #3) | No scorer specifically grades navigation suggestions. The intent — answer from data or state the gap — is fully covered by the unsupported_claim and missing_data scorers. Duplicate. |
| 5 | `Prefer direct, factual answers over generic assistant framing.` | [system_base.txt:8](../../backend/app/assistant_runtime/prompts/system_base.txt#L8) | REWRITE | `scorer:generic_filler_penalty` + `scorer:output_contract_score` first-sentence-direct check | Aspirational phrasing, no graded behavior. Rewrite to: `Answer the question in the first sentence. Do not open with filler.` — exactly what both scorers verify. |
| 6 | `Never invent IDs, entities, metrics, or documents.` | [system_base.txt:9](../../backend/app/assistant_runtime/prompts/system_base.txt#L9) | KEEP | hard-gate `hallucinated_number` + `scorer:unsupported_claim_penalty` + `concept:repe.noi_variance:failure_modes[unsupported_claim]` | Multiple references — strongest anti-hallucination instruction. |
| 7 | `All metrics must resolve to a single canonical source. When two sources disagree, surface the conflict explicitly rather than silently picking a value.` | [prompt_registry.py:16](../../backend/app/assistant_runtime/prompt_registry.py#L16) | KEEP | `scorer:conflict_handling_score` + hard-gate `conflict_ignored` + `concept:repe.noi_variance:failure_modes[conflicting_source]` | Model-facing obligation graded by `conflict_handling_score`. Sources disagreeing is a scenario (S15) with a hard-gate category. |
| 8 | `No silent fallbacks — all degradation must be explicit.` | [prompt_registry.py:17](../../backend/app/assistant_runtime/prompt_registry.py#L17) | KEEP | `receipt:TurnReceipt.status` (degraded vs success) + `receipt:TurnReceipt.degraded_reason` + `forbidden_generic_degraded` product check | Model must name the degradation in the response. Receipt captures it; product check grades it. |
| 9 | `Explain the metric or concept using the provided context and retrieved evidence.` | [skill_explain_metric.txt:1](../../backend/app/assistant_runtime/prompts/skill_explain_metric.txt#L1) | KEEP | `concept:repe.noi_variance:required_context` + RAG contract + `scorer:unsupported_claim_penalty` | Pins answer basis to scope+RAG. |
| 10 | `If the user asks for a definition, answer in one sentence first; add context only when it sharpens the definition.` | [skill_explain_metric.txt:2](../../backend/app/assistant_runtime/prompts/skill_explain_metric.txt#L2) | KEEP | `scorer:output_contract_score` first-sentence-direct check (`scorers.py:1034`) + `concept:repe.noi_variance:output_contract.sections[direct_answer]` | Exactly what the first-sentence-direct scorer verifies. No rewrite needed — wording already precise. |
| 11 | `Perform analysis using only the resolved context, retrieved evidence, and tool results.` | [skill_analysis.txt:1](../../backend/app/assistant_runtime/prompts/skill_analysis.txt#L1) | KEEP | `concept:repe.noi_variance:required_context` + `scorer:unsupported_claim_penalty` + `scorer:source_discipline_score` | Anti-hallucination; source-grounded analysis. |
| 12 | `Call out uncertainty instead of smoothing over missing data.` | [skill_analysis.txt:2](../../backend/app/assistant_runtime/prompts/skill_analysis.txt#L2) | KEEP | `concept:repe.noi_variance:failure_modes` + `scorer:missing_data_failure_mode_score` + `scorer:generic_filler_penalty` | Direct mapping to fail-closed behavior. |
| 13 | `Answer environment and entity lookup questions directly.` | [skill_lookup_entity.txt:1](../../backend/app/assistant_runtime/prompts/skill_lookup_entity.txt#L1) | KEEP | `scorer:generic_filler_penalty` + `scorer:output_contract_score` | Direct-answer behavior graded by both scorers. |
| 14 | `If the answer is already in context, do not narrate extra work.` | [skill_lookup_entity.txt:2](../../backend/app/assistant_runtime/prompts/skill_lookup_entity.txt#L2) | KEEP | `scorer:generic_filler_penalty` | Extra narration with no information value is a filler anti-pattern. |
| 15 | `Generate investor-facing summaries grounded in the available fund, report, and document context.` | [skill_generate_lp_summary.txt:1](../../backend/app/assistant_runtime/prompts/skill_generate_lp_summary.txt#L1) | KEEP | `concept:repe.noi_variance:required_context` + `scorer:unsupported_claim_penalty` + `scorer:source_discipline_score` | Source-grounded answers; graded. |
| 16 | `Do not fabricate report sections that were not retrieved or computed.` | [skill_generate_lp_summary.txt:2](../../backend/app/assistant_runtime/prompts/skill_generate_lp_summary.txt#L2) | KEEP | hard-gate `hallucinated_number` + `scorer:unsupported_claim_penalty` | Anti-hallucination. |
| 17 | `For writes and mutations, be explicit about what will change.` | [skill_create_entity.txt:1](../../backend/app/assistant_runtime/prompts/skill_create_entity.txt#L1) | KEEP | `safety:request_lifecycle.py` write-intent intercept + `receipt:TurnReceipt.pending_action` | Write-explicitness is a confirmation safety rule. Must not weaken. |
| 18 | `If confirmation is required, do not imply the write has already happened.` | [skill_create_entity.txt:2](../../backend/app/assistant_runtime/prompts/skill_create_entity.txt#L2) | KEEP | `safety:request_lifecycle.py` write-intent intercept + `receipt:TurnReceipt.pending_action` | No-silent-writes. Must not weaken. |
| 19 | `[lane=A minimal mode — no RAG, no history beyond 2 turns, no domain blocks]` | [prompt_strategy.py](../../backend/app/services/prompt_strategy.py) lane-A wrapper | KEEP | `LanePolicy` in `lane_policy.py` + `receipt:TurnReceipt.lane` | Tells the model the configuration in effect; observable on every receipt. |
| 20 | `[context anchor: {entity_label}; {page}; {quarter}]` | [prompt_strategy.py](../../backend/app/services/prompt_strategy.py) deictic-rewrite block | KEEP | `receipt:CompositionPlan.deictic_rewrites` + `concept:repe.noi_variance:required_context` (entity, period, scope) | The anchor resolves the entity/period/scope fields the concept's required_context list grades. |

## Summary

- **Total instructions audited:** 20
- **KEEP:** 18
- **REWRITE:** 1 (`system_base.txt:8` — replace aspirational phrasing with exact scorer-graded behavior)
- **REMOVE:** 1 (`system_base.txt:7` — duplicate of #2 and #3; no independent scorer)

The 4 phantom rows from the earlier draft (referencing `prompt_registry.py` lines 16–21 that don't exist) are removed. The actual Meridian guardrail (`prompt_registry.py:14-17`) has exactly 2 instructions, both kept.

## Applied changes

**system_base.txt — line 7 removed:**
> ~~`Never tell the user to navigate or open a page — answer from available data or state the exact gap.`~~

Deleted. Covered by instructions #2 and #3.

**system_base.txt — line 8 rewritten:**

Old: `Prefer direct, factual answers over generic assistant framing.`
New: `Answer the question in the first sentence. Do not open with filler.`

Attached to `output_contract_score` first-sentence-direct check and `generic_filler_penalty`.

## Guardrails preserved

| Guardrail | Preserved by |
|---|---|
| Confirmation-required behavior | KEEPs #17, #18 + `TurnReceipt.pending_action` |
| No silent writes | KEEP #18 — instruction unchanged |
| No invented data | KEEPs #2, #6, #16 — three independent scorer references |
| Fail-closed on missing data | KEEPs #3, #12 + `concept:failure_modes` + `missing_data_failure_mode_score` |
| Response contract order | KEEP #1 + `request_lifecycle.run_request_lifecycle` |
| Conflict surfacing | KEEP #7 + `conflict_handling_score` + hard-gate `conflict_ignored` |
| Meridian authoritative-state lock | Enforced in `re_authoritative_enforce_promotion()` in code — not a model-facing instruction; not in scope of this audit |
