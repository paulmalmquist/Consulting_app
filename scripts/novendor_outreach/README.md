# novendor_outreach — dedicated Outlook draft engine

Python engine for Outlook for Mac. Gives code the same shape of access pywin32 gives on Windows, via AppleScript under the hood. Creates drafts, lists drafts, lists accounts. Never sends.

## Why this exists

On Windows, you automate Outlook with the COM interop:

```python
import win32com.client
outlook = win32com.client.Dispatch("Outlook.Application")
mail = outlook.CreateItem(0)          # olMailItem
mail.Subject = "..."
mail.Body = "..."
mail.To = "x@y.com"
mail.Save()                           # saves to Drafts
```

On macOS, Outlook for Mac exposes an AppleScript dictionary rather than COM. This engine wraps `osascript` behind a Pythonic class so calling code looks like:

```python
from scripts.novendor_outreach.outlook import OutlookClient, NewDraft

client = OutlookClient(default_account_name="info@novendor.ai")
draft = client.create_draft(NewDraft(
    subject="Congrats on the Head of Data hire",
    body="Saw Electra brought on a Head of Data...",
    to="cfo@electra.com",
))
print(draft.id, draft.subject)
```

No OAuth, no Azure AD app registration, no Graph API. Uses the account state Outlook already has.

## Public API

### `OutlookClient`

```python
OutlookClient(
    default_account_name: str = "info@novendor.ai",
    require_account_match: bool = True,
)
```

- `is_running() -> bool` — whether Outlook for Mac is currently running.
- `list_accounts() -> list[Account]` — all configured mail accounts.
- `list_drafts(account_name: str | None = None) -> list[Draft]` — read the Drafts folder.
- `create_draft(draft: NewDraft) -> Draft` — single draft, returns the created draft.
- `create_drafts(drafts: Sequence[NewDraft]) -> list[Draft]` — batch create, stops on first error.

### Value objects

```python
@dataclass(frozen=True)
class Account:
    name: str
    email_address: str | None = None

@dataclass(frozen=True)
class Draft:
    id: str
    subject: str
    account_name: str | None = None

@dataclass(frozen=True)
class NewDraft:
    subject: str
    body: str
    to: str | None = None
    to_name: str | None = None
    cc: Sequence[str] = ()
    bcc: Sequence[str] = ()
    account_name: str | None = None
```

### Errors

- `OutlookError` — base class
- `OutlookUnavailableError` — raised on Windows, Linux, or missing `osascript`
- `OutlookAccountNotFoundError` — raised when the requested account can't be matched and `require_account_match=True`
- `OutlookOperationError` — wraps any AppleScript failure with full stderr

## Quick start

### One-time setup

```bash
cd /Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app
pip install -r scripts/novendor_outreach/requirements.txt   # only needed for the MCP server
```

Confirm the account name Outlook uses:

```bash
python -m scripts.novendor_outreach.cli --accounts
```

If the display name isn't `info@novendor.ai`, pass the actual name via `--account-name`.

### Create the four seeded prospect drafts

```bash
python -m scripts.novendor_outreach.cli --all
```

Expected: four `[ok]` lines, one per prospect, each with an Outlook message id.

### Verify they landed

```bash
python -m scripts.novendor_outreach.cli --drafts
```

Or scope to the info mailbox only:

```bash
python -m scripts.novendor_outreach.cli --drafts --scope-account
```

### Freeform draft

```bash
python -m scripts.novendor_outreach.cli \
    --subject "Quick note" \
    --body-file /tmp/note.txt \
    --to cfo@example.com \
    --to-name "Jane Doe"
```

## Programmatic use

