"""
create_drafts_template.py
Template for creating bulk Outlook email drafts via win32com.
Copy this file, fill in DRAFTS and SUBJECT, then run on Windows with Outlook open.

Usage: python create_outlook_drafts.py
Requirement: pip install pywin32
"""

import win32com.client
import sys

# ── CONFIG ────────────────────────────────────────────────────────────────────

# Shared subject line. Set to None to use per-draft subjects from DRAFTS list.
SUBJECT = "Your subject line here"

# Target sender account — partial match on SmtpAddress (case-insensitive).
# Set to None to use Outlook's default account.
SENDER_MATCH = "novendor"   # e.g. matches "info@novendor.ai"

# Draft data — fill this in for each recipient.
DRAFTS = [
    {
        "to": "recipient@example.com",
        "name": "Recipient Name — Company",           # for logging only
        # "subject": "Override subject",              # uncomment for per-draft subjects
        "body": """First Name,

Your email body here.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    # Add more dicts here...
]

# ── RUNTIME ───────────────────────────────────────────────────────────────────

def find_account(outlook, match_str):
    """Return the first Outlook account whose SmtpAddress contains match_str."""
    if not match_str:
        return None
    accounts = outlook.Session.Accounts
    for i in range(1, accounts.Count + 1):
        acct = accounts.Item(i)
        if match_str.lower() in acct.SmtpAddress.lower():
            print(f"  Account found: {acct.SmtpAddress}")
            return acct
    print(f"  WARNING: No account matching '{match_str}' found.")
    print("  Available accounts:")
    for i in range(1, accounts.Count + 1):
        print(f"    - {accounts.Item(i).SmtpAddress}")
    print("  Drafts will be saved to default account.\n")
    return None


def main():
    print("Connecting to Outlook...")
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
    except Exception as e:
        print(f"ERROR: Could not connect to Outlook. Is it open?\n{e}")
        sys.exit(1)

    target_account = find_account(outlook, SENDER_MATCH)

    created, failed = 0, []

    for draft_data in DRAFTS:
        try:
            mail = outlook.CreateItem(0)   # olMailItem
            mail.To = draft_data["to"]
            mail.Subject = draft_data.get("subject", SUBJECT)
            mail.Body = draft_data["body"]
            if target_account:
                mail.SendUsingAccount = target_account
            mail.Save()
            created += 1
            print(f"  ✓ {draft_data.get('name', draft_data['to'])}")
        except Exception as e:
            failed.append((draft_data.get("name", draft_data["to"]), str(e)))
            print(f"  ✗ FAILED: {draft_data.get('name', draft_data['to'])} — {e}")

    print(f"\n{'='*60}")
    print(f"DONE: {created}/{len(DRAFTS)} drafts created in Outlook")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for name, err in failed:
            print(f"  - {name}: {err}")
    else:
        print("No failures.")
    account_label = target_account.SmtpAddress if target_account else "default account"
    print(f"Check Drafts folder in: {account_label}")


if __name__ == "__main__":
    main()
