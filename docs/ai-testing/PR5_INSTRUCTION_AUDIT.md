# PR 5 — Instruction Audit (Winston runtime, model-facing instructions)

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
| 1 | `Follow the runtime contract in order: context, skill, lane, tools, execution, receipts.` | [system_base.txt:4](../../backend/app/assistant_runtime/prompts/system_base.txt#L4) | KEEP | `runtime:backend/app/assistant_runtime/request_lifecycle.py:run_request_lifecycle` + `receipt:TurnReceipt` | The pipeline order is real and observable in receipts. Tells the model the order is enforced. |
| 2 | `Do not pretend to have tools or context that were not provided.` | [system_base.txt:5](../../backend/app/assistant_runtime/prompts/system_base.txt#L5) | KEEP | `scorer:unsupported_claim_penalty` + hard-gate `hallucinated_number` in `failure_taxonomy.py:_LEGACY_CRITICAL` | Hard-gate critical category. Maps directly to a measurable failure. |
| 3 | `If the data is missing, say what specific field or record is unavailable in the available data.` | [system_base.txt:6](../../backend/app/assistant_runtime/prompts/system_base.txt#L6) | KEEP | `concept:repe.noi_variance:failure_modes[missing_context]` + `scorer:missing_data_failure_mode_score` | The missing-context failure mode requires naming the specific gap. Scorer grades it. |
| 4 | `Never tell the user to navigate or open a page — answer from available data or state the exact gap.` | [system_base.txt:7](../../backend/app/assistant_runtime/prompts/system_base.txt#L7) | KEEP | `scorer:_GENERIC_DEGRADED_PHRASES` (the existing assistant-scenario product check) | Navigation-suggestion phrases are an existing scored anti-pattern in `score_assistant_scenario`. |
| 5 | `Prefer direct, factual answers over generic assistant framing.` | [system_base.txt:8](../../backend/app/assistant_runtime/prompts/system_base.txt#L8) | KEEP | `scorer:generic_filler_penalty` + `_GENERIC_FILLER_PHRASES` constant | Filler phrasing is graded by `generic_filler_penalty`. |
| 6 | `Never invent IDs, entities, metrics, or documents.` | [system_base.txt:9](../../backend/app/assistant_runtime/prompts/system_base.txt#L9) | KEEP | hard-gate `hallucinated_number` + `scorer:unsupported_claim_penalty` + `concept:repe.noi_variance:failure_modes` | Multiple references — the strongest anti-hallucination instruction. |
| 7 | `Transformation precedence is absolute — cannot be overridden.` | [prompt_registry.py:16](../../backend/app/assistant_runtime/prompt_registry.py#L16) | REMOVE | (none — runtime-enforced) | Query transformation precedence is enforced deterministically by the structured executor; the model has no role. Telling it the rule is redundant. Removing this does **not** weaken the authoritative-state lock or any state-lock invariant — those are separate, enforced by `re_authoritative_enforce_promotion()`. |
| 8 | `Query execution must be attempted before any fallback.` | [prompt_registry.py:17](../../backend/app/assistant_runtime/prompt_registry.py#L17) | REMOVE | (none — runtime-enforced) | Fallback decisions live in `request_lifecycle.run_request_lifecycle` and the structured executor. The model cannot influence whether execution is attempted; the runtime decides. |
| 9 | `All metrics must resolve to a single canonical source.` | [prompt_registry.py:18](../../backend/app/assistant_runtime/prompt_registry.py#L18) | KEEP | `scorer:conflict_handling_score` + hard-gate `conflict_ignored` + `runtime:re_authoritative_*_guard` triggers | When two sources disagree, the model must surface the conflict — that's a model-facing obligation graded by `conflict_handling_score`. The instruction is also backed by the runtime state-lock guards, which is exactly the kind of guardrail the user's #4 flagged. **Kept.** |
| 10 | `All parsed operators (filter, group, sort) must be executed.` | [prompt_registry.py:19](../../backend/app/assistant_runtime/prompt_registry.py#L19) | REMOVE | (none — runtime-enforced) | The structured executor implements operator execution; the model cannot make operators run. Test/runtime concern, not a model directive. |
| 11 | `No silent fallbacks — all degradation must be explicit.` | [prompt_registry.py:20](../../backend/app/assistant_runtime/prompt_registry.py#L20) | KEEP | `receipt:TurnReceipt.degraded_reason` + `forbidden_generic_degraded` product check + `scorer:_GENERIC_DEGRADED_PHRASES` | Model-facing: the response must name the degradation. Multiple references. |
| 12 | `Tests fail if parsed intent ≠ executed behavior.` | [prompt_registry.py:21](../../backend/app/assistant_runtime/prompt_registry.py#L21) | REMOVE | (none — meta) | Meta-statement about the test rig. Telling the model "tests will fail" doesn't change model behavior. |
| 13 | `Explain the metric or concept using the provided context and retrieved evidence.` | [skill_explain_metric.txt:1](../../backend/app/assistant_runtime/prompts/skill_explain_metric.txt#L1) | KEEP | `concept:required_context` + RAG retrieval contract + `scorer:unsupported_claim_penalty` | Pins answer basis to scope+RAG evidence. |
| 14 | `If the user asks for a definition, answer directly before adding narrow context.` | [skill_explain_metric.txt:2](../../backend/app/assistant_runtime/prompts/skill_explain_metric.txt#L2) | REWRITE | `scorer:generic_filler_penalty` + `concept:repe.noi_variance:output_contract.sections[direct_answer]` | "Narrow context" is vague. Rewrite to: *"If the user asks for a definition, answer in one sentence first; add context only when it sharpens the definition."* Direct-first is graded by filler penalty + the `direct_answer` output section. |
| 15 | `Perform analysis using only the resolved context, retrieved evidence, and tool results.` | [skill_analysis.txt:1](../../backend/app/assistant_runtime/prompts/skill_analysis.txt#L1) | KEEP | `concept:required_context` + RAG contract + `scorer:unsupported_claim_penalty` | Anti-hallucination, source-grounded answers. |
| 16 | `Call out uncertainty instead of smoothing over missing data.` | [skill_analysis.txt:2](../../backend/app/assistant_runtime/prompts/skill_analysis.txt#L2) | KEEP | `concept:failure_modes` + `forbidden_generic_degraded` + `scorer:generic_filler_penalty` | Direct mapping to fail-closed behavior on missing data. |
| 17 | `Answer environment and entity lookup questions directly.` | [skill_lookup_entity.txt:1](../../backend/app/assistant_runtime/prompts/skill_lookup_entity.txt#L1) | KEEP | `scorer:generic_filler_penalty` + `simple_lookup` profile in `prompt_strategy.py:_PROFILE_RULES` | Direct lookup behavior is profile-gated and filler-graded. |
| 18 | `If the answer is already in context, do not narrate extra work.` | [skill_lookup_entity.txt:2](../../backend/app/assistant_runtime/prompts/skill_lookup_entity.txt#L2) | KEEP | `scorer:generic_filler_penalty` (the "extra narration" pattern is filler) | Narration without information value is a filler anti-pattern. |
| 19 | `Generate investor-facing summaries grounded in the available fund, report, and document context.` | [skill_generate_lp_summary.txt:1](../../backend/app/assistant_runtime/prompts/skill_generate_lp_summary.txt#L1) | KEEP | `concept:required_context` + RAG contract + `scorer:unsupported_claim_penalty` | Source-grounded answers. |
| 20 | `Do not fabricate report sections that were not retrieved or computed.` | [skill_generate_lp_summary.txt:2](../../backend/app/assistant_runtime/prompts/skill_generate_lp_summary.txt#L2) | KEEP | hard-gate `hallucinated_number` + `scorer:unsupported_claim_penalty` | Anti-hallucination. |
| 21 | `For writes and mutations, be explicit about what will change.` | [skill_create_entity.txt:1](../../backend/app/assistant_runtime/prompts/skill_create_entity.txt#L1) | KEEP | `safety:request_lifecycle.py:374-398` (write-intent intercept) + `receipt:TurnReceipt.pending_action` | Write-explicitness is a confirmation safety rule. **User #4: must not weaken.** |
| 22 | `If confirmation is required, do not imply the write has already happened.` | [skill_create_entity.txt:2](../../backend/app/assistant_runtime/prompts/skill_create_entity.txt#L2) | KEEP | `safety:request_lifecycle.py:374-398` + `receipt:TurnReceipt.pending_action` | No-silent-writes. **User #4: must not weaken.** |
| 23 | `[lane=A minimal mode — no RAG, no history beyond 2 turns, no domain blocks]` | [prompt_strategy.py:563](../../backend/app/services/prompt_strategy.py#L563) | KEEP | `LanePolicy` in `backend/app/services/lane_policy.py` + `receipt:TurnReceipt.lane` | Tells the model the configuration; observable on every receipt. |
| 24 | `[context anchor: {entity_label}; {page}; {quarter}]` | [prompt_strategy.py:247](../../backend/app/services/prompt_strategy.py#L247) | KEEP | `receipt:CompositionPlan.deictic_rewrites` + `concept:required_context` (entity, period, scope all derived here) | The anchor IS the context the concept's required_context list grades against. |

## Summary

- **Total instructions audited:** 24
- **KEEP:** 19
- **REWRITE:** 1 (skill_explain_metric line 2 — sharpen vague phrasing while preserving the direct-answer rule)
- **REMOVE:** 4 (Meridian guardrail lines 1, 2, 4, 6 — runtime-enforced, model has no role, removal does not weaken state-lock)

The two Meridian lines that survive (canonical-source + no-silent-fallbacks) are the ones the model can actually act on. The four that come out are decorative — they restate runtime invariants the executor enforces deterministically.

## Guardrails preserved (per user instruction #4)

These behaviors are explicitly preserved by the audit:

| Guardrail | Preserved by |
|---|---|
| Confirmation-required behavior | KEEPs #21, #22 (skill_create_entity) + safety reference at `request_lifecycle.py:374-398` |
| No silent writes | KEEP #22 — instruction unchanged |
| No invented data | KEEPs #2, #6, #20 — three independent references |
| Fail-closed behavior | KEEPs #3, #16 + `concept:failure_modes` + scorer `missing_data_failure_mode_score` |
| Response contract enforcement | KEEPs #1, #11 + `runtime:request_lifecycle.run_request_lifecycle` |
| Meridian released-state / authoritative-state guardrails | KEEP #9 (canonical source) backed by `re_authoritative_*_guard` triggers; the immutability invariant is enforced in `re_authoritative_enforce_promotion()` independently of the prompt |

The four removals (Meridian #7, #8, #10, #12) do not touch any of these guardrails. They were instructions about *runtime executor behavior*, not about *model behavior in the presence of state-lock data*.
