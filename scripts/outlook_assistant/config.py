"""Config loading for the Outlook Assistant."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .errors import ConfigError
from .models import AppConfig, LeadContact, LeadGroup

PACKAGE_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = PACKAGE_DIR / "config.yaml"
DEFAULT_DOTENV_PATH = PACKAGE_DIR / ".env"


DEFAULT_CONFIG_DATA: dict[str, Any] = {
    "default_account": "Work",
    "outbound_account": "info@novendor.ai",
    "approval_mode": True,
    "default_archive_folder": "Low Value",
    "summary_folders": ["Inbox", "Important"],
    "newsletter_senders": ["news@", "updates@"],
    "automated_subject_keywords": ["alert", "notification", "digest"],
    "important_sender_allowlist": [],
    "attachment_save_dir": "~/Downloads/outlook_attachments",
    "log_file": "scripts/outlook_assistant/logs/actions.jsonl",
    "pending_actions_file": "scripts/outlook_assistant/runtime/pending_actions.json",
    "reply_signature": "Best,\nPaul",
    "lead_groups": {},
}


def _decode_scalar(value: str) -> Any:
    trimmed = value.strip()
    if trimmed.lower() in {"true", "false"}:
        return trimmed.lower() == "true"
    if trimmed.lower() in {"null", "none"}:
        return None
    if trimmed.startswith('"') and trimmed.endswith('"'):
        inner = trimmed[1:-1]
        return bytes(inner, "utf-8").decode("unicode_escape")
    if trimmed.startswith("'") and trimmed.endswith("'"):
        return trimmed[1:-1]
    if trimmed.isdigit():
        return int(trimmed)
    return trimmed


def _parse_simple_yaml(text: str) -> dict[str, Any]:
    data: dict[str, Any] = {}
    current_list_key: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- "):
            if current_list_key is None:
                raise ConfigError("List item encountered before a key in config.yaml")
            data.setdefault(current_list_key, []).append(_decode_scalar(stripped[2:]))
            continue
        current_list_key = None
        if ":" not in stripped:
            raise ConfigError(f"Malformed config line: {raw_line}")
        key, raw_value = stripped.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if not value:
            data[key] = []
            current_list_key = key
        else:
            data[key] = _decode_scalar(value)
    return data


def _parse_config_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    try:
        loaded = json.loads(text)
        if not isinstance(loaded, dict):
            raise ConfigError(f"{path} must contain an object at the top level")
        return loaded
    except json.JSONDecodeError:
        try:
            import yaml  # type: ignore
        except ImportError:
            return _parse_simple_yaml(text)
        loaded = yaml.safe_load(text)
        if loaded is None:
            return {}
        if not isinstance(loaded, dict):
            raise ConfigError(f"{path} must contain a mapping at the top level")
        return dict(loaded)


def _load_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ConfigError(f"Malformed dotenv line in {path}: {raw_line}")
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        out[key.strip()] = bytes(value, "utf-8").decode("unicode_escape")
    return out


def _overlay_env(config: dict[str, Any], dotenv: dict[str, str]) -> dict[str, Any]:
    result = dict(config)
    mapping = {
        "OUTLOOK_ASSISTANT_DEFAULT_ACCOUNT": "default_account",
        "OUTLOOK_ASSISTANT_APPROVAL_MODE": "approval_mode",
        "OUTLOOK_ASSISTANT_ARCHIVE_FOLDER": "default_archive_folder",
        "OUTLOOK_ASSISTANT_ATTACHMENT_SAVE_DIR": "attachment_save_dir",
        "OUTLOOK_ASSISTANT_LOG_FILE": "log_file",
        "OUTLOOK_ASSISTANT_PENDING_ACTIONS_FILE": "pending_actions_file",
        "OUTLOOK_ASSISTANT_REPLY_SIGNATURE": "reply_signature",
    }
    for env_key, config_key in mapping.items():
        if env_key in dotenv:
            result[config_key] = _decode_scalar(dotenv[env_key])
    return result


def _resolve_path(value: str, base_dir: Path) -> str:
    expanded = Path(os.path.expanduser(value))
    if expanded.is_absolute():
        return str(expanded)
    return str((base_dir / expanded).resolve())


def _ensure_parent(path_str: str) -> None:
    Path(path_str).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)


def load_config(config_path: str | None = None) -> AppConfig:
    path = Path(config_path).resolve() if config_path else DEFAULT_CONFIG_PATH
    if not path.exists():
        raise ConfigError(f"Config file not found: {path}")
    raw = dict(DEFAULT_CONFIG_DATA)
    raw.update(_parse_config_file(path))
    dotenv = _load_dotenv(DEFAULT_DOTENV_PATH)
    raw = _overlay_env(raw, dotenv)
    base_dir = Path.cwd()

    try:
        config = AppConfig(
            default_account=str(raw["default_account"]),
            outbound_account=str(raw.get("outbound_account", raw["default_account"])),
            approval_mode=bool(raw["approval_mode"]),
            default_archive_folder=str(raw["default_archive_folder"]),
            summary_folders=[str(item) for item in raw["summary_folders"]],
            newsletter_senders=[str(item).lower() for item in raw["newsletter_senders"]],
            automated_subject_keywords=[
                str(item).lower() for item in raw["automated_subject_keywords"]
            ],
            important_sender_allowlist=[
                str(item).lower() for item in raw["important_sender_allowlist"]
            ],
            attachment_save_dir=_resolve_path(str(raw["attachment_save_dir"]), base_dir),
            log_file=_resolve_path(str(raw["log_file"]), base_dir),
            pending_actions_file=_resolve_path(str(raw["pending_actions_file"]), base_dir),
            reply_signature=str(raw["reply_signature"]),
            lead_groups={
                str(group_name): LeadGroup(
                    folders=[str(item) for item in group_value.get("folders", [])],
                    sender_domains=[
                        str(item).lower() for item in group_value.get("sender_domains", [])
                    ],
                    contacts=[
                        LeadContact(
                            name=str(contact.get("name", "")),
                            email=str(contact["email"]),
                            company=str(contact["company"]) if contact.get("company") is not None else None,
                            title=str(contact["title"]) if contact.get("title") is not None else None,
                        )
                        for contact in group_value.get("contacts", [])
                    ],
                )
                for group_name, group_value in dict(raw.get("lead_groups", {})).items()
            },
        )
    except KeyError as exc:
        raise ConfigError(f"Missing required config key: {exc}") from exc

    _ensure_parent(config.log_file)
    _ensure_parent(config.pending_actions_file)
    return config
