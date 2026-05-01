"""Manage Microsoft Graph subscriptions for the Novendor outreach mailbox."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.config import NOVENDOR_OUTREACH_MAILBOX  # noqa: E402
from app.services import msgraph_email_sync  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create or renew Novendor Microsoft Graph mail subscriptions.")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create", help="Create a mailbox subscription and persist it.")
    create.add_argument("--mailbox", default=NOVENDOR_OUTREACH_MAILBOX)
    create.add_argument("--resource", default=None, help="Override Graph resource path.")

    renew = sub.add_parser("renew", help="Renew an existing subscription id.")
    renew.add_argument("--subscription-id", required=True)

    args = parser.parse_args(argv)
    if args.command == "create":
        result = msgraph_email_sync.create_subscription(mailbox=args.mailbox, resource=args.resource)
    elif args.command == "renew":
        result = msgraph_email_sync.renew_subscription(args.subscription_id)
    else:
        raise AssertionError(args.command)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
