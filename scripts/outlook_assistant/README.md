# Outlook Assistant for Mac v1

Local Python CLI for Legacy Outlook for Mac using AppleScript through `osascript`.

## What it does

- Reads Inbox and selected folders
- Searches mail by sender, subject, keyword, dates, unread state, and attachments
- Classifies messages into `important_human`, `newsletter`, `automated_alert`, or `other`
- Drafts replies into Outlook Drafts
- Drafts outbound outreach for configured lead groups with real recipient emails
- Stages risky actions like moves behind an approval gate by default
- Saves attachments to a local folder
- Logs every action to `logs/actions.jsonl`

## Setup

1. Confirm you are using Legacy Outlook for Mac.
2. Open Outlook once manually.
3. Review and edit `config.yaml`.
4. Optionally copy `.env.example` to `.env` for local overrides.
5. Run a dry-run command first:

```bash
python3 -m scripts.outlook_assistant.cli --dry-run search-mail --folder Inbox
```

## macOS permissions

The first real run may trigger an Automation prompt.

- Open `System Settings > Privacy & Security > Automation`
- Allow your terminal app to control `Microsoft Outlook`
- If access is still blocked, toggle the permission off and back on, then retry

## Example commands

```bash
python3 -m scripts.outlook_assistant.cli summarize-inbox --folder Inbox
python3 -m scripts.outlook_assistant.cli --dry-run morning-briefing
python3 -m scripts.outlook_assistant.cli draft-replies --instructions "I will send a fuller response this afternoon."
python3 -m scripts.outlook_assistant.cli draft-lead-outreach --lead-group crm_existing_leads --dry-run
python3 -m scripts.outlook_assistant.cli move-newsletters --destination-folder "Low Value"
python3 -m scripts.outlook_assistant.cli --dry-run save-attachments --folder Inbox --sender invoices@
python3 -m scripts.outlook_assistant.cli review-pending
python3 -m scripts.outlook_assistant.cli approve-pending
```

## Dry-run flow

1. `search-mail --dry-run --folder Inbox`
2. `summarize-inbox --dry-run`
3. `draft-replies --dry-run`
4. `move-newsletters --dry-run`
5. `move-newsletters`
6. `review-pending`
7. `approve-pending`

## Lead groups

`config.yaml` supports a `lead_groups` block. Each group can carry:

- `folders` for inbox-focused commands
- `sender_domains` for inbox filtering
- `contacts` for outbound draft batches

Example:

```bash
python3 -m scripts.outlook_assistant.cli draft-lead-outreach --lead-group crm_existing_leads
python3 -m scripts.outlook_assistant.cli morning-briefing --lead-group crm_existing_leads --dry-run
```

## Known limits

- v1 is built for Legacy Outlook for Mac.
- AppleScript coverage varies by Outlook build and account type.
- Category and flag support are best effort and fail loudly if unsupported.
- Search is folder-scoped and runs client-side after message collection.
