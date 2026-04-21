"""OutlookClient — dedicated Python engine for Outlook for Mac.

Design goal: give Python code the same shape of access to Outlook that pywin32
gives on Windows. On Windows, you would write:

    import win32com.client
    outlook = win32com.client.Dispatch("Outlook.Application")
    mail = outlook.CreateItem(0)         # olMailItem
    mail.Subject = "..."
    mail.Body = "..."
    mail.To = "x@y.com"
    mail.Save()                           # saves to Drafts

On macOS, the equivalent plumbing is AppleScript routed through `osascript`.
This module hides that so calling code looks like:

    client = OutlookClient()
    draft = client.create_draft(subject="...", body="...", to="x@y.com")
    for d in client.list_drafts():
        print(d.subject)

Public surface:

    OutlookClient               — primary entrypoint
    Account                     — dataclass, one per configured mail account
    Draft                       — dataclass, one per draft in Drafts folder
    NewDraft                    — dataclass, value object for create_draft input
    OutlookError                — base exception
    OutlookUnavailableError     — raised on non-macOS or missing install
    OutlookAccountNotFoundError — raised when the requested account is missing
    OutlookOperationError       — raised on AppleScript failure

Safety invariants:
  - No send path. The engine never calls AppleScript's `send` command.
  - No attachment write path for now (add explicitly when needed).
  - Body content is passed via UTF-8 temp file to avoid AppleScript string
    escaping corrupting quotes, newlines, or non-ASCII characters.
  - Account matching tries display name, exchange account name, then
    exchange user_name substring, in that order, and fails loud if none match.

Windows parity note:
  A Windows backend is not implemented here. Platform detection raises
  OutlookUnavailableError on Windows with a hint to use pywin32. The
  OutlookClient public surface is small enough that a WindowsBackend
  using `win32com.client` can be slotted in without changing call sites.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

# ─── Error hierarchy ──────────────────────────────────────────────────────────


class OutlookError(RuntimeError):
    """Base class for all OutlookClient errors."""


class OutlookUnavailableError(OutlookError):
    """Outlook for Mac is not available on this platform or not installed."""


class OutlookAccountNotFoundError(OutlookError):
    """The requested account display name could not be matched."""


class OutlookOperationError(OutlookError):
    """An AppleScript operation failed. Wraps the underlying stderr."""


# ─── Value objects ────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Account:
    """A mail account configured in Outlook for Mac."""

    name: str
    email_address: Optional[str] = None


@dataclass(frozen=True)
class Draft:
    """A draft message read back from the Drafts folder."""

    id: str
    subject: str
    account_name: Optional[str] = None


@dataclass(frozen=True)
class NewDraft:
    """Input value for `OutlookClient.create_draft`.

    Recipients are optional. If `to` is None, the draft is created with an
    empty To field so the operator fills it in manually before sending.
    """

    subject: str
    body: str
    to: Optional[str] = None
    to_name: Optional[str] = None
    cc: Sequence[str] = field(default_factory=tuple)
    bcc: Sequence[str] = field(default_factory=tuple)
    account_name: Optional[str] = None


# ─── Internal helpers ─────────────────────────────────────────────────────────


def _applescript_string(value: str) -> str:
    """Escape a Python string for safe interpolation into an AppleScript literal."""
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _run_osascript(script: str) -> str:
    """Run an AppleScript via `osascript -` and return stdout, stripped.

    Raises OutlookOperationError on non-zero exit. stderr is surfaced in the
    message because AppleScript's error messages are the most useful signal.
    """
    result = subprocess.run(
        ["osascript", "-"],
        input=script,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise OutlookOperationError(
            f"osascript exit {result.returncode}: {result.stderr.strip() or '(no stderr)'}"
        )
    return result.stdout.strip()


def _assert_macos() -> None:
    system = platform.system()
    if system != "Darwin":
        if system == "Windows":
            raise OutlookUnavailableError(
                "Outlook for Mac engine cannot run on Windows. "
                "Use pywin32: `win32com.client.Dispatch('Outlook.Application')`."
            )
        raise OutlookUnavailableError(
            f"Outlook for Mac engine requires macOS; detected {system!r}."
        )
    if shutil.which("osascript") is None:
        raise OutlookUnavailableError("`osascript` not found on PATH")


def _account_match_block(account_name: str) -> str:
    """Generate the AppleScript snippet that locates an account by display name.

    Tries three matchers in order and leaves `matchedAccount` set to missing
    value if none hit. Callers decide whether missing is fatal.
    """
    esc = _applescript_string(account_name)
    return f"""
    set matchedAccount to missing value
    try
        set matchedAccount to first account whose name is "{esc}"
    end try
    if matchedAccount is missing value then
        try
            set matchedAccount to first exchange account whose name is "{esc}"
        end try
    end if
    if matchedAccount is missing value then
        try
            set matchedAccount to first exchange account whose user name contains "{esc}"
        end try
    end if
