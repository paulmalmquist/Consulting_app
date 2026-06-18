# Eval plan

## Null-reason coverage

Every `null_reason` the dispatch layer can emit has a test that triggers it and asserts the result is
surfaced honestly (status + null_reason, no answer, no exception). Current coverage in
`backend/tests/test_ai_dispatch_*.py`:

| null_reason | Triggering condition | Test |
|---|---|---|
| `risk_tier_forbidden` | HIGH-risk routed at Gemma | `test_high_risk_cannot_route_to_gemma`, forced-gemma policy test |
| `privacy_forbidden` | SENSITIVE data at Gemma | `test_sensitive_privacy_excludes_gemma` |
| `capability_unavailable` | mode not in provider's allowed_modes (forced) | `test_forced_ineligible_provider_blocked_on_capability` |
| `no_eligible_provider` | no provider can serve the request | `test_no_eligible_provider_blocked` |
| `provider_not_configured` | eligible home provider unavailable, no fallback | `test_summarization_prefers_gemma_and_fails_closed_without_fallback`, supervisor + route tests |
| `fallback_disabled` | (policy path) fallback not requested | covered by the fail-closed routing tests |
| `invalid_inputs` | empty task | `test_empty_task_blocked_invalid_inputs` |
| `provider_call_failed` | adapter raises | `test_provider_call_error_is_degraded`, `test_unexpected_error_is_degraded_and_never_raises` |
| `receipt_write_failed` | `record_decision` returns None | `test_receipt_failure_degrades_and_nulls_id` |

## Routing scaffold

`evals/ai_dispatch/routing_policy.jsonl` holds deterministic routing cases (policy denials + the Gemma
fail-closed path) runnable without provider credentials:

```
python -m scripts.ai_dispatch.cli eval --suite routing_policy
```

## Gemma promotion criteria (PR 2+)

Gemma becomes the *default* for a mode only after, on that mode's eval suite:
- ≥ 90% pass rate,
- 0 critical hallucinations,
- 0 unsupported claims presented as grounded,
- a better latency/cost profile than the frontier model for that mode.

Until then Gemma drafts and assists; OpenAI and Claude approve, code, and adjudicate. Promotion is
per-mode, never global, and is recorded.
