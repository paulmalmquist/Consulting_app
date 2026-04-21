"""FastMCP server built on top of OutlookClient.

Once registered with Cowork or Claude Code, Claude can draft into Outlook
without shelling out to the CLI. All tools are read-only except
create_* which only write to Drafts — never send.

Tools:
    list_outlook_accounts    — discovery
    list_outlook_drafts      — read back current Drafts folder
    create_outlook_draft     — freeform draft from explicit fields
    create_prospect_draft    — draft one of the curated prospects by slug
    list_prospect_drafts     — catalog of curated prospects

Run directly:
    python -m scripts.novendor_outreach.mcp_server
"""

from __future__ import annotations

from typing import List, Optional

try:
    from mcp.server.fastmcp import FastMCP  # type: ignore[import-not-found]
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "mcp SDK not installed. Run: pip install 'mcp[cli]'\n"
        f"Original error: {exc}"
    )

from .outlook import (
    DEFAULT_ACCOUNT_NAME,
    NewDraft,
    OutlookClient,
    OutlookError,
)
from .prospects import PROSPECT_DRAFTS


mcp = FastMCP("novendor-outreach")


def _client(account_name: Optional[str], require_match: bool = True) -> OutlookClient:
    return OutlookClient(
        default_account_name=account_name or DEFAULT_ACCOUNT_NAME,
        require_account_match=require_match,
    )


@mcp.tool()
def list_outlook_accounts() -> List[dict]:
    """List mail accounts configured in Outlook for Mac.

    Returns:
        A list of {name, email_address} dicts. Use the exact `name` value
        as `account_name` in subsequent calls.
    """
    try:
        return [
            {"name": a.name, "email_address": a.email_address}
            for a in _client(None, require_match=False).list_accounts()
        ]
    except OutlookError as exc:
        return [{"error": str(exc)}]


@mcp.tool()
def list_outlook_drafts(account_name: Optional[str] = None) -> List[dict]:
    """Read back drafts currently in Outlook's Drafts folder.

    Args:
        account_name: If provided, only drafts owned by that account are returned.
    """
    try:
        drafts = _client(None, require_match=False).list_drafts(account_name=account_name)
        return [
            {"id": d.id, "subject": d.subject, "account_name": d.account_name}
            for d in drafts
        ]
    except OutlookError as exc:
        return [{"error": str(exc)}]


@mcp.tool()
def create_outlook_draft(
    subject: str,
    body: str,
    to: Optional[str] = None,
    to_name: Optional[str] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    account_name: str = DEFAULT_ACCOUNT_NAME,
    allow_account_fallback: bool = False,
) -> str:
    """Create a draft email in Outlook for Mac. Never sends.

    Args:
        subject: Subject line.
        body: Body text. Newlines preserved.
        to: Primary recipient email. Optional.
        to_name: Display name for the primary recipient.
        cc: Additional cc addresses.
        bcc: Additional bcc addresses.
        account_name: Outlook display name for the sending mailbox.
        allow_account_fallback: If True, tolerate the draft landing in a
            different account when the matcher misses.

    Returns:
        Status string with the new draft's Outlook message id.
    """
    try:
        client = _client(account_name, require_match=not allow_account_fallback)
        draft = client.create_draft(
            NewDraft(
                subject=subject,
                body=body,
                to=to,
                to_name=to_name,
                cc=tuple(cc or ()),
                bcc=tuple(bcc or ()),
                account_name=account_name,
            )
        )
        return f"ok: draft created (id={draft.id}, subject={draft.subject!r}, account={draft.account_name!r})"
    except OutlookError as exc:
        return f"error: {exc}"


@mcp.tool()
def create_prospect_draft(
    slug: str,
    to: Optional[str] = None,
    account_name: str = DEFAULT_ACCOUNT_NAME,
    allow_account_fallback: bool = False,
) -> str:
    """Create a draft from the curated prospect seed list.

    Args:
        slug: Prospect identifier. Call list_prospect_drafts to see slugs.
        to: Optional recipient email override.
        account_name: Outlook display name for the sending mailbox.
        allow_account_fallback: See create_outlook_draft.
    """
    prospect = PROSPECT_DRAFTS.get(slug)
    if prospect is None:
        known = ", ".join(sorted(PROSPECT_DRAFTS.keys()))
        return f"error: unknown slug '{slug}'. known: {known}"

    try:
        client = _client(account_name, require_match=not allow_account_fallback)
        draft = client.create_draft(
            NewDraft(
                subject=prospect.subject,
                body=prospect.body,
                to=to,
                to_name=prospect.to_name,
                account_name=account_name,
            )
        )
        return (
            f"ok: {slug} -> {prospect.prospect_label} "
            f"(subject={prospect.subject!r}, id={draft.id}, account={draft.account_name!r})"
        )
    except OutlookError as exc:
        return f"error: {exc}"


@mcp.tool()
def list_prospect_drafts() -> List[dict]:
    """List the curated prospect seed drafts."""
    return [
        {
            "slug": d.slug,
            "prospect_label": d.prospect_label,
            "subject": d.subject,
            "to_name": d.to_name,
        }
        for d in PROSPECT_DRAFTS.values()
    ]


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
