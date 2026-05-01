---
name: novendor-outreach-sync
description: Import Novendor outreach email from Gmail, Outlook classic COM exports, or Microsoft Graph into the Novendor CRM, and manage live info@novendor.ai email hooks that log outreach and create reply tasks. Use when the user asks to merge outreach email, backfill Hall Boys/Hallboys outreach, sync info@novendor.ai, create Microsoft Graph mailbox hooks, or troubleshoot CRM outreach email imports.
---

# Novendor Outreach Sync

Use this skill for Novendor internal outreach email ingestion. It writes CRM state through backend services and SQL, not browser form automation.

## Hard Rules

- Never send, move, label, archive, or delete email.
- Default import scripts to dry-run; require `--apply` for writes.
- Resolve live CRM IDs before writing. Do not rely on cached Hall Boys IDs.
- Deduplicate by provider message id and normalized logical hash before creating `cro_outreach_log`.
- For new live inbound prospect replies, create one visible execution task with `auto_source='email_inbound_reply'`.
- Historical backfills should not create reply tasks unless the operator passes `--create-reply-tasks`.

## Backfill Workflow

1. Gather provider payloads:
   - Gmail connector results can be saved as JSON with the connector fields (`id`, `from_`, `to`, `cc`, `subject`, `body`, `email_ts`, attachments).
   - Outlook classic backfill uses:
     ```powershell
     python scripts/novendor_outreach_sync/outlook_com_export.py --query hallboys --limit 50 > hallboys-outlook.json
     ```
2. Preview candidates:
   ```powershell
   python scripts/novendor_outreach_sync/import_emails.py --json-file hallboys.json
   ```
3. Apply only after the preview looks right:
   ```powershell
   python scripts/novendor_outreach_sync/import_emails.py --json-file hallboys.json --apply
   ```
4. Verify by querying `cro_outreach_log` joined to `crm_account`/`crm_contact` for the target account.

## Live Graph Hooks

Use Microsoft Graph for live `info@novendor.ai` hooks; do not use desktop Outlook COM for live triggers.

Required environment variables:

- `MSGRAPH_TENANT_ID`
- `MSGRAPH_CLIENT_ID`
- `MSGRAPH_CLIENT_SECRET`
- `MSGRAPH_NOTIFICATION_URL`
- `MSGRAPH_WEBHOOK_CLIENT_STATE`
- Optional: `MSGRAPH_LIFECYCLE_NOTIFICATION_URL`

Create or renew subscriptions:

```powershell
python scripts/novendor_outreach_sync/msgraph_subscriptions.py create --mailbox info@novendor.ai
python scripts/novendor_outreach_sync/msgraph_subscriptions.py renew --subscription-id <id>
```

Webhook endpoint:

- `POST /api/integrations/email/msgraph/webhook`
- Validation-token requests return the token as plain text.
- Real notifications validate `clientState`, return quickly, then fetch and import messages in a background task.
- Lifecycle notifications renew, recover, or mark subscriptions for resync.

## Key Files

- `backend/app/services/outreach_email_sync.py` - normalization, dedupe, CRM matching, import, reply tasks.
- `backend/app/services/msgraph_email_sync.py` - Graph auth, subscriptions, notification processing.
- `backend/app/routes/email_integrations.py` - webhook endpoint.
- `repo-b/db/schema/606_outreach_email_sync.sql` - source-message and subscription tables.
- `scripts/novendor_outreach_sync/` - import, Outlook export, and Graph subscription CLIs.
