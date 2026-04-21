"""Command-line entry for the Outlook draft engine.

Examples:
  python -m scripts.novendor_outreach.cli --all
  python -m scripts.novendor_outreach.cli --slug electra-america
  python -m scripts.novendor_outreach.cli --list
  python -m scripts.novendor_outreach.cli --accounts
  python -m scripts.novendor_outreach.cli --drafts
  python -m scripts.novendor_outreach.cli \
      --subject "Quick note" --body-file /tmp/note.txt --to name@firm.com

All commands go through OutlookClient. Nothing is ever sent.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .outlook import (
    DEFAULT_ACCOUNT_NAME,
    NewDraft,
    OutlookAccountNotFoundError,
    OutlookClient,
    OutlookError,
)
from .prospects import PROSPECT_DRAFTS


def _build_client(account_name: str, require_match: bool) -> OutlookClient:
    return OutlookClient(
        default_account_name=account_name,
        require_account_match=require_match,
    )


def _draft_from_slug(slug: str, account_name: str, to_override: str | None) -> NewDraft:
    prospect = PROSPECT_DRAFTS.get(slug)
    if prospect is None:
        known = ", ".join(sorted(PROSPECT_DRAFTS.keys()))
        raise SystemExit(f"unknown slug '{slug}'. known: {known}")
    return NewDraft(
        subject=prospect.subject,
        body=prospect.body,
        to=to_override,
        to_name=prospect.to_name,
        account_name=account_name,
    )


def _cmd_list(args: argparse.Namespace) -> int:
    for slug, draft in sorted(PROSPECT_DRAFTS.items()):
        print(f"{slug:<24s} {draft.prospect_label:<28s} -> {draft.subject}")
    return 0


def _cmd_accounts(args: argparse.Namespace) -> int:
    client = _build_client(args.account_name, args.require_account_match)
    accounts = client.list_accounts()
    if not accounts:
        print("(no accounts reported)")
        return 0
    print(f"{'Account display name':<40s} {'user_name / email'}")
    print("-" * 70)
    for a in accounts:
        print(f"{a.name:<40s} {a.email_address or ''}")
    return 0


def _cmd_drafts(args: argparse.Namespace) -> int:
    client = _build_client(args.account_name, args.require_account_match)
    scope = args.account_name if args.scope_account else None
    drafts = client.list_drafts(account_name=scope)
    if not drafts:
        print("(no drafts)")
        return 0
    print(f"{'Account':<28s} {'Subject'}")
    print("-" * 80)
    for d in drafts:
        print(f"{(d.account_name or '-'):<28s} {d.subject}")
    return 0


def _cmd_all(args: argparse.Namespace) -> int:
    client = _build_client(args.account_name, args.require_account_match)
    for slug in PROSPECT_DRAFTS:
        nd = _draft_from_slug(slug, args.account_name, args.to)
        created = client.create_draft(nd)
        print(f"[ok] {slug:<22s} -> {created.subject} (id: {created.id})")
    return 0


def _cmd_slug(args: argparse.Namespace) -> int:
    client = _build_client(args.account_name, args.require_account_match)
    nd = _draft_from_slug(args.slug, args.account_name, args.to)
    created = client.create_draft(nd)
    print(f"[ok] {args.slug:<22s} -> {created.subject} (id: {created.id})")
    return 0


def _cmd_freeform(args: argparse.Namespace) -> int:
    if not args.subject:
        raise SystemExit("--subject is required for freeform drafts")
    if args.body_file:
        body = Path(args.body_file).read_text(encoding="utf-8")
    elif args.body:
        body = args.body
    else:
        body = sys.stdin.read()
    if not body.strip():
        raise SystemExit("draft body is empty")

    client = _build_client(args.account_name, args.require_account_match)
    nd = NewDraft(
        subject=args.subject,
        body=body,
        to=args.to,
        to_name=args.to_name,
        account_name=args.account_name,
    )
    created = client.create_draft(nd)
    print(f"[ok] freeform -> {created.subject} (id: {created.id})")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="novendor_outreach",
        description="Create prospect drafts in Outlook for Mac via OutlookClient. Never sends.",
    )
    # Actions
    parser.add_argument("--all", action="store_true", help="Create all seeded prospect drafts.")
    parser.add_argument("--slug", help="Create a single prospect draft by slug.")
    parser.add_argument("--list", action="store_true", help="List seeded prospect slugs and exit.")
    parser.add_argument("--accounts", action="store_true", help="Print the Outlook accounts the engine sees and exit.")
    parser.add_argument("--drafts", action="store_true", help="Read back drafts currently in the Drafts folder and exit.")
    parser.add_argument("--scope-account", action="store_true", help="Scope --drafts to the account named by --account-name.")

    # Freeform draft flags
    parser.add_argument("--subject", help="Subject line for a freeform draft.")
    parser.add_argument("--body", help="Body text for a freeform draft.")
    parser.add_argument("--body-file", help="Path to a UTF-8 file containing the body.")
    parser.add_argument("--to", help="Recipient email address.")
    parser.add_argument("--to-name", help="Recipient display name.")

    # Engine config
    parser.add_argument(
        "--account-name",
        default=DEFAULT_ACCOUNT_NAME,
        help=f"Outlook account display name (default: {DEFAULT_ACCOUNT_NAME}).",
    )
    parser.add_argument(
        "--allow-account-fallback",
        action="store_true",
        help="Tolerate drafts landing in a different account if the matcher misses.",
    )

    args = parser.parse_args(argv)
    args.require_account_match = not args.allow_account_fallback

    try:
        if args.list:
            return _cmd_list(args)
        if args.accounts:
            return _cmd_accounts(args)
        if args.drafts:
            return _cmd_drafts(args)
        if args.all:
            return _cmd_all(args)
        if args.slug:
            return _cmd_slug(args)
        return _cmd_freeform(args)
    except OutlookAccountNotFoundError as exc:
        print(f"[account error] {exc}", file=sys.stderr)
        return 3
    except OutlookError as exc:
        print(f"[outlook error] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
