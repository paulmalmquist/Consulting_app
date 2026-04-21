"""CLI entry point for the Outlook Assistant."""

from __future__ import annotations

import argparse
import json

from .actions import (
    classify_messages,
    load_messages_for_summary,
    maybe_execute_staged_actions,
    prepare_reply_drafts,
    save_matching_attachments,
    stage_newsletter_moves,
)
from .approvals import clear_pending_actions, load_pending_actions, render_actions_table
from .config import DEFAULT_CONFIG_PATH, load_config
from .errors import OutlookAssistantError
from .drafting import build_outbound_body, build_outbound_subject
from .logging_utils import log_event
from .models import SearchFilters
from .outlook_client import OutlookClient
from .summarizer import morning_briefing, summarize_inbox
from scripts.novendor_outreach.outlook import NewDraft, OutlookClient as DraftOutlookClient


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Path to config.yaml")
    common.add_argument("--dry-run", action="store_true", help="Show what would happen without mutating Outlook")
    common.add_argument(
        "--approval-mode",
        choices=("on", "off"),
        default=None,
        help="Override approval mode from config for this command",
    )
    common.add_argument("--account", help="Outlook account display name")
    common.add_argument("--folder", action="append", help="Folder to scan. Repeat for multiple folders.")
    common.add_argument("--json", action="store_true", help="Emit JSON instead of plain text where supported")
    common.add_argument("--since", help="Lower bound ISO timestamp filter")
    common.add_argument("--until", help="Upper bound ISO timestamp filter")
    common.add_argument("--lead-group", help="Named lead group from config.yaml")

    parser = argparse.ArgumentParser(
        prog="outlook_assistant",
        description="Local Outlook for Mac automation assistant for Legacy Outlook.",
        parents=[common],
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("summarize-inbox", help="Summarize inbox and configured folders", parents=[common])
    subparsers.add_parser("morning-briefing", help="Produce a plain-English morning briefing", parents=[common])

    draft_parser = subparsers.add_parser("draft-replies", help="Create draft reply candidates", parents=[common])
    draft_parser.add_argument("--instructions", help="Optional drafting instructions to fold into the reply body")

    outreach_parser = subparsers.add_parser(
        "draft-lead-outreach",
        help="Create outbound drafts for contacts in a configured lead group",
        parents=[common],
    )
    outreach_parser.add_argument("--instructions", help="Optional custom outreach paragraph")
    outreach_parser.add_argument("--limit", type=int, default=None, help="Maximum contacts to draft")

    move_parser = subparsers.add_parser("move-newsletters", help="Stage or execute moves for low-value mail", parents=[common])
    move_parser.add_argument("--destination-folder", help="Override destination folder for newsletter moves")

    save_parser = subparsers.add_parser("save-attachments", help="Save attachments from matching messages", parents=[common])
    save_parser.add_argument("--destination-dir", help="Where to save attachments")
    save_parser.add_argument("--sender", help="Filter by sender text")
    save_parser.add_argument("--subject", help="Filter by subject text")
    save_parser.add_argument("--keyword", help="Filter by keyword text")
    save_parser.add_argument("--unread-only", action="store_true", help="Only match unread messages")

    search_parser = subparsers.add_parser("search-mail", help="Search Outlook mail", parents=[common])
    search_parser.add_argument("--sender", help="Filter by sender text")
    search_parser.add_argument("--subject", help="Filter by subject text")
    search_parser.add_argument("--keyword", help="Filter by keyword text")
    search_parser.add_argument("--unread-only", action="store_true", help="Only match unread messages")
    search_parser.add_argument("--has-attachments", action="store_true", help="Only match messages with attachments")
    search_parser.add_argument("--include-body", action="store_true", help="Include full body text in search output")
    search_parser.add_argument("--limit", type=int, default=50, help="Maximum messages to return")

    subparsers.add_parser("review-pending", help="Show queued risky actions", parents=[common])
    approve_parser = subparsers.add_parser("approve-pending", help="Execute queued risky actions", parents=[common])
    approve_parser.add_argument("--force", action="store_true", help="Execute without interactive confirmation")
    subparsers.add_parser("discard-pending", help="Clear queued risky actions", parents=[common])
    return parser


def _apply_runtime_config(config, args):
    if args.approval_mode:
        config = type(config)(**{**config.to_dict(), "approval_mode": args.approval_mode == "on"})
    return config


def _lead_group(config, group_name):
    if not group_name:
        return None
    group = config.lead_groups.get(group_name)
    if group is None:
        known = ", ".join(sorted(config.lead_groups.keys())) or "(none configured)"
        raise OutlookAssistantError(f"Unknown lead group '{group_name}'. Known groups: {known}")
    return group


def _json_dump(payload) -> str:
    return json.dumps(payload, indent=2, sort_keys=True)


def _print_messages_json(messages, classifications=None):
    payload = []
    for message in messages:
        record = message.to_dict()
        if classifications:
            record["classification"] = classifications[message.ref.message_id].to_dict()
        payload.append(record)
    print(_json_dump(payload))


def cmd_summarize(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    messages = load_messages_for_summary(
        client,
        config=config,
        account=args.account,
        folders=args.folder or (group.folders if group else None),
        since=args.since,
        until=args.until,
    )
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    classifications = classify_messages(messages, config)
    if args.json:
        _print_messages_json(messages, classifications)
    else:
        print(summarize_inbox(messages, classifications))
    return 0


def cmd_morning_briefing(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    messages = load_messages_for_summary(
        client,
        config=config,
        account=args.account,
        folders=args.folder or (group.folders if group else None),
        since=args.since,
        until=args.until,
    )
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    classifications = classify_messages(messages, config)
    drafts = prepare_reply_drafts(
        client,
        config=config,
        messages=messages,
        instructions=None,
        dry_run=True,
        account=args.account,
    )
    pending = load_pending_actions(config)
    if args.json:
        print(
            _json_dump(
                {
                    "messages": [message.to_dict() for message in messages],
                    "classifications": {
                        key: value.to_dict() for key, value in classifications.items()
                    },
                    "drafts": [draft.to_dict() for draft in drafts],
                    "pending_actions": [action.to_dict() for action in pending],
                }
            )
        )
    else:
        print(morning_briefing(messages, classifications, pending_actions=pending, draft_requests=drafts))
    return 0


def cmd_draft_replies(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    messages = load_messages_for_summary(
        client,
        config=config,
        account=args.account,
        folders=args.folder or (group.folders if group else None),
        since=args.since,
        until=args.until,
    )
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    drafts = prepare_reply_drafts(
        client,
        config=config,
        messages=messages,
        instructions=args.instructions,
        dry_run=args.dry_run,
        account=args.account,
    )
    if args.json:
        print(_json_dump([draft.to_dict() for draft in drafts]))
    else:
        if not drafts:
            print("No reply-needed messages matched the v1 heuristics.")
        else:
            for draft in drafts:
                print(f"- {draft.subject} -> {', '.join(draft.to) or '(no recipients)'}")
    return 0


def cmd_draft_lead_outreach(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    if group is None or not group.contacts:
        raise OutlookAssistantError("draft-lead-outreach requires --lead-group with configured contacts")
    contacts = group.contacts[: args.limit] if args.limit else group.contacts
    payload = []
    if args.dry_run:
        for contact in contacts:
            entry = {
                "name": contact.name,
                "email": contact.email,
                "company": contact.company,
                "title": contact.title,
                "subject": build_outbound_subject(contact),
                "body": build_outbound_body(contact, config, instructions=args.instructions),
            }
            payload.append(entry)
            log_event(
                config,
                action="draft_lead_outreach",
                target=None,
                result="dry_run",
                details=entry,
            )
        print(_json_dump(payload) if args.json else "\n".join(f"- {item['subject']} -> {item['email']}" for item in payload))
        return 0

    draft_client = DraftOutlookClient(
        default_account_name=args.account or config.outbound_account,
        require_account_match=False,
    )
    for contact in contacts:
        subject = build_outbound_subject(contact)
        body = build_outbound_body(contact, config, instructions=args.instructions)
        result = draft_client.create_draft(
            NewDraft(
                subject=subject,
                body=body,
                to=contact.email,
                to_name=contact.name,
                account_name=args.account or config.outbound_account,
            )
        )
        entry = {
            "name": contact.name,
            "email": contact.email,
            "company": contact.company,
            "title": contact.title,
            "subject": subject,
            "draft_id": result.id,
            "account_name": result.account_name,
        }
        payload.append(entry)
        log_event(
            config,
            action="draft_lead_outreach",
            target=None,
            result="ok",
            details=entry,
        )
    print(_json_dump(payload) if args.json else "\n".join(f"- {item['subject']} -> {item['email']} (id: {item['draft_id']})" for item in payload))
    return 0


def cmd_move_newsletters(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    messages = load_messages_for_summary(
        client,
        config=config,
        account=args.account,
        folders=args.folder or (group.folders if group else None),
        since=args.since,
        until=args.until,
    )
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    classifications = classify_messages(messages, config)
    actions = stage_newsletter_moves(
        config=config,
        messages=messages,
        classifications=classifications,
        destination_folder=args.destination_folder or config.default_archive_folder,
        dry_run=args.dry_run,
    )
    if args.json:
        print(_json_dump([action.to_dict() for action in actions]))
    else:
        print(render_actions_table(actions))
    if args.dry_run or not actions:
        return 0
    if config.approval_mode:
        maybe_execute_staged_actions(client=client, config=config, actions=actions, dry_run=False)
    else:
        maybe_execute_staged_actions(
            client=client,
            config=config,
            actions=actions,
            dry_run=False,
            force_without_approval=True,
        )
    return 0


def cmd_save_attachments(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    filters = SearchFilters(
        account=args.account,
        folders=args.folder or (group.folders if group else config.summary_folders),
        sender_contains=args.sender,
        subject_contains=args.subject,
        keyword=args.keyword,
        since=args.since,
        until=args.until,
        unread_only=args.unread_only,
        has_attachments=True,
        include_body=False,
    )
    messages = client.search_messages(filters)
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    results = save_matching_attachments(
        client,
        config=config,
        messages=messages,
        destination_dir=args.destination_dir or config.attachment_save_dir,
        dry_run=args.dry_run,
    )
    print(_json_dump(results) if args.json else f"Processed {len(results)} attachment save candidate(s).")
    return 0


def cmd_search(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    group = _lead_group(config, args.lead_group)
    client = OutlookClient(default_account=args.account or config.default_account)
    filters = SearchFilters(
        account=args.account,
        folders=args.folder or (group.folders if group else config.summary_folders),
        sender_contains=args.sender,
        subject_contains=args.subject,
        keyword=args.keyword,
        since=args.since,
        until=args.until,
        unread_only=args.unread_only,
        has_attachments=True if args.has_attachments else None,
        limit=args.limit,
        include_body=args.include_body,
    )
    messages = client.search_messages(filters)
    if group and group.sender_domains:
        messages = [
            message
            for message in messages
            if any(domain in message.sender.lower() for domain in group.sender_domains)
        ]
    if args.json:
        _print_messages_json(messages)
    else:
        for message in messages:
            print(f"- {message.received_at} | {message.sender} | {message.subject} | {message.folder}")
    return 0


def cmd_review_pending(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    actions = load_pending_actions(config)
    print(_json_dump([action.to_dict() for action in actions]) if args.json else render_actions_table(actions))
    return 0


def cmd_approve_pending(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    client = OutlookClient(default_account=args.account or config.default_account)
    actions = load_pending_actions(config)
    if not actions:
        print("No pending actions.")
        return 0
    maybe_execute_staged_actions(
        client=client,
        config=config,
        actions=actions,
        dry_run=args.dry_run,
        force_without_approval=args.force or not config.approval_mode,
    )
    print("Pending actions processed.")
    return 0


def cmd_discard_pending(args) -> int:
    config = _apply_runtime_config(load_config(args.config), args)
    count = len(load_pending_actions(config))
    clear_pending_actions(config)
    log_event(config, action="discard_pending", target=None, result="ok", details={"discarded": count})
    print(f"Discarded {count} pending action(s).")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    command_map = {
        "summarize-inbox": cmd_summarize,
        "morning-briefing": cmd_morning_briefing,
        "draft-replies": cmd_draft_replies,
        "draft-lead-outreach": cmd_draft_lead_outreach,
        "move-newsletters": cmd_move_newsletters,
        "save-attachments": cmd_save_attachments,
        "search-mail": cmd_search,
        "review-pending": cmd_review_pending,
        "approve-pending": cmd_approve_pending,
        "discard-pending": cmd_discard_pending,
    }
    try:
        return command_map[args.command](args)
    except OutlookAssistantError as exc:
        print(f"[error] {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
