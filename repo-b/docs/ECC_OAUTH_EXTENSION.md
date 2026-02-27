# Extending ECC To Real OAuth Later

## Current MVP

- The live demo ships with deterministic seed data, manual forward ingestion (`POST /api/ecc/ingest/message`), and quick capture (`POST /api/ecc/quick_capture`).
- All ingest paths already normalize messages into the same internal `message -> classify -> task -> finance -> route` pipeline.

## OAuth Upgrade Path

1. Add provider connectors behind the current intake contract instead of branching the pipeline.
2. For Gmail and Outlook, keep provider-specific sync state in a new connector table keyed by `env_id`, provider, account id, and remote cursor.
3. Map provider ids to `source_id` and keep the current idempotency rule: dedupe on `(source, source_id, content hash)`.
4. Persist the raw provider payload unchanged in `raw_payload`, then run the same deterministic classifier and finance linker.
5. Use webhook or poll workers to append `MessageReceived` events, not to mutate queue state directly.
6. Keep approvals internal-only. OAuth should import context, not execute payments or send final emails automatically.

## Minimal Connector Interfaces

- `listMessages(cursor) -> raw provider payloads`
- `getMessage(provider_message_id) -> raw payload`
- `normalize(raw payload) -> current ingest contract`
- `ack(cursor) -> persist sync watermark`

## Safety Notes

- Token storage should live outside this demo store, ideally in a server-side secret manager.
- Provider retries must stay idempotent by reusing `source_id`.
- Manual forward and quick capture remain valid fallback paths if OAuth is degraded.
