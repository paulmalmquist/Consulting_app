"""Read Outlook classic messages via COM and emit provider JSON.

This is a read-only backfill helper. It never sends, moves, labels, or deletes
mail. Requires Windows Outlook classic plus pywin32.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone


def _mail_ts(item) -> str:
    value = getattr(item, "SentOn", None) or getattr(item, "ReceivedTime", None)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value or "")


def _sender(item) -> str:
    address = getattr(item, "SenderEmailAddress", "") or ""
    name = getattr(item, "SenderName", "") or ""
    return f"{name} <{address}>" if name and address else address or name


def _recipients(item, recipient_type: int) -> list[str]:
    out = []
    try:
        recipients = item.Recipients
        for i in range(1, recipients.Count + 1):
            rec = recipients.Item(i)
            if int(getattr(rec, "Type", 0)) != recipient_type:
                continue
            address = getattr(rec, "Address", "") or ""
            name = getattr(rec, "Name", "") or ""
            out.append(f"{name} <{address}>" if name and address else address or name)
    except Exception:
        return out
    return out


def _message_to_payload(item, folder_name: str) -> dict:
    attachments = []
    try:
        for i in range(1, item.Attachments.Count + 1):
            att = item.Attachments.Item(i)
            attachments.append({"filename": getattr(att, "FileName", "") or ""})
    except Exception:
        attachments = []
    return {
        "provider": "outlook_com_backfill",
        "message_id": str(getattr(item, "EntryID", "") or ""),
        "folder": folder_name,
        "from": _sender(item),
        "to": _recipients(item, 1),
        "cc": _recipients(item, 2),
        "subject": getattr(item, "Subject", "") or "",
        "body_preview": (getattr(item, "Body", "") or "")[:2000],
        "message_ts": _mail_ts(item),
        "has_attachments": bool(attachments),
        "attachments": attachments,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export Outlook classic messages as importable JSON.")
    parser.add_argument("--folder", action="append", default=["Inbox", "Sent Items"], help="Folder display name. Repeatable.")
    parser.add_argument("--query", default="hallboys", help="Case-insensitive subject/body/sender filter.")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args(argv)

    try:
        import win32com.client
    except ImportError:
        raise SystemExit("pywin32 is required for Outlook COM export: pip install pywin32")

    outlook = win32com.client.Dispatch("Outlook.Application")
    namespace = outlook.GetNamespace("MAPI")
    needle = args.query.lower()
    payloads = []
    for folder_name in args.folder:
        try:
            folder = namespace.GetDefaultFolder(6 if folder_name.lower() == "inbox" else 5)
            items = folder.Items
            items.Sort("[ReceivedTime]", True)
        except Exception as exc:
            print(f"WARN: could not read folder {folder_name!r}: {exc}", file=sys.stderr)
            continue
        for item in items:
            subject = (getattr(item, "Subject", "") or "").lower()
            body = (getattr(item, "Body", "") or "").lower()
            sender = _sender(item).lower()
            if needle not in subject and needle not in body and needle not in sender:
                continue
            payloads.append(_message_to_payload(item, folder_name))
            if len(payloads) >= args.limit:
                print(json.dumps(payloads, indent=2))
                return 0
    print(json.dumps(payloads, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
