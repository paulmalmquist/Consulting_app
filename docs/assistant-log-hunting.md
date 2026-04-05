# Winston Assistant Log Hunting

## Correlation IDs

Every assistant turn emits structured logs with these IDs:

| ID | What it identifies | Where to find it |
|---|---|---|
| `request_id` | Single assistant turn | SSE `done` event, Railway logs |
| `conversation_id` | Multi-turn thread | Frontend localStorage, API response |
| `env_id` | Active environment | Context envelope, resolved scope |
| `entity_id` | Active entity (fund, asset, deal) | Resolved scope, thread entity state |

## Searching Railway Logs

```bash
# Find a specific turn by request_id
railway logs --service authentic-sparkle --since 15m | grep "req_abc123"

# Find all turns that degraded
railway logs --service authentic-sparkle --since 1h | grep "RETRIEVAL_EMPTY\|MISSING_CONTEXT\|AMBIGUOUS_CONTEXT"

# Find quality gate failures
railway logs --service authentic-sparkle --since 1h | grep "harness.quality_gate" | grep "FAIL"

# Find context carry-forward events
railway logs --service authentic-sparkle --since 1h | grep "harness.context_carry_forward"

# Find "Not available in current context" responses
railway logs --service authentic-sparkle --since 1h | grep "Not available in the current context"
```

## Investigating the Clarification Carry-Forward Regression

The specific failure pattern:
1. User asks ambiguous question (multiple funds visible)
2. Winston lists options, asks for clarification
3. User says "yes the first one"
4. Winston acknowledges selection
5. User asks follow-up ("show me the fund summary")
6. Winston says "Not available in the current context"

### Diagnosis steps

1. Get the `conversation_id` from the frontend (localStorage or network tab)
2. Search Railway logs for that conversation:
   ```bash
   railway logs --service authentic-sparkle --since 30m | grep "<conversation_id>"
   ```
3. Look for these events in order:
   - `assistant_runtime.context_resolved` — check `resolution_status`
   - `harness.context_carry_forward` — should appear if thread state was used
   - `harness.quality_gate` — check for `lost_followup_context` failure
   - `harness.entity_persisted` — should appear after clarification turn
4. If `harness.context_carry_forward` is missing on the follow-up turn, the thread entity state was not loaded or the entity wasn't persisted
5. If `lost_followup_context` gate fired, the thread state existed but context resolver didn't use it

### Receipt inspection

The `TurnReceipt` in the SSE `done` event includes:
- `context.inherited_entity_id` — non-null if entity was inherited
- `context.inherited_entity_source` — `"thread_state"` if from thread state
- `quality_gates` — array of failed gate results (null if all passed)

## Common Failure Patterns

| Symptom | Likely cause | Where to look |
|---|---|---|
| "Not available in the current context" on a page with data | Retrieval empty + no visible data fallback | `retrieval.debug.empty_reason` |
| Clarified entity lost between turns | Thread entity state not persisted | `harness.entity_persisted` absent |
| Fund name from wrong environment | Cross-environment contamination | `retrieval.debug.scope_filters` |
| Write executed without confirmation | Missing pending action | `quality_gates: write_confirmation_present` |
| Generic degraded on rich page | Response honesty gate should fire | `quality_gates: response_honesty` |
