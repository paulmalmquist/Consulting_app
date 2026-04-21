"""AppleScript-backed Outlook client for macOS."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from .errors import OutlookOperationError, OutlookPermissionError, OutlookUnavailableError
from .models import AttachmentRecord, DraftRequest, MessageRecord, MessageRef, SearchFilters

PACKAGE_DIR = Path(__file__).resolve().parent
APPLE_DIR = PACKAGE_DIR / "apple"
FIELD_SEP = "\x1f"
ROW_SEP = "\x1e"
LIST_SEP = "\x1d"


def _permission_help(stderr: str) -> str:
    return (
        "Outlook automation permission is blocked.\n"
        "Open Outlook once manually, then rerun the command to trigger the macOS prompt.\n"
        "Next go to System Settings > Privacy & Security > Automation and allow your terminal "
        "app to control Microsoft Outlook.\n"
        "If it still fails, toggle that Automation permission off and back on, then retry.\n"
        f"Underlying error: {stderr.strip()}"
    )


def _normalize_text(value: str) -> str:
    return value.replace(FIELD_SEP, " ").replace(ROW_SEP, " ").replace(LIST_SEP, ", ").strip()


class OutlookClient:
    """Thin typed wrapper around `osascript` and Outlook AppleScript files."""

    def __init__(self, default_account: str) -> None:
        self.default_account = default_account
        self._assert_environment()

    def _assert_environment(self) -> None:
        if platform.system() != "Darwin":
            raise OutlookUnavailableError("Outlook Assistant for Mac requires macOS")
        if shutil.which("osascript") is None:
            raise OutlookUnavailableError("`osascript` is not available on PATH")

    def _run_script(self, script_name: str, args: list[str]) -> str:
        script_path = APPLE_DIR / script_name
        if not script_path.exists():
            raise OutlookOperationError(f"AppleScript not found: {script_path}")
        process = subprocess.run(
            ["osascript", str(script_path), *args],
            capture_output=True,
            text=True,
            check=False,
        )
        stderr = process.stderr or ""
        if process.returncode != 0:
            lowered = stderr.lower()
            if any(marker in lowered for marker in ("-1743", "not authorized", "automation", "apple events")):
                raise OutlookPermissionError(_permission_help(stderr))
            raise OutlookOperationError(
                f"osascript exited with code {process.returncode}: {stderr.strip() or '(no stderr)'}"
            )
        return process.stdout.strip()

    def list_folders(self, account: str | None = None) -> list[str]:
        raw = self._run_script("folders.applescript", [account or self.default_account])
        if not raw:
            return []
        return [line for line in raw.splitlines() if line.strip()]

    def list_messages(
        self,
        *,
        folder: str,
        account: str | None = None,
        include_body: bool = False,
        limit: int | None = None,
    ) -> list[MessageRecord]:
        raw = self._run_script(
            "list_messages.applescript",
            [
                account or self.default_account,
                folder,
                "1" if include_body else "0",
                str(limit or 0),
            ],
        )
        return self._parse_messages(raw)

    def search_messages(self, filters: SearchFilters) -> list[MessageRecord]:
        folders = filters.folders or ["Inbox"]
        messages: list[MessageRecord] = []
        per_folder_limit = filters.limit if len(folders) == 1 else None
        for folder in folders:
            messages.extend(
                self.list_messages(
                    folder=folder,
                    account=filters.account,
                    include_body=filters.include_body,
                    limit=per_folder_limit,
                )
            )
        filtered = [message for message in messages if self._matches_filters(message, filters)]
        filtered.sort(key=lambda message: message.received_at, reverse=True)
        return filtered[: filters.limit] if filters.limit else filtered

    def create_draft(
        self,
        *,
        draft: DraftRequest,
        account: str | None = None,
    ) -> str:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".txt",
            delete=False,
        ) as handle:
            handle.write(draft.body)
            body_path = handle.name
        try:
            raw = self._run_script(
                "create_draft.applescript",
                [
                    account or draft.ref.account or self.default_account,
                    draft.subject,
                    ",".join(draft.to),
                    ",".join(draft.cc),
                    body_path,
                ],
            )
        finally:
            try:
                os.unlink(body_path)
            except OSError:
                pass
        return raw

    def move_message(self, message: MessageRef, destination_folder: str) -> str:
        return self._run_script(
            "move_message.applescript",
            [
                message.account or self.default_account,
                message.folder,
                message.message_id,
                destination_folder,
            ],
        )

    def mark_read_state(self, message: MessageRef, unread: bool) -> str:
        return self._run_script(
            "mark_read_state.applescript",
            [
                message.account or self.default_account,
                message.folder,
                message.message_id,
                "1" if unread else "0",
            ],
        )

    def set_category(self, message: MessageRef, category: str, remove: bool = False) -> str:
        return self._run_script(
            "set_category.applescript",
            [
                message.account or self.default_account,
                message.folder,
                message.message_id,
                category,
                "1" if remove else "0",
            ],
        )

    def set_flag(self, message: MessageRef, flagged: bool) -> str:
        return self._run_script(
            "set_flag.applescript",
            [
                message.account or self.default_account,
                message.folder,
                message.message_id,
                "1" if flagged else "0",
            ],
        )

    def save_attachments(
        self,
        message: MessageRef,
        destination_dir: str,
    ) -> list[AttachmentRecord]:
        raw = self._run_script(
            "save_attachments.applescript",
            [
                message.account or self.default_account,
                message.folder,
                message.message_id,
                destination_dir,
            ],
        )
        records: list[AttachmentRecord] = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            name, _, path = line.partition("\t")
            records.append(AttachmentRecord(name=name, path=path or None))
        return records

    def _matches_filters(self, message: MessageRecord, filters: SearchFilters) -> bool:
        sender = message.sender.lower()
        subject = message.subject.lower()
        body = (message.body or message.body_preview or "").lower()
        if filters.sender_contains and filters.sender_contains.lower() not in sender:
            return False
        if filters.subject_contains and filters.subject_contains.lower() not in subject:
            return False
        if filters.keyword:
            needle = filters.keyword.lower()
            if needle not in subject and needle not in body and needle not in sender:
                return False
        if filters.since and message.received_at and message.received_at < filters.since:
            return False
        if filters.until and message.received_at and message.received_at > filters.until:
            return False
        if filters.unread_only and not message.unread:
            return False
        if filters.has_attachments is not None and message.has_attachments != filters.has_attachments:
            return False
        return True

    def _parse_messages(self, raw: str) -> list[MessageRecord]:
        if not raw:
            return []
        records: list[MessageRecord] = []
        for row in raw.split(ROW_SEP):
            if not row.strip():
                continue
            parts = row.split(FIELD_SEP)
            while len(parts) < 12:
                parts.append("")
            recipients = [item for item in parts[3].split(LIST_SEP) if item]
            cc = [item for item in parts[4].split(LIST_SEP) if item]
            categories = [item for item in parts[8].split(LIST_SEP) if item]
            attachment_names = [item for item in parts[10].split(LIST_SEP) if item]
            records.append(
                MessageRecord(
                    ref=MessageRef(
                        message_id=_normalize_text(parts[0]),
                        folder=_normalize_text(parts[11]),
                        account=_normalize_text(parts[1]) or None,
                    ),
                    sender=_normalize_text(parts[2]),
                    recipients=[_normalize_text(item) for item in recipients],
                    cc=[_normalize_text(item) for item in cc],
                    subject=_normalize_text(parts[5]),
                    received_at=_normalize_text(parts[6]),
                    body_preview=_normalize_text(parts[7]),
                    body=_normalize_text(parts[9]) if parts[9] else None,
                    unread=parts[12].strip().lower() == "true" if len(parts) > 12 else False,
                    categories=[_normalize_text(item) for item in categories],
                    flagged=parts[13].strip().lower() == "true" if len(parts) > 13 else False,
                    has_attachments=parts[14].strip().lower() == "true" if len(parts) > 14 else bool(attachment_names),
                    attachment_names=[_normalize_text(item) for item in attachment_names],
                )
            )
        return records
