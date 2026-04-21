from scripts.outlook_assistant.classifier import classify_message
from scripts.outlook_assistant.models import AppConfig, MessageRecord, MessageRef


def make_config() -> AppConfig:
    return AppConfig(
        default_account="Work",
        outbound_account="info@novendor.ai",
        approval_mode=True,
        default_archive_folder="Low Value",
        summary_folders=["Inbox"],
        newsletter_senders=["news@", "updates@"],
        automated_subject_keywords=["alert", "notification", "digest"],
        important_sender_allowlist=[],
        attachment_save_dir="/tmp/attachments",
        log_file="/tmp/actions.jsonl",
        pending_actions_file="/tmp/pending.json",
        reply_signature="Best,\nPaul",
        lead_groups={},
    )


def make_message(
    *,
    sender: str,
    subject: str,
    unread: bool = True,
    recipients: list[str] | None = None,
    body_preview: str = "",
) -> MessageRecord:
    return MessageRecord(
        ref=MessageRef(message_id="1", folder="Inbox", account="Work"),
        sender=sender,
        recipients=recipients or ["paul@example.com"],
        cc=[],
        subject=subject,
        received_at="2026-04-21T09:00:00",
        body_preview=body_preview,
        body=None,
        unread=unread,
        categories=[],
        flagged=False,
        has_attachments=False,
        attachment_names=[],
    )


def test_newsletter_sender_wins():
    classification = classify_message(
        make_message(sender="news@vendor.com", subject="Weekly update"),
        make_config(),
    )
    assert classification.label == "newsletter"


def test_automated_alert_detected():
    classification = classify_message(
        make_message(sender="no-reply@system.com", subject="Security alert"),
        make_config(),
    )
    assert classification.label == "automated_alert"


def test_important_human_detected_with_reply_signal():
    classification = classify_message(
        make_message(
            sender="Jane Doe <jane@example.com>",
            subject="Can you review this?",
            body_preview="Can you take a look today?",
        ),
        make_config(),
    )
    assert classification.label == "important_human"
    assert classification.likely_reply_needed is True