```python
from scripts.novendor_outreach.outlook import OutlookClient, NewDraft

client = OutlookClient()

# Discovery
for a in client.list_accounts():
    print(a.name, a.email_address)

# Read current drafts
for d in client.list_drafts(account_name="info@novendor.ai"):
    print(d.subject)

# Create one
client.create_draft(NewDraft(
    subject="Fund X close and the development spinout",
    body="Congrats on Fund X...",
    to="asciara@crowholdings.com",
    to_name="Adam Sciara",
))

# Create many
from scripts.novendor_outreach.prospects import PROSPECT_DRAFTS
drafts = [NewDraft(subject=p.subject, body=p.body, to_name=p.to_name)
          for p in PROSPECT_DRAFTS.values()]
client.create_drafts(drafts)
```

## MCP server

Register in Claude Code / Cowork MCP config:

```json
{
  "mcpServers": {
    "novendor-outreach": {
      "command": "python",
      "args": ["-m", "scripts.novendor_outreach.mcp_server"],
      "cwd": "/Users/paulmalmquist/VSCodeProjects/BusinessMachine/Consulting_app"
    }
  }
}
```

Restart the Claude session. Tools available:

- `list_outlook_accounts`
- `list_outlook_drafts`
- `create_outlook_draft`
- `create_prospect_draft`
- `list_prospect_drafts`

## Windows port (not implemented here)

On Windows the engine raises `OutlookUnavailableError` immediately. A Windows backend using `win32com.client` can slot behind the same `OutlookClient` public surface without changing call sites. Rough sketch:

```python
import win32com.client

def create_draft(draft: NewDraft) -> Draft:
    outlook = win32com.client.Dispatch("Outlook.Application")
    mail = outlook.CreateItem(0)  # olMailItem
    mail.Subject = draft.subject
    mail.Body = draft.body
    if draft.to:
        mail.To = draft.to
    if draft.cc:
        mail.CC = "; ".join(draft.cc)
    if draft.bcc:
        mail.BCC = "; ".join(draft.bcc)
    # Account selection uses SendUsingAccount with the Accounts collection
    if draft.account_name:
        for a in outlook.Session.Accounts:
            if a.DisplayName == draft.account_name:
                mail.SendUsingAccount = a
                break
    mail.Save()
    return Draft(id=mail.EntryID, subject=mail.Subject, account_name=draft.account_name)
```

Keep the AppleScript and COM backends in separate modules. `OutlookClient.__init__` picks based on `platform.system()`.

## Safety

- No send path anywhere. The AppleScript contains no `send` command, and neither the CLI nor the MCP exposes a send tool.
- Drafts are committed with `open newMessage` + `close newMessage saving yes`. `save newMessage` does NOT work on Outlook for Mac (error -1701 asks for a file path).
- Account-match fail-loud: `require_account_match=True` (default) raises `OutlookAccountNotFoundError` if the draft landed in the wrong account. Pass `--allow-account-fallback` (CLI) or `allow_account_fallback=True` (MCP) to tolerate.
- Body content routes through a UTF-8 temp file so every quote, newline, and non-ASCII char survives AppleScript intact.

## Troubleshooting

**`osascript` permission prompt**
First run triggers a macOS automation dialog. Approve. Thereafter: System Settings → Privacy & Security → Automation → toggle the controlling process for Microsoft Outlook.

**`OutlookAccountNotFoundError`**
The display name you passed doesn't match any Outlook account. Run `--accounts` to see the exact names, or start `OutlookClient(require_account_match=False)`.

**Error -1701 "A file or directory where the object should be saved is required"**
Old code on disk. The current engine uses `open newMessage` + `close newMessage saving yes` which never raises this. If you see it, confirm you're running the updated module.

**MCP server connects but tools don't appear**
Confirm `cwd` in the MCP config points at the repo root (where `scripts/` lives). Restart Claude after any config change.

## Files

```
scripts/novendor_outreach/
├── __init__.py
├── outlook.py           # OutlookClient engine
├── prospects.py         # Four seeded prospect drafts
├── cli.py               # Command-line entry
├── mcp_server.py        # FastMCP server
├── requirements.txt     # mcp SDK
└── README.md            # this file
```
