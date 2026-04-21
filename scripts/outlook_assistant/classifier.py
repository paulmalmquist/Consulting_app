"""Deterministic inbox triage heuristics."""

from __future__ import annotations

import re

from .models import AppConfig, ClassificationResult, MessageRecord

AUTOMATED_SENDER_HINTS = (
    "no-reply",
    "noreply",
    "do-not-reply",
    "donotreply",
    "mailer-daemon",
    "notifications@",
)
NEWSLETTER_SUBJECT_HINTS = (
    "newsletter",
    "digest",
    "weekly update",
    "daily update",
    "unsubscribe",
)
REQUEST_PATTERNS = (
    r"\?",
    r"\bcan you\b",
    r"\bcould you\b",
    r"\bplease\b",
    r"\bneed your\b",
    r"\blet me know\b",
    r"\bwhat do you think\b",
    r"\bwhen can\b",
)


def _sender_text(message: MessageRecord) -> str:
    return (message.sender or "").lower()


def _subject_text(message: MessageRecord) -> str:
    return (message.subject or "").lower()


def _body_text(message: MessageRecord) -> str:
    return (message.body or message.body_preview or "").lower()


def looks_newsletter(message: MessageRecord, config: AppConfig) -> tuple[bool, str]:
    sender = _sender_text(message)
    subject = _subject_text(message)
    for marker in config.newsletter_senders:
        if marker and marker in sender:
            return True, f"sender matched newsletter pattern '{marker}'"
    for marker in NEWSLETTER_SUBJECT_HINTS:
        if marker in subject:
            return True, f"subject matched newsletter marker '{marker}'"
    return False, ""


def looks_automated(message: MessageRecord, config: AppConfig) -> tuple[bool, str]:
    sender = _sender_text(message)
    subject = _subject_text(message)
    body = _body_text(message)
    for marker in AUTOMATED_SENDER_HINTS:
        if marker in sender:
            return True, f"sender matched automated marker '{marker}'"
    for marker in config.automated_subject_keywords:
        if marker and (marker in subject or marker in body):
            return True, f"keyword matched automated marker '{marker}'"
    return False, ""


def likely_reply_needed(message: MessageRecord) -> bool:
    if not message.unread:
        return False
    haystack = f"{message.subject}\n{message.body_preview}\n{message.body or ''}".lower()
    return any(re.search(pattern, haystack) for pattern in REQUEST_PATTERNS)


def classify_message(message: MessageRecord, config: AppConfig) -> ClassificationResult:
    newsletter, reason = looks_newsletter(message, config)
    if newsletter:
        return ClassificationResult("newsletter", reason, False)

    automated, reason = looks_automated(message, config)
    if automated:
        return ClassificationResult("automated_alert", reason, False)

    sender = _sender_text(message)
    if sender in config.important_sender_allowlist:
        return ClassificationResult("important_human", "sender allowlisted", likely_reply_needed(message))

    direct_recipient = len(message.recipients) <= 3
    if message.unread and direct_recipient:
        return ClassificationResult(
            "important_human",
            "unread and addressed to a small recipient group",
            likely_reply_needed(message),
        )

    return ClassificationResult("other", "did not match priority heuristics", False)
