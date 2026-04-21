"""Typed data models for the Outlook Assistant."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class MessageRef:
    message_id: str
    folder: str
    account: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AttachmentRecord:
    name: str
    path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class MessageRecord:
    ref: MessageRef
    sender: str
    recipients: list[str]
    cc: list[str]
    subject: str
    received_at: str
    body_preview: str
    body: str | None
    unread: bool
    categories: list[str]
    flagged: bool
    has_attachments: bool
    attachment_names: list[str]

    @property
    def folder(self) -> str:
        return self.ref.folder

    @property
    def account(self) -> str | None:
        return self.ref.account

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["folder"] = self.folder
        data["account"] = self.account
        return data


@dataclass(frozen=True)
class SearchFilters:
    account: str | None = None
    folders: list[str] = field(default_factory=list)
    sender_contains: str | None = None
    subject_contains: str | None = None
    keyword: str | None = None
    since: str | None = None
    until: str | None = None
    unread_only: bool = False
    has_attachments: bool | None = None
    limit: int | None = None
    include_body: bool = False


@dataclass(frozen=True)
class ClassificationResult:
    label: str
    reason: str
    likely_reply_needed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DraftRequest:
    ref: MessageRef
    to: list[str]
    cc: list[str]
    subject: str
    body: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["ref"] = self.ref.to_dict()
        return data


@dataclass(frozen=True)
class PendingAction:
    action_type: str
    message: MessageRef
    summary: str
    parameters: dict[str, Any]
    staged_at: str
    risky: bool = True

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["message"] = self.message.to_dict()
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PendingAction":
        return cls(
            action_type=str(data["action_type"]),
            message=MessageRef(**data["message"]),
            summary=str(data["summary"]),
            parameters=dict(data.get("parameters", {})),
            staged_at=str(data["staged_at"]),
            risky=bool(data.get("risky", True)),
        )


@dataclass(frozen=True)
class ApprovalBatch:
    actions: list[PendingAction]
    approval_mode: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "approval_mode": self.approval_mode,
            "actions": [action.to_dict() for action in self.actions],
        }


@dataclass(frozen=True)
class LeadContact:
    name: str
    email: str
    company: str | None = None
    title: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class LeadGroup:
    folders: list[str] = field(default_factory=list)
    sender_domains: list[str] = field(default_factory=list)
    contacts: list[LeadContact] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "folders": list(self.folders),
            "sender_domains": list(self.sender_domains),
            "contacts": [contact.to_dict() for contact in self.contacts],
        }


@dataclass(frozen=True)
class AppConfig:
    default_account: str
    outbound_account: str
    approval_mode: bool
    default_archive_folder: str
    summary_folders: list[str]
    newsletter_senders: list[str]
    automated_subject_keywords: list[str]
    important_sender_allowlist: list[str]
    attachment_save_dir: str
    log_file: str
    pending_actions_file: str
    reply_signature: str
    lead_groups: dict[str, LeadGroup]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
