from pathlib import Path

from scripts.outlook_assistant.approvals import load_pending_actions, save_pending_actions
from scripts.outlook_assistant.models import AppConfig, MessageRef, PendingAction


def make_config(tmp_path: Path) -> AppConfig:
    return AppConfig(
        default_account="Work",
        outbound_account="info@novendor.ai",
        approval_mode=True,
        default_archive_folder="Low Value",
        summary_folders=["Inbox"],
        newsletter_senders=[],
        automated_subject_keywords=[],
        important_sender_allowlist=[],
        attachment_save_dir=str(tmp_path / "attachments"),
        log_file=str(tmp_path / "actions.jsonl"),
        pending_actions_file=str(tmp_path / "pending.json"),
        reply_signature="Best,\nPaul",
        lead_groups={},
    )


def test_pending_actions_round_trip(tmp_path: Path):
    config = make_config(tmp_path)
    action = PendingAction(
        action_type="move_message",
        message=MessageRef(message_id="abc", folder="Inbox", account="Work"),
        summary="Move one message",
        parameters={"destination_folder": "Low Value"},
        staged_at="2026-04-21T10:00:00Z",
    )
    save_pending_actions(config, [action])
    loaded = load_pending_actions(config)
    assert len(loaded) == 1
    assert loaded[0].message.message_id == "abc"
    assert loaded[0].parameters["destination_folder"] == "Low Value"
