"""Create an Outlook draft via COM (no UI automation).

Requires Outlook (classic) installed and `pywin32`:
    pip install pywin32

The draft is saved to the Drafts folder of the chosen From account.
Nothing is sent. Open Outlook → Drafts to review and send manually.

Usage:
    python outlook_draft.py                       # uses the bundle defined below
    python outlook_draft.py --bundle path.json    # load a different bundle

Bundle schema (JSON or dict in this file):
    {
        "from_account": "info@novendor.com",
        "to":  ["sarat@example.com"],
        "cc":  ["richard@novendor.com"],
        "bcc": [],
        "subject": "...",
        "body": "...",                 # plain text; \n becomes line break
        "attachments": [r"C:\\path\\to\\file.docx"],
        "html": false                   # set true if body is HTML
    }
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# Default bundle for the Hall Boys → Sarat draft.
# Edit this dict to reuse the script for other drafts, or pass --bundle.
DEFAULT_BUNDLE: dict[str, Any] = {
    "from_account": "info@novendor.com",
    "to": ["sarat@novendor.com"],   # confirm Sarat's exact address before running
    "cc": ["richard@novendor.com"],
    "bcc": [],
    "subject": "Hall Boys — AI Discovery Questionnaire (v2, branded)",
    "body": (
        "Sarat,\n"
        "\n"
        "Updated draft of the Hall Boys AI Discovery questionnaire is attached. "
        "Two changes from v1:\n"
        "\n"
        "1) Plumbing section reframed as project management — Section 2B is now "
        "\"Plumbing Project Management (New Construction).\" Q13/Q16/Q18 reframed "
        "from foreman-level field execution to PM-level visibility, scope handoff, "
        "and multi-trade coordination. Q1 and Q5 swapped foreman language for PM/super "
        "loading.\n"
        "\n"
        "2) Novendor branding applied — header banner, brand colors (ink/paper/gold), "
        "Cambria headings, Calibri body. Same content underneath, just dressed up.\n"
        "\n"
        "Take a pass when you can. Flag anything you want cut or sharpened before we "
        "send to Hallboys. The original v1 docx in Drive is untouched if you want to "
        "diff.\n"
        "\n"
        "— Paul"
    ),
    "attachments": [
        r"C:\Projects\Consulting_app\hallboys_ai_discovery_questionnaire_branded.docx"
    ],
    "html": False,
}


def _resolve_send_account(outlook_app, requested: str):
    """Find a Account whose SmtpAddress matches `requested` (case-insensitive)."""
    session = outlook_app.Session
    accounts = session.Accounts
    requested_norm = requested.strip().lower()
    available = []
    for i in range(1, accounts.Count + 1):
        acc = accounts.Item(i)
        # SmtpAddress is the canonical match; DisplayName/UserName are fallbacks.
        smtp = (getattr(acc, "SmtpAddress", "") or "").lower()
        available.append(smtp or acc.DisplayName)
        if smtp == requested_norm:
            return acc
    raise RuntimeError(
        f"Account '{requested}' not found in this Outlook profile. "
        f"Available: {available}"
    )


def create_draft(bundle: dict[str, Any]) -> str:
    """Create the draft and return its EntryID."""
    try:
        import win32com.client
    except ImportError as e:
        sys.exit(
            "pywin32 is required: pip install pywin32\n"
            f"({e})"
        )

    # Validate attachments first — fail closed before opening Outlook.
    for path in bundle.get("attachments", []):
        if not Path(path).is_file():
            raise FileNotFoundError(f"Attachment not found: {path}")

    outlook = win32com.client.Dispatch("Outlook.Application")
    mail = outlook.CreateItem(0)  # 0 = olMailItem

    # From account
    from_account = bundle.get("from_account")
    if from_account:
        try:
            account = _resolve_send_account(outlook, from_account)
            # Both properties are needed for the From line to render correctly.
            mail._oleobj_.Invoke(64209, 0, 8, 0, account)  # SendUsingAccount setter
        except Exception as e:
            print(f"WARN: could not set From={from_account}: {e}", file=sys.stderr)
            print("Falling back to default account.", file=sys.stderr)

    # Recipients — semicolons are Outlook's separator
    if bundle.get("to"):
        mail.To = "; ".join(bundle["to"])
    if bundle.get("cc"):
        mail.CC = "; ".join(bundle["cc"])
    if bundle.get("bcc"):
        mail.BCC = "; ".join(bundle["bcc"])

    mail.Subject = bundle.get("subject", "")

    # Body
    body = bundle.get("body", "")
    if bundle.get("html"):
        mail.HTMLBody = body
    else:
        mail.Body = body

    # Attachments
    for path in bundle.get("attachments", []):
        mail.Attachments.Add(str(Path(path).resolve()))

    # Save to Drafts. Display() is intentionally NOT called — we don't pop the window.
    mail.Save()

    entry_id = mail.EntryID
    return entry_id


def main(argv=None):
    parser = argparse.ArgumentParser(description="Create an Outlook draft via COM.")
    parser.add_argument(
        "--bundle",
        type=str,
        default=None,
        help="Path to a JSON file with the email bundle. Omit to use DEFAULT_BUNDLE.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="After saving the draft, open the compose window for review.",
    )
    args = parser.parse_args(argv)

    if args.bundle:
        with open(args.bundle, "r", encoding="utf-8") as f:
            bundle = json.load(f)
    else:
        bundle = DEFAULT_BUNDLE

    entry_id = create_draft(bundle)
    print(f"Draft saved. EntryID: {entry_id}")
    print(f"  From:    {bundle.get('from_account', '(default)')}")
    print(f"  To:      {', '.join(bundle.get('to', []))}")
    print(f"  CC:      {', '.join(bundle.get('cc', []))}")
    print(f"  Subject: {bundle.get('subject', '')}")
    print(f"  Files:   {len(bundle.get('attachments', []))} attached")

    if args.show:
        import win32com.client
        outlook = win32com.client.Dispatch("Outlook.Application")
        ns = outlook.GetNamespace("MAPI")
        item = ns.GetItemFromID(entry_id)
        item.Display(False)


if __name__ == "__main__":
    main()