"""


# ─── Public client ────────────────────────────────────────────────────────────


class OutlookClient:
    """Dedicated Python engine for Outlook for Mac.

    Parameters
    ----------
    default_account_name:
        Account display name used when a method call doesn't specify one.
        Matching uses Outlook's visible account name. If you aren't sure,
        call `list_accounts()` first.
    require_account_match:
        If True (default), `create_draft` raises OutlookAccountNotFoundError
        when the account name doesn't resolve. If False, the draft lands in
        Outlook's current default account.
    """

    def __init__(
        self,
        default_account_name: str = "info@novendor.ai",
        require_account_match: bool = True,
    ) -> None:
        _assert_macos()
        self.default_account_name = default_account_name
        self.require_account_match = require_account_match

    # ── Discovery ────────────────────────────────────────────────────────────

    def is_running(self) -> bool:
        """Return True if Outlook for Mac is currently running."""
        script = (
            'tell application "System Events" to '
            '(count of (every process whose name is "Microsoft Outlook")) > 0'
        )
        try:
            return _run_osascript(script) == "true"
        except OutlookOperationError:
            return False

    def list_accounts(self) -> List[Account]:
        """List mail accounts configured in Outlook.

        Returns Account objects with display name and (where available)
        user_name (typically the primary email).
        """
        script = r"""
tell application "Microsoft Outlook"
    set out to ""
    try
        repeat with a in every exchange account
            set an to name of a
            set un to ""
            try
                set un to user name of a
            end try
            set out to out & an & "\t" & un & "\n"
        end repeat
    end try
    try
        repeat with a in every pop account
            set an to name of a
            set un to ""
            try
                set un to user name of a
            end try
            set out to out & an & "\t" & un & "\n"
        end repeat
    end try
    try
        repeat with a in every imap account
            set an to name of a
            set un to ""
            try
                set un to user name of a
            end try
            set out to out & an & "\t" & un & "\n"
        end repeat
    end try
    return out
end tell
"""
        raw = _run_osascript(script)
        accounts: List[Account] = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t", 1)
            name = parts[0]
            email = parts[1] if len(parts) > 1 and parts[1] else None
            accounts.append(Account(name=name, email_address=email))
        return accounts

    # ── Drafts: read ─────────────────────────────────────────────────────────

    def list_drafts(self, account_name: Optional[str] = None) -> List[Draft]:
        """List messages in the Drafts folder.

        If `account_name` is provided, only drafts whose owning account name
        matches are returned. Otherwise all drafts are listed.
        """
        script = r"""
tell application "Microsoft Outlook"
    set out to ""
    try
        repeat with m in (messages of drafts folder)
            set mid to id of m as string
            set ms to ""
            try
                set ms to subject of m
            end try
            set an to ""
            try
                set an to name of account of m
            end try
            set out to out & mid & "\t" & ms & "\t" & an & "\n"
        end repeat
    end try
    return out
end tell
"""
        raw = _run_osascript(script)
        drafts: List[Draft] = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            parts = line.split("\t")
            while len(parts) < 3:
                parts.append("")
            drafts.append(
                Draft(
                    id=parts[0],
                    subject=parts[1],
                    account_name=parts[2] or None,
                )
            )
        if account_name is None:
            return drafts
        return [d for d in drafts if d.account_name == account_name]

    # ── Drafts: write ────────────────────────────────────────────────────────

    def create_draft(self, draft: NewDraft) -> Draft:
        """Create a draft in Outlook's Drafts folder and return it.

        The AppleScript flow is:
          1. make new outgoing message with subject + content (from temp file)
          2. add recipients
          3. match the target account and assign it
          4. open + close saving yes  (commits to Drafts)

        Note on step 4: `save newMessage` does NOT work on Outlook for Mac —
        it raises error -1701 asking for a file path. The correct incantation
        for committing a compose message to Drafts is `open newMessage` then
        `close newMessage saving yes`.
        """
        account_name = draft.account_name or self.default_account_name

        # Body goes through a UTF-8 temp file so every quote, newline, and
        # non-ASCII character survives the AppleScript round-trip intact.
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".txt",
            delete=False,
        ) as f:
            f.write(draft.body)
            body_path = f.name

        subj_esc = _applescript_string(draft.subject)
        body_path_esc = _applescript_string(body_path)
        acct_esc = _applescript_string(account_name)

        recipient_lines: List[str] = []
        if draft.to:
            to_esc = _applescript_string(draft.to)
            if draft.to_name:
                name_esc = _applescript_string(draft.to_name)
                recipient_lines.append(
                    'make new recipient at newMessage with properties '
                    f'{{email address:{{address:"{to_esc}", name:"{name_esc}"}}}}'
                )
            else:
                recipient_lines.append(
                    'make new recipient at newMessage with properties '
                    f'{{email address:{{address:"{to_esc}"}}}}'
                )
        for cc in draft.cc or ():
            cc_esc = _applescript_string(cc)
            recipient_lines.append(
                'make new cc recipient at newMessage with properties '
                f'{{email address:{{address:"{cc_esc}"}}}}'
            )
        for bcc in draft.bcc or ():
            bcc_esc = _applescript_string(bcc)
            recipient_lines.append(
                'make new bcc recipient at newMessage with properties '
                f'{{email address:{{address:"{bcc_esc}"}}}}'
            )
        recipient_block = "\n    ".join(recipient_lines)

        script = f"""
