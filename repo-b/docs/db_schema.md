# Document + File Management Schema

This schema defines the app-owned `app.*` tables that power the document control plane. It is designed for Postgres 14+ and assumes document binaries live in Supabase Storage; the database stores immutable object pointers (`bucket` + `object_key`) and metadata only.

## Core tables

- **`app.tenants`**: Multi-tenant root entity.
- **`app.users`**: App-level user abstraction with optional `external_subject` for SSO/Supabase auth mapping.
- **`app.documents`**: Stable document identity with domain, classification, status, and metadata.
- **`app.document_versions`**: Append-only versions pointing to immutable storage objects.
- **`app.document_links`**: Generic links to runs/actions/entities (by `run_id`, `action_id`, `entity_type`, `entity_id`).
- **`app.roles`**, **`app.user_roles`**, **`app.document_acl`**: Role-based access control for documents.

## Ingestion / indexing stubs

- **`app.document_text`**: Extracted text per version.
- **`app.document_chunks`**: Chunked text (future embeddings/search).
- **`app.document_ingest_queue`**: Processing queue for ingestion workflows.

## Object storage pointers

Each `app.document_versions` row stores the immutable object location in Supabase Storage (`bucket`, `object_key`). UI operations such as rename/move should only change metadata (`title`, `virtual_path`) without changing `object_key`.

## Running the schema

> This schema **does not** modify any `storage.*` tables. Only the `app` schema is created/updated.

1. Ensure `DATABASE_URL` (or `SUPABASE_DB_URL`) is set.
2. Run the schema runner:

```bash
node scripts/apply_schema.js
```

Optional flags:

- `--dry-run` to print statements without executing
- `--verbose` to print full statements
- `--no-single-transaction` to run without a wrapping transaction
- `--sql=path/to/schema.sql` to apply a different SQL file

Example dry run:

```bash
node scripts/apply_schema.js --dry-run
```
