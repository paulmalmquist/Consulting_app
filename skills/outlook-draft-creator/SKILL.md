---
name: outlook-draft-creator
description: Creates bulk email drafts in a specific Outlook account (e.g. info@novendor.ai) using a Python win32com script on Windows. Use this skill whenever the user wants to create multiple email drafts in Outlook — especially when sending from a non-default account, when they have a list of contacts to reach out to, or when they say things like "create drafts in Outlook", "batch email drafts", "save these emails to Outlook", "create outreach drafts in info@novendor.ai", "wincom", "win32com", or "use Python to create Outlook drafts". Do NOT use Gmail MCP or browser automation for this — always prefer this skill when the target is Outlook.
---

# Outlook Draft Creator (win32com)

Creates bulk email drafts directly in Outlook via Python's `win32com.client` library. Runs on Windows with Outlook installed and open.

## When to use

- User wants drafts in Outlook (not Gmail, not browser)
- User has a list of contacts + email bodies to batch-create
- User specifies a sender account (e.g. `info@novendor.ai`) that isn't the default
- User says "wincom", "win32com", "use Python for Outlook", or similar

## How it works

1. Extract the draft data (recipients, subjects, bodies) from the conversation
2. Write a Python script using the template in `scripts/create_drafts_template.py`
3. Save it to `C:\Projects\Consulting_app\scripts\create_outlook_drafts.py` (or user's preferred path)
4. Tell the user to run it — they double-click it or run `python <path>` in their terminal
5. Script connects to Outlook COM, finds the right account, creates MailItems, saves as drafts

## Step-by-step

### Step 1 — Collect the draft data

From the conversation, extract for each draft:
- `to`: recipient email address
- `subject`: email subject line
- `body`: full email body (plain text)

If any are missing, ask before proceeding.

### Step 2 — Write the script

Use `scripts/create_drafts_template.py` as the base. Replace the `DRAFTS` list with the actual contact data. Set `SUBJECT` to the shared subject line (or make it per-draft if subjects vary).

Key pattern for account selection:
```python
# Find the target account
for i in range(1, outlook.Session.Accounts.Count + 1):
    acct = outlook.Session.Accounts.Item(i)
    if "novendor" in acct.SmtpAddress.lower():  # adjust match string
        novendor_account = acct
        break

# Create each draft
mail = outlook.CreateItem(0)   # 0 = olMailItem
mail.To = draft["to"]
mail.Subject = draft["subject"]
mail.Body = draft["body"]
if target_account:
    mail.SendUsingAccount = target_account
mail.Save()  # saves to Drafts folder
```

### Step 3 — Save and instruct

Save the completed script to `C:\Projects\Consulting_app\scripts\create_outlook_drafts.py`.

Tell the user:
> Script is ready at `C:\Projects\Consulting_app\scripts\create_outlook_drafts.py`
> 
> To run it:
> 1. Make sure Outlook is open
> 2. Open a terminal / PowerShell and run:
>    ```
>    python "C:\Projects\Consulting_app\scripts\create_outlook_drafts.py"
>    ```
> 3. Check your Drafts folder in info@novendor.ai — you should see [N] new drafts

### Step 4 — Troubleshooting hints (include in response)

- **`win32com` not installed**: `pip install pywin32`
- **Outlook not found**: Outlook must be open before running the script
- **Account not found warning**: Script will still create drafts but in the default account — user can manually move them, or adjust the account match string
- **Permission error on `.py` file**: Run PowerShell as administrator, or copy the script to Desktop first

## Important rules

1. **Never use Gmail MCP** for Outlook drafts — wrong account, wrong app
2. **Never use browser automation** (outlook.office.com) — COM is faster and more reliable
3. **Always set `SendUsingAccount`** when the user specifies a non-default sender
4. **Always call `.Save()`** not `.Send()` — these are drafts, not sent emails
5. **Output the script as a file** the user can run, not just code in the chat

## Script location

Default output path: `C:\Projects\Consulting_app\scripts\create_outlook_drafts.py`

If the user has a different preferred location, use that instead.
