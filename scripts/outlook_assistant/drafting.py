"""Draft generation helpers."""

from __future__ import annotations

import re

from .classifier import classify_message
from .models import AppConfig, DraftRequest, LeadContact, MessageRecord


def _display_name_from_sender(sender: str) -> str:
    if not sender:
        return "there"
    if "<" in sender:
        sender = sender.split("<", 1)[0].strip()
    sender = sender.strip().strip('"')
    return sender.split()[0] if sender else "there"


def build_reply_body(message: MessageRecord, config: AppConfig, instructions: str | None = None) -> str:
    greeting_name = _display_name_from_sender(message.sender)
    subject_context = message.subject or "your note"
    instruction_line = (
        instructions.strip()
        if instructions and instructions.strip()
        else "I got your note and will follow up with a fuller response shortly."
    )
    return (
        f"Hi {greeting_name},\n\n"
        f"Thanks for your email about \"{subject_context}.\"\n\n"
        f"{instruction_line}\n\n"
        f"{config.reply_signature}"
    )


def build_reply_subject(subject: str) -> str:
    if re.match(r"(?i)^\s*re:", subject or ""):
        return subject
    return f"Re: {subject}".strip()


def draft_reply_candidates(
    messages: list[MessageRecord],
    config: AppConfig,
    instructions: str | None = None,
) -> list[DraftRequest]:
    drafts: list[DraftRequest] = []
    for message in messages:
        classification = classify_message(message, config)
        if classification.label != "important_human" or not classification.likely_reply_needed:
            continue
        drafts.append(
            DraftRequest(
                ref=message.ref,
                to=message.recipients,
                cc=message.cc,
                subject=build_reply_subject(message.subject),
                body=build_reply_body(message, config, instructions=instructions),
            )
        )
    return drafts


def build_outbound_subject(contact: LeadContact) -> str:
    company = contact.company or "your team"
    return f"Quick question on reporting workflow at {company}"


def build_outbound_body(
    contact: LeadContact,
    config: AppConfig,
    instructions: str | None = None,
) -> str:
    first_name = (contact.name or "there").split()[0]
    company = contact.company or "your team"
    role_context = f" in your {contact.title} seat" if contact.title else ""
    custom_line = (
        instructions.strip()
        if instructions and instructions.strip()
        else (
            "We help investment and operating teams reduce the manual reconciliation "
            "and reporting work that piles up across quarterly reporting, ad hoc asks, "
            "and leadership updates."
        )
    )
    return (
        f"Hi {first_name},\n\n"
        f"I’m reaching out because teams like {company}{role_context} usually end up carrying "
        f"a lot of manual work between source systems, spreadsheets, and the final reporting layer.\n\n"
        f"{custom_line}\n\n"
        f"If it's useful, I'm happy to show you the pattern we see and where the labor usually hides.\n\n"
        f"{config.reply_signature}"
    )
