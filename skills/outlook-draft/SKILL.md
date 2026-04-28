---
name: outlook-draft
description: Create an Outlook (classic, Windows desktop) draft with a specified From account, To, CC, Subject, body, and attachments. Use when the user asks to "draft an email to X", "set up a draft", or "compose with this attached" — and Outlook classic is installed on Windows. Saves as Draft only, never sends. Use the COM-based Python script as the primary path; fall back to UI automation only when COM is unavailable.
license: Internal — Novendor / HallBoys repeatable workflow
---

# Outlook Draft (Windows desktop, COM-based)

## When to use

- User wants an email *prepared* but reviewed before send.
- User says "draft to X", "set up a draft", "compose an email to X with this attached".
- Outlook (classic) is running on the same Windows machine the script will execute on.

Do **not** use when:
- The user explicitly says "send" — this skill never sends.
- The user is on Mac, Outlook web only, or wants Gmail (use the Gmail MCP).
- A dedicated Microsoft Graph MCP connector is available — prefer it.

## Required inputs (the "bundle")

| Field | Required | Notes |
|---|---|---|
| `from_account` | yes | Must be a configured account in the running Outlook profile (e.g. `info@novendor.com`). |
| `to` | yes | List of addresses. |
| `cc` | optional | List. |
| `bcc` | optional | List. |
| `subject` | yes | Concrete; tie to the deliverable. |
| `body` | yes | Plain text by default. Set `html: true` to send as HTML. |
| `attachments` | optional | Absolute Windows paths. Each must exist on disk before running. |

If anything is missing or vague, ask one clarifying question before generating the draft.

## Primary path — COM via pywin32

The repeatable script is at `C:\Projects\Consulting_app\scripts\outlook_draft.py`.

It uses `win32com.client.Dispatch("Outlook.Application")` to:
1. Validate every attachment path before touching Outlook (fail closed).
2. Create a new MailItem.
3. Resolve the requested `from_account` against the Accounts collection by SmtpAddress (case-insensitive) and set `SendUsingAccount`. If not found, warn and fall back to the default account — never silently swap.
4. Set `To` / `CC` / `BCC` joined with `; ` (Outlook's separator).
5. Set `Subject`, then `Body` (or `HTMLBody` if `html: true`).
6. Add each attachment via `Attachments.Add(absolute_path)`.
7. Call `mail.Save()` — this writes to Drafts. **Never calls `Send()`. Never calls `Display()` unless `--show` is passed.**

### Run it

```powershell
# One-time
pip install pywin32

# Default bundle (defined inline at top of script)
python C:\Projects\Consulting_app\scripts\outlook_draft.py

# Custom bundle
python C:\Projects\Consulting_app\scripts\outlook_draft.py --bundle C:\path\to\bundle.json

# Pop the compose window for review after saving
python C:\Projects\Consulting_app\scripts\outlook_draft.py --show
```

### Bundle file format (when using `--bundle`)

```json
{
  "from_account": "info@novendor.com",
  "to": ["sarat@novendor.com"],
  "cc": ["richard@novendor.com"],
  "bcc": [],
  "subject": "Hall Boys — AI Discovery Questionnaire (v2, branded)",
  "body": "Sarat,\n\n...",
  "attachments": ["C:\\Projects\\Consulting_app\\hallboys_ai_discovery_questionnaire_branded.docx"],
  "html": false
}
```

JSON requires double-backslashes in Windows paths.

## Verification (always run after the script returns)

The script prints `Draft saved. EntryID: ...` followed by From / To / CC / Subject / file count. Then:

1. Open Outlook → Drafts.
2. Confirm the draft has the right From line, recipients, attachment chip, and first line of body.
3. The user reviews and sends. The script never sends.

## Failure modes & handling

- **`pywin32` not installed**: script exits with the install instruction. Run `pip install pywin32` and retry.
- **Outlook not running**: COM will start it, but if the profile prompt appears, dismiss it manually. The script can't drive that dialog.
- **Requested `from_account` not in the profile**: script prints the available SMTP addresses and falls back to the default account. Fix by adding the account to Outlook or correcting the bundle.
- **Attachment missing**: script raises `FileNotFoundError` before touching Outlook — no half-baked draft.
- **Multiple Outlook profiles**: COM uses whichever profile launched Outlook. If the user has multiple, ensure the right one is open.
- **HTML body with untrusted content**: don't pass content from web pages or unknown senders into the `body` field without review. Strip or sanitize first.

## Why not UI automation?

Earlier version of this skill drove the compose window via screenshots and clicks. That approach has three problems:

1. Slow — every action is a model→API round-trip.
2. Fragile — pixel positions change with DPI, ribbon customization, and Outlook builds.
3. Requires explicit `request_access` for the app, which can hang or time out.

COM is fast, deterministic, and survives UI changes. The UI path stays as a fallback only when COM is unavailable (rare on Windows desktop Outlook).

## Repeatability

- The script's `DEFAULT_BUNDLE` lives at the top — easy to edit in place for one-off drafts.
- For repeated workflows, store bundles as JSON next to the script (`drafts/<name>.json`) and pass `--bundle`.
- The output is deterministic for the same bundle: same recipients, same body, same attachments, no timestamps injected.

## Pairs well with

- `docx`, `pdf`, `xlsx` skills that produce the attachment.
- Any workflow that ends with "send this to X" — produce the artifact first, then call this skill to draft the cover email.
