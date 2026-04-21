import json
from pathlib import Path

from scripts.outlook_assistant.logging_utils import log_event
from scripts.outlook_assistant.models import AppConfig, MessageRef


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


def test_log_event_writes_json_line(tmp_path: Path):
    config = make_config(tmp_path)
    ref = MessageRef(message_id="42", folder="Inbox", account="Work")
    log_event(config, action="move_message", target=ref, result="ok", details={"folder": "Low Value"})
    payload = json.loads(Path(config.log_file).read_text(encoding="utf-8").splitlines()[0])
    assert payload["action"] == "move_message"
    assert payload["target"]["message_id"] == "42"
