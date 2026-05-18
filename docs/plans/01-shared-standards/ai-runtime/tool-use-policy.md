# Tool Use Policy

## MCP tool governance

All MCP tools used by Winston must be registered in `backend/app/mcp/tools/`. Unregistered tools may not be invoked.

## Tool categories and confirmation requirements

| Category | Confirmation required? | Receipt required? |
|---|---|---|
| Read-only query | No | No |
| Write (create record) | Yes | Yes |
| Write (update record) | Yes | Yes |
| Write (delete record) | Yes — with explicit warning | Yes |
| Financial calculation | No (read-only) | Yes (provenance receipt) |
| External API call (non-mutating) | No | No |
| External API call (mutating) | Yes | Yes |
| File upload | Yes | Yes |
| Send message / email / notification | Yes | Yes |

## Confirmation gate behavior

When confirmation is required:
1. Winston must pause the stream with `confirmation_required` event
2. The UI must show the proposed action with full detail (what will change, affected records, estimated impact)
3. User must explicitly confirm or cancel
4. If confirmed → proceed, then emit `receipt_issued`
5. If cancelled → emit `response_end` with `terminal_status: "cancelled"`
6. If no response within timeout → emit `response_end` with `terminal_status: "timeout"`

## Receipt format

```json
{
  "receipt_id": "uuid",
  "action": "create_accounting_entry",
  "env_id": "...",
  "timestamp": "ISO-8601",
  "actor": "winston_ai",
  "tool_used": "nv_accounting_desk.create_entry",
  "input": {...},
  "result": {...},
  "reversible": true,
  "reversal_tool": "nv_accounting_desk.delete_entry"
}
```

## Prohibited tool behaviors

- A tool may not silently succeed when it actually failed
- A tool may not return a cached result as if it were a live result without declaring it
- A tool may not cross env_id boundaries
- A tool may not execute a write that was not explicitly confirmed
- A tool may not write to a table without RLS
