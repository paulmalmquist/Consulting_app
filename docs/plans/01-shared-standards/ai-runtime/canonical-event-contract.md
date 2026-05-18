# Canonical Event Contract

## SSE / Streaming response lifecycle

Every streamed AI response must emit events in this order:

```
thinking_start        (optional, if thinking mode enabled)
thinking_delta*       (optional, repeating)
thinking_end          (optional)
response_start        (required)
response_delta*       (required, repeating — content chunks)
tool_call_start       (if tool is invoked)
tool_call_result      (required after tool_call_start)
confirmation_required (if dangerous write — must pause stream)
confirmation_received (after user confirms)
receipt_issued        (required after confirmed write)
response_end          (required — closes stream)
```

## Terminal states

A response is in terminal state when `response_end` is emitted. The `response_end` event must carry a `terminal_status` field:

| terminal_status | Meaning |
|---|---|
| `complete` | Full answer delivered |
| `error` | Unrecoverable error |
| `refused` | AI declined to answer (with reason) |
| `null_returned` | Data was missing (with null_reason) |
| `pending_confirmation` | Waiting for user confirmation |
| `tool_error` | Tool call failed |

## Required fields on response_end

```json
{
  "event": "response_end",
  "terminal_status": "complete",
  "env_id": "...",
  "model_used": "claude-sonnet-4-6",
  "tool_calls": [],
  "receipts": [],
  "null_reasons": [],
  "provenance": {}
}
```

## What must never happen

- Stream ends without `response_end`
- `response_end` emitted without `terminal_status`
- Tool call result not followed by `receipt_issued` for write operations
- `complete` terminal status when the answer was partial or guessed
- Two consecutive `response_start` events without a `response_end`

## Error handling rule

On unrecoverable error, emit:
```json
{"event": "response_end", "terminal_status": "error", "error": {"code": "...", "message": "..."}}
```

Never emit: `{"event": "response_end", "terminal_status": "complete"}` after an error. Users will trust the wrong information.
