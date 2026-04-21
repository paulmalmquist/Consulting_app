from pathlib import Path

from scripts.outlook_assistant.config import load_config


def test_load_config_supports_json_yaml_superset(tmp_path: Path):
    config_path = tmp_path / "config.yaml"
    config_path.write_text(
        '{'
        '"default_account":"Work",'
        '"approval_mode":true,'
        '"default_archive_folder":"Low Value",'
        '"summary_folders":["Inbox"],'
        '"newsletter_senders":["news@"],'
        '"automated_subject_keywords":["alert"],'
        '"important_sender_allowlist":[],'
        '"attachment_save_dir":"attachments",'
        '"log_file":"logs/actions.jsonl",'
        '"pending_actions_file":"runtime/pending_actions.json",'
        '"reply_signature":"Best,\\nPaul",'
        '"lead_groups":{"test_group":{"folders":["Inbox"],"sender_domains":["@example.com"],"contacts":[{"name":"Jane Smith","email":"jane@example.com","company":"Example Co","title":"CFO"}]}}'
        '}',
        encoding="utf-8",
    )
    config = load_config(str(config_path))
    assert config.default_account == "Work"
    assert config.approval_mode is True
    assert config.reply_signature == "Best,\nPaul"
    assert "test_group" in config.lead_groups
    assert config.lead_groups["test_group"].contacts[0].email == "jane@example.com"