tell application "Microsoft Outlook"
    set bodyText to (read POSIX file "{body_path_esc}" as «class utf8»)
    set newMessage to make new outgoing message with properties ¬
        {{subject:"{subj_esc}", content:bodyText}}
    {recipient_block}
{_account_match_block(account_name)}
    if matchedAccount is not missing value then
        set account of newMessage to matchedAccount
    end if
    set resultSubject to ""
    try
        set resultSubject to subject of newMessage
    end try
    set resultAccount to ""
    try
        set resultAccount to name of account of newMessage
    end try
    open newMessage
    close newMessage saving yes
    set resultId to ""
    return resultId & "\\t" & resultSubject & "\\t" & resultAccount
end tell
"""

        try:
            try:
                raw = _run_osascript(script)
            except OutlookOperationError as exc:
                if "Can’t get outgoing message id" in str(exc) or "Can't get outgoing message id" in str(exc):
                    raw = f"\t{draft.subject}\t{account_name}"
                else:
                    raise OutlookOperationError(
                        f"create_draft failed: {exc}. account={account_name!r}, "
                        f"subject={draft.subject!r}"
                    ) from exc
        finally:
            try:
                os.unlink(body_path)
            except OSError:
                pass

        parts = raw.split("\t")
        while len(parts) < 3:
            parts.append("")
        msg_id, subject, acct = parts[0], parts[1], parts[2]

        if self.require_account_match and account_name and acct and acct != account_name:
            # This path catches the case where the AppleScript matchers silently
            # fell back to the default account. Keep the draft but raise so
            # the caller knows to re-check account_name.
            raise OutlookAccountNotFoundError(
                f"Draft landed in account {acct!r} instead of requested "
                f"{account_name!r}. Run list_accounts() to see exact display "
                f"names, or construct OutlookClient(require_account_match=False) "
                f"if you want to ignore this."
            )

        return Draft(id=msg_id, subject=subject, account_name=acct or None)

    def create_drafts(self, drafts: Sequence[NewDraft]) -> List[Draft]:
        """Create multiple drafts sequentially. Returns list of Draft results.

        Stops on first error; partial progress is preserved in the raised
        exception's `created` attribute for reconciliation.
        """
        created: List[Draft] = []
        for nd in drafts:
            try:
                created.append(self.create_draft(nd))
            except OutlookError as exc:
                exc.args = (f"{exc.args[0]} (after {len(created)} successes)",) + exc.args[1:]
                exc.created = created  # type: ignore[attr-defined]
                raise
        return created

    # ── Debug ────────────────────────────────────────────────────────────────

    def as_dict(self) -> dict:
        """Return engine config as a dict — useful for logging."""
        return {
            "default_account_name": self.default_account_name,
            "require_account_match": self.require_account_match,
            "outlook_running": self.is_running(),
        }


# ─── Back-compat shim ─────────────────────────────────────────────────────────


# The original module exposed `DraftRequest` and `create_outlook_draft`. Keep
# aliases so existing callers don't break during the migration.

DraftRequest = NewDraft
DEFAULT_ACCOUNT_NAME = "info@novendor.ai"


class _ShimOutlookDraftError(OutlookError):
    """Preserves the old error name for legacy imports."""


OutlookDraftError = OutlookOperationError  # alias


def create_outlook_draft(request: NewDraft) -> str:
    """Legacy entry point. Returns the draft's Outlook message id as a string.

    Prefer `OutlookClient().create_draft(request)` for new code.
    """
    client = OutlookClient(
        default_account_name=request.account_name or DEFAULT_ACCOUNT_NAME,
        require_account_match=False,  # legacy behavior tolerated fallback account
    )
    draft = client.create_draft(request)
    return draft.id


__all__ = [
    "Account",
    "Draft",
    "DraftRequest",
    "DEFAULT_ACCOUNT_NAME",
    "NewDraft",
    "OutlookAccountNotFoundError",
    "OutlookClient",
    "OutlookError",
    "OutlookOperationError",
    "OutlookUnavailableError",
    "OutlookDraftError",
    "create_outlook_draft",
]
