"""Plain-English summaries."""

from __future__ import annotations

from collections import Counter

from .models import ClassificationResult, DraftRequest, MessageRecord, PendingAction


def _message_line(message: MessageRecord, classification: ClassificationResult | None = None) -> str:
    prefix = f"[{classification.label}] " if classification else ""
    unread = "unread" if message.unread else "read"
    return f"- {prefix}{message.subject or '(no subject)'} from {message.sender or 'unknown'} ({unread}, {message.folder})"


def summarize_inbox(
    messages: list[MessageRecord],
    classifications: dict[str, ClassificationResult],
    pending_actions: list[PendingAction] | None = None,
    draft_requests: list[DraftRequest] | None = None,
) -> str:
    pending_actions = pending_actions or []
    draft_requests = draft_requests or []
    counts = Counter(classification.label for classification in classifications.values())
    lines = []
    lines.append("Inbox summary")
    lines.append("")
    lines.append(
        f"Scanned {len(messages)} messages: "
        f"{counts.get('important_human', 0)} important human, "
        f"{counts.get('newsletter', 0)} newsletters, "
        f"{counts.get('automated_alert', 0)} automated alerts, "
        f"{counts.get('other', 0)} other."
    )
    if draft_requests:
        lines.append(f"Prepared {len(draft_requests)} draft reply candidate(s).")
    if pending_actions:
        lines.append(f"Staged {len(pending_actions)} pending action(s).")
    lines.append("")

    important_messages = [
        message for message in messages if classifications[message.ref.message_id].label == "important_human"
    ]
    if important_messages:
        lines.append("Likely important")
        for message in important_messages[:10]:
            lines.append(_message_line(message, classifications[message.ref.message_id]))
        lines.append("")

    low_value = [
        message
        for message in messages
        if classifications[message.ref.message_id].label in {"newsletter", "automated_alert"}
    ]
    if low_value:
        lines.append("Low-value candidates")
        for message in low_value[:10]:
            lines.append(_message_line(message, classifications[message.ref.message_id]))
        lines.append("")

    return "\n".join(lines).strip()


def morning_briefing(
    messages: list[MessageRecord],
    classifications: dict[str, ClassificationResult],
    pending_actions: list[PendingAction] | None = None,
    draft_requests: list[DraftRequest] | None = None,
) -> str:
    pending_actions = pending_actions or []
    draft_requests = draft_requests or []
    lines = []
    lines.append("Morning briefing")
    lines.append("")

    important_unread = [
        message
        for message in messages
        if message.unread and classifications[message.ref.message_id].label == "important_human"
    ]
    if important_unread:
        lines.append("Unread messages that look human and important:")
        for message in important_unread[:8]:
            lines.append(_message_line(message, classifications[message.ref.message_id]))
    else:
        lines.append("No unread human-priority messages matched the v1 heuristics.")
    lines.append("")

    if draft_requests:
        lines.append("Draft replies suggested:")
        for draft in draft_requests[:8]:
            lines.append(f"- {draft.subject} -> {', '.join(draft.to) or '(no recipients)'}")
        lines.append("")

    low_value = [
        message
        for message in messages
        if classifications[message.ref.message_id].label in {"newsletter", "automated_alert"}
    ]
    if low_value:
        lines.append("Messages that look safe to archive or move:")
        for message in low_value[:8]:
            lines.append(_message_line(message, classifications[message.ref.message_id]))
        lines.append("")

    if pending_actions:
        lines.append("Pending actions already staged:")
        for action in pending_actions[:8]:
            lines.append(f"- {action.action_type}: {action.summary}")
        lines.append("")

    return "\n".join(lines).strip()
