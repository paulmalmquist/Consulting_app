"""Pending-action queue and interactive approval helpers."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .errors import PendingActionError
from .models import AppConfig, PendingAction


def load_pending_actions(config: AppConfig) -> list[PendingAction]:
    path = Path(config.pending_actions_file)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PendingActionError(
            f"Pending actions file is not valid JSON: {config.pending_actions_file}"
        ) from exc
    raw_actions = payload.get("actions", payload)
    if not isinstance(raw_actions, list):
        raise PendingActionError("Pending actions file must contain a list or an actions array")
    return [PendingAction.from_dict(item) for item in raw_actions]


def save_pending_actions(config: AppConfig, actions: list[PendingAction]) -> None:
    path = Path(config.pending_actions_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"actions": [action.to_dict() for action in actions]}, indent=2) + "\n",
        encoding="utf-8",
    )


def clear_pending_actions(config: AppConfig) -> None:
    save_pending_actions(config, [])


def extend_pending_actions(config: AppConfig, new_actions: list[PendingAction]) -> None:
    existing = load_pending_actions(config)
    save_pending_actions(config, existing + new_actions)


def render_actions_table(actions: list[PendingAction]) -> str:
    if not actions:
        return "(no pending actions)"
    lines = []
    lines.append(f"{'#':<4} {'Action':<18} {'Folder':<24} {'Summary'}")
    lines.append("-" * 96)
    for index, action in enumerate(actions, start=1):
        folder = action.message.folder[:24]
        lines.append(f"{index:<4} {action.action_type:<18} {folder:<24} {action.summary}")
    return "\n".join(lines)


def confirm_batch(actions: list[PendingAction], prompt: str = "Execute these actions now?") -> bool:
    if not actions:
        return False
    if not sys.stdin.isatty():
        return False
    print(render_actions_table(actions))
    response = input(f"{prompt} [y/N]: ").strip().lower()
    return response in {"y", "yes"}
