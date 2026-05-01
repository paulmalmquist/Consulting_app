"""Import normalized outreach email payloads into the Novendor CRM.

Input is a JSON array of provider payloads. Gmail connector exports, Microsoft
Graph message payloads, and `outlook_com_export.py` output are supported.

Default mode is dry-run. Pass `--apply` to write CRM rows.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from uuid import UUID


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.config import (  # noqa: E402
    NOVENDOR_OUTREACH_BUSINESS_ID,
    NOVENDOR_OUTREACH_ENV_ID,
    NOVENDOR_OUTREACH_MAILBOX,
)
from app.services.outreach_email_sync import import_email_event, normalize_provider_payload  # noqa: E402


def _load_payloads(path: str) -> list[dict]:
    if path == "-":
        data = json.load(sys.stdin)
    else:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict) and "messages" in data:
        data = data["messages"]
    if not isinstance(data, list):
        raise SystemExit("Input JSON must be a list or an object with a messages list")
    return [item for item in data if isinstance(item, dict)]


def _provider_for(payload: dict, default: str) -> str:
    if default != "auto":
        return default
    if "toRecipients" in payload or "internetMessageId" in payload:
        return "msgraph"
    return str(payload.get("provider") or "gmail")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import outreach email payloads into Novendor CRM.")
    parser.add_argument("--json-file", required=True, help="JSON file to import, or '-' for stdin.")
    parser.add_argument("--provider", default="auto", choices=("auto", "gmail", "msgraph", "outlook_com_backfill", "manual"))
    parser.add_argument("--mailbox", default=NOVENDOR_OUTREACH_MAILBOX)
    parser.add_argument("--env-id", default=NOVENDOR_OUTREACH_ENV_ID)
    parser.add_argument("--business-id", default=NOVENDOR_OUTREACH_BUSINESS_ID)
    parser.add_argument("--target-account-name", default="Hall Boys")
    parser.add_argument("--target-domain", default="hallboys.com")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--create-reply-tasks", action="store_true", help="Create execution tasks for imported inbound replies.")
    parser.add_argument("--apply", action="store_true", help="Write rows. Omit for dry-run.")
    args = parser.parse_args(argv)

    payloads = _load_payloads(args.json_file)
    if args.limit:
        payloads = payloads[: args.limit]

    events = []
    for payload in payloads:
        provider = _provider_for(payload, args.provider)
        event = normalize_provider_payload(payload, provider=provider, mailbox=args.mailbox)
        events.append(event)

    if not args.apply:
        print(json.dumps([
            {
                "provider": event.provider,
                "provider_message_id": event.provider_message_id,
                "message_ts": event.message_ts.isoformat(),
                "direction": event.direction,
                "sender": event.sender_email,
                "subject": event.subject,
                "dedupe": event.logical_dedupe_hash[:12],
            }
            for event in events
        ], indent=2))
        print(f"Dry-run only. {len(events)} candidate message(s). Pass --apply to write.")
        return 0

    business_id = UUID(str(args.business_id))
    results = []
    for event in events:
        results.append(import_email_event(
            env_id=args.env_id,
            business_id=business_id,
            event=event,
            target_account_name=args.target_account_name,
            target_domain=args.target_domain,
            create_reply_task=args.create_reply_tasks,
        ))
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
