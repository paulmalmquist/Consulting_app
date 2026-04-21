"""High-level workflows used by the CLI."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from .approvals import clear_pending_actions, confirm_batch, extend_pending_actions, load_pending_actions
from .classifier import classify_message
from .drafting import draft_reply_candidates
from .logging_utils import log_event, utc_now_iso
from .models import AppConfig, ClassificationResult, DraftRequest, MessageRecord, PendingAction, SearchFilters
from .outlook_client import OutlookClient


def load_messages_for_summary(
    client: OutlookClient,
    *,
    config: AppConfig,
    account: str | None = None,
    folders: list[str] | None = None,
    include_body: bool = True,
    since: str | None = None,
    until: str | None = None,
) -> list[MessageRecord]:
    filters = SearchFilters(
        account=account,
        folders=folders or config.summary_folders,
        since=since,
        until=until,
        include_body=include_body,
    )
    return client.search_messages(filters)


def classify_messages(messages: list[MessageRecord], config: AppConfig) -> dict[str, ClassificationResult]:
    return {message.ref.message_id: classify_message(message, config) for message in messages}


def prepare_reply_drafts(
    client: OutlookClient,
    *,
    config: AppConfig,
    messages: list[MessageRecord],
    instructions: str | None = None,
    dry_run: bool = False,
    account: str | None = None,
) -> list[DraftRequest]:
    drafts = draft_reply_candidates(messages, config, instructions=instructions)
    if dry_run:
        for draft in drafts:
            log_event(
                config,
                action="draft_reply",
                target=draft.ref,
                result="dry_run",
                details=draft.to_dict(),
            )
        return drafts

    for draft in drafts:
        result = client.create_draft(draft=draft, account=account)
        log_event(
            config,
            action="draft_reply",
            target=draft.ref,
            result="ok",
            details={"outlook_result": result, **draft.to_dict()},
        )
    return drafts


def stage_newsletter_moves(
    *,
    config: AppConfig,
    messages: list[MessageRecord],
    classifications: dict[str, ClassificationResult],
    destination_folder: str,
    dry_run: bool = False,
) -> list[PendingAction]:
    actions: list[PendingAction] = []
    for message in messages:
        classification = classifications[message.ref.message_id]
        if classification.label not in {"newsletter", "automated_alert"}:
            continue
        actions.append(
            PendingAction(
                action_type="move_message",
                message=message.ref,
                summary=f"Move '{message.subject or '(no subject)'}' to {destination_folder}",
                parameters={"destination_folder": destination_folder, "classification": classification.label},
                staged_at=utc_now_iso(),
                risky=True,
            )
        )
    if not dry_run and actions:
        extend_pending_actions(config, actions)
    return actions


def maybe_execute_staged_actions(
    *,
    client: OutlookClient,
    config: AppConfig,
    actions: list[PendingAction],
    dry_run: bool = False,
    force_without_approval: bool = False,
) -> list[str]:
    if not actions:
        return []
    if dry_run:
        for action in actions:
            log_event(config, action=action.action_type, target=action.message, result="dry_run", details=action.to_dict())
        return ["dry_run" for _ in actions]

    if not force_without_approval and config.approval_mode:
        if not confirm_batch(actions):
            return []

    results: list[str] = []
    remaining = load_pending_actions(config)
    remaining_keys = {(
        action.action_type,
        action.message.message_id,
        action.message.folder,
        action.message.account,
        tuple(sorted(action.parameters.items())),
    ) for action in actions}
    for action in actions:
        if action.action_type == "move_message":
            result = client.move_message(action.message, str(action.parameters["destination_folder"]))
        elif action.action_type == "mark_read_state":
            result = client.mark_read_state(action.message, unread=bool(action.parameters["unread"]))
        elif action.action_type == "set_category":
            result = client.set_category(
                action.message,
                category=str(action.parameters["category"]),
                remove=bool(action.parameters.get("remove", False)),
            )
        elif action.action_type == "set_flag":
            result = client.set_flag(action.message, flagged=bool(action.parameters["flagged"]))
        else:
            raise ValueError(f"Unsupported action type: {action.action_type}")
        log_event(config, action=action.action_type, target=action.message, result="ok", details={**action.to_dict(), "outlook_result": result})
        results.append(result)

    survivors: list[PendingAction] = []
    for action in remaining:
        key = (
            action.action_type,
            action.message.message_id,
            action.message.folder,
            action.message.account,
            tuple(sorted(action.parameters.items())),
        )
        if key not in remaining_keys:
            survivors.append(action)
    if remaining or actions:
        if survivors:
            from .approvals import save_pending_actions

            save_pending_actions(config, survivors)
        else:
            clear_pending_actions(config)
    return results


def save_matching_attachments(
    client: OutlookClient,
    *,
    config: AppConfig,
    messages: list[MessageRecord],
    destination_dir: str,
    dry_run: bool = False,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    if not dry_run:
        Path(destination_dir).mkdir(parents=True, exist_ok=True)
    for message in messages:
        if not message.has_attachments:
            continue
        if dry_run:
            record = {
                "message_id": message.ref.message_id,
                "subject": message.subject,
                "attachments": list(message.attachment_names),
                "destination_dir": destination_dir,
            }
            results.append(record)
            log_event(config, action="save_attachments", target=message.ref, result="dry_run", details=record)
            continue
        saved = client.save_attachments(message.ref, destination_dir)
        record = {
            "message_id": message.ref.message_id,
            "subject": message.subject,
            "saved": [asdict(item) for item in saved],
        }
        results.append(record)
        log_event(config, action="save_attachments", target=message.ref, result="ok", details=record)
    return results
