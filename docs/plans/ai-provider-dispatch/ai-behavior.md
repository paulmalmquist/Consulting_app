# AI behavior — hard boundaries

The dispatch layer **routes and records**. It does not invent a provider result, and it does not let a
cheap model take work it has not earned.

## The layer may
- Select a provider/model by mode, risk, and privacy.
- Report exactly why each provider was or was not chosen (the `rejected` map).
- Call a provider that is eligible AND available, and return its real output.
- Fall back to another eligible+available provider **only** when the request sets `allow_fallback`,
  and only with the fallback recorded on the result and receipt.
- Record a receipt for every dispatch, including blocked and failed ones.

## The layer may not
- Substitute a provider silently. If the chosen provider is unavailable and fallback was not requested,
  it fails closed with `provider_not_configured` — it does not quietly call a different one.
- Fabricate output. A non-success returns `BLOCKED`/`UNAVAILABLE`/`DEGRADED` with a `null_reason` and
  no answer — never an empty or invented one.
- Claim a receipt that did not write. A failed receipt yields `receipt_status="failed"`,
  `receipt_write_failed`, and `receipt_id=null`.

## Gemma boundaries (structural)
Gemma can only win cheap, low-risk, non-code modes. It is barred — by its `allowed_modes`, `max_risk`,
and `max_privacy` — from:
- code, tool execution, SQL drafting, eval grading (capability),
- HIGH risk (risk tier),
- SENSITIVE data (privacy).
In PR 1 Gemma is additionally unimplemented, so it always fails closed regardless of credentials. It is
promoted to a real default for a mode only via the eval gate in `eval-plan.md`.

## Provider roles
- **OpenAI** — code, structured/tool work, SQL drafts, eval grading; the high-risk and sensitive default.
- **Claude** — long-context planning, adversarial review, research synthesis.
- **Gemma** — drafting and summarizing low-risk internal content, once promoted.
