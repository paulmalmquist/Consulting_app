#!/usr/bin/env python3
"""
Outlook MCP Server

Exposes Classic Outlook (win32com) as MCP tools for Claude:
- Create email drafts (single or bulk)
- Send emails
- List/read drafts
- Create calendar events
- List calendar events

Requires: pip install mcp pywin32
Run with Classic Outlook open.
Transport: stdio (local tool, runs on Windows)
"""

import json
import sys
from datetime import datetime, timedelta
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

# Only import win32com on Windows
try:
    import win32com.client
    import pywintypes
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

mcp = FastMCP("outlook_mcp")


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_outlook():
    """Connect to Classic Outlook via COM. Raises RuntimeError if unavailable."""
    if not WIN32_AVAILABLE:
        raise RuntimeError("pywin32 not installed. Run: pip install pywin32")
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        return outlook
    except Exception as e:
        raise RuntimeError(
            f"Could not connect to Outlook. Is Classic Outlook open? Error: {e}"
        )


def find_account(outlook, match: str):
    """Return first account whose SmtpAddress contains match (case-insensitive). None if not found."""
    accounts = outlook.Session.Accounts
    for i in range(1, accounts.Count + 1):
        acct = accounts.Item(i)
        if match.lower() in acct.SmtpAddress.lower():
            return acct
    return None


def list_accounts(outlook) -> list:
    """Return list of all account SMTP addresses."""
    accounts = outlook.Session.Accounts
    return [accounts.Item(i).SmtpAddress for i in range(1, accounts.Count + 1)]


def olitem_to_dict(mail) -> dict:
    """Convert an Outlook MailItem to a plain dict."""
    try:
        return {
            "subject": mail.Subject or "",
            "to": mail.To or "",
            "body_preview": (mail.Body or "")[:300],
            "sent_on": str(mail.SentOn) if mail.SentOn else None,
            "received_time": str(mail.ReceivedTime) if hasattr(mail, "ReceivedTime") else None,
            "entry_id": mail.EntryID,
        }
    except Exception:
        return {}


def calendar_item_to_dict(appt) -> dict:
    """Convert an Outlook AppointmentItem to a plain dict."""
    try:
        return {
            "subject": appt.Subject or "",
            "start": str(appt.Start),
            "end": str(appt.End),
            "location": appt.Location or "",
            "body_preview": (appt.Body or "")[:300],
            "duration_minutes": appt.Duration,
            "entry_id": appt.EntryID,
        }
    except Exception:
        return {}


# ── Input Models ──────────────────────────────────────────────────────────────

class DraftInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body (plain text)")
    sender_account: Optional[str] = Field(
        default="novendor",
        description="Partial SMTP match for sender account (e.g. 'novendor' matches info@novendor.ai). Leave empty for default account."
    )


class BulkDraftItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body (plain text)")


class BulkDraftInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    drafts: List[BulkDraftItem] = Field(..., description="List of email drafts to create")
    sender_account: Optional[str] = Field(
        default="novendor",
        description="Partial SMTP match for sender account (e.g. 'novendor' for info@novendor.ai)"
    )


class SendEmailInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    to: str = Field(..., description="Recipient email address")
    subject: str = Field(..., description="Email subject line")
    body: str = Field(..., description="Email body (plain text)")
    sender_account: Optional[str] = Field(
        default="novendor",
        description="Partial SMTP match for sender account"
    )


class ListDraftsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    account_match: Optional[str] = Field(
        default=None,
        description="Filter drafts by account (partial SMTP match). None = all accounts."
    )
    limit: Optional[int] = Field(default=20, ge=1, le=100, description="Max drafts to return")


class CreateCalendarEventInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    subject: str = Field(..., description="Event title")
    start: str = Field(..., description="Start datetime in ISO format: 'YYYY-MM-DD HH:MM'")
    end: str = Field(..., description="End datetime in ISO format: 'YYYY-MM-DD HH:MM'")
    location: Optional[str] = Field(default="", description="Event location or meeting link")
    body: Optional[str] = Field(default="", description="Event description / notes")
    attendees: Optional[str] = Field(
        default="",
        description="Semicolon-separated attendee email addresses (e.g. 'a@x.com;b@y.com')"
    )


class ListCalendarEventsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days_ahead: Optional[int] = Field(default=7, ge=1, le=90, description="How many days ahead to look")
    days_back: Optional[int] = Field(default=0, ge=0, le=30, description="How many days back to look")


# ── Tools ─────────────────────────────────────────────────────────────────────

@mcp.tool(
    name="outlook_create_draft",
    annotations={
        "title": "Create Outlook Email Draft",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    }
)
async def outlook_create_draft(params: DraftInput) -> str:
    """Create a single email draft in Classic Outlook.

    Saves to the Drafts folder of the specified sender account. Does NOT send.

    Args:
        params.to: Recipient email address
        params.subject: Email subject
        params.body: Plain text body
        params.sender_account: Partial match on SMTP address (default: 'novendor')

    Returns:
        JSON with success status and draft details, or error message.
    """
    try:
        outlook = get_outlook()
        account = find_account(outlook, params.sender_account) if params.sender_account else None

        mail = outlook.CreateItem(0)  # olMailItem
        mail.To = params.to
        mail.Subject = params.subject
        mail.Body = params.body
        if account:
            mail.SendUsingAccount = account
        mail.Save()

        return json.dumps({
            "status": "created",
            "to": params.to,
            "subject": params.subject,
            "sender_account": account.SmtpAddress if account else "default",
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_create_bulk_drafts",
    annotations={
        "title": "Create Bulk Outlook Email Drafts",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    }
)
async def outlook_create_bulk_drafts(params: BulkDraftInput) -> str:
    """Create multiple email drafts in Classic Outlook in one call.

    This is the preferred tool when creating outreach batches — pass all
    contacts at once rather than calling outlook_create_draft repeatedly.

    Args:
        params.drafts: List of {to, subject, body} dicts
        params.sender_account: Partial SMTP match for sender (default: 'novendor')

    Returns:
        JSON summary with created count, failed count, and per-draft results.
    """
    try:
        outlook = get_outlook()
        account = find_account(outlook, params.sender_account) if params.sender_account else None
        sender_label = account.SmtpAddress if account else "default account"

        results = []
        failed = []

        for draft in params.drafts:
            try:
                mail = outlook.CreateItem(0)
                mail.To = draft.to
                mail.Subject = draft.subject
                mail.Body = draft.body
                if account:
                    mail.SendUsingAccount = account
                mail.Save()
                results.append({"to": draft.to, "subject": draft.subject, "status": "created"})
            except Exception as e:
                failed.append({"to": draft.to, "subject": draft.subject, "error": str(e)})

        return json.dumps({
            "created": len(results),
            "failed": len(failed),
            "sender_account": sender_label,
            "drafts": results,
            "errors": failed,
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_send_email",
    annotations={
        "title": "Send Email via Outlook",
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": True,
    }
)
async def outlook_send_email(params: SendEmailInput) -> str:
    """Send an email immediately via Classic Outlook.

    WARNING: This sends immediately — use outlook_create_draft if you want to
    review before sending.

    Args:
        params.to: Recipient email
        params.subject: Subject line
        params.body: Plain text body
        params.sender_account: Partial SMTP match for sender

    Returns:
        JSON confirmation or error.
    """
    try:
        outlook = get_outlook()
        account = find_account(outlook, params.sender_account) if params.sender_account else None

        mail = outlook.CreateItem(0)
        mail.To = params.to
        mail.Subject = params.subject
        mail.Body = params.body
        if account:
            mail.SendUsingAccount = account
        mail.Send()

        return json.dumps({
            "status": "sent",
            "to": params.to,
            "subject": params.subject,
            "sender_account": account.SmtpAddress if account else "default",
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_list_drafts",
    annotations={
        "title": "List Outlook Drafts",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
async def outlook_list_drafts(params: ListDraftsInput) -> str:
    """List email drafts in Classic Outlook.

    Args:
        params.account_match: Filter by account (partial SMTP match). None = all.
        params.limit: Max number of drafts to return (default 20)

    Returns:
        JSON list of draft summaries (subject, to, body preview).
    """
    try:
        outlook = get_outlook()
        namespace = outlook.GetNamespace("MAPI")

        drafts_folder = namespace.GetDefaultFolder(16)  # 16 = olFolderDrafts
        items = drafts_folder.Items
        items.Sort("[ReceivedTime]", True)

        results = []
        count = 0
        for i in range(1, items.Count + 1):
            if count >= params.limit:
                break
            try:
                item = items.Item(i)
                results.append(olitem_to_dict(item))
                count += 1
            except Exception:
                continue

        return json.dumps({
            "count": len(results),
            "drafts": results,
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_list_accounts",
    annotations={
        "title": "List Outlook Accounts",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
async def outlook_list_accounts() -> str:
    """List all email accounts configured in Classic Outlook.

    Use this to find the right sender_account match string before creating drafts.

    Returns:
        JSON list of SMTP addresses.
    """
    try:
        outlook = get_outlook()
        accounts = list_accounts(outlook)
        return json.dumps({"accounts": accounts}, indent=2)
    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_create_calendar_event",
    annotations={
        "title": "Create Outlook Calendar Event",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": False,
    }
)
async def outlook_create_calendar_event(params: CreateCalendarEventInput) -> str:
    """Create a calendar event in Classic Outlook.

    Optionally invite attendees (sends meeting requests if attendees are specified).

    Args:
        params.subject: Event title
        params.start: Start datetime 'YYYY-MM-DD HH:MM'
        params.end: End datetime 'YYYY-MM-DD HH:MM'
        params.location: Location or meeting link
        params.body: Notes/description
        params.attendees: Semicolon-separated emails (triggers meeting invite)

    Returns:
        JSON confirmation with event details, or error.
    """
    try:
        outlook = get_outlook()

        start_dt = datetime.strptime(params.start, "%Y-%m-%d %H:%M")
        end_dt = datetime.strptime(params.end, "%Y-%m-%d %H:%M")

        appt = outlook.CreateItem(1)  # 1 = olAppointmentItem
        appt.Subject = params.subject
        appt.Start = start_dt.strftime("%m/%d/%Y %H:%M")
        appt.End = end_dt.strftime("%m/%d/%Y %H:%M")
        appt.Location = params.location or ""
        appt.Body = params.body or ""

        if params.attendees:
            appt.MeetingStatus = 1  # olMeeting
            for email in params.attendees.split(";"):
                email = email.strip()
                if email:
                    recipient = appt.Recipients.Add(email)
                    recipient.Type = 1  # olRequired

        appt.Save()

        return json.dumps({
            "status": "created",
            "subject": params.subject,
            "start": params.start,
            "end": params.end,
            "location": params.location,
            "attendees": params.attendees or "none",
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


@mcp.tool(
    name="outlook_list_calendar_events",
    annotations={
        "title": "List Outlook Calendar Events",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
async def outlook_list_calendar_events(params: ListCalendarEventsInput) -> str:
    """List upcoming calendar events from Classic Outlook.

    Args:
        params.days_ahead: How many days ahead to look (default 7, max 90)
        params.days_back: How many days back to look (default 0)

    Returns:
        JSON list of events with subject, start, end, location.
    """
    try:
        outlook = get_outlook()
        namespace = outlook.GetNamespace("MAPI")
        calendar = namespace.GetDefaultFolder(9)  # 9 = olFolderCalendar

        now = datetime.now()
        start_range = now - timedelta(days=params.days_back)
        end_range = now + timedelta(days=params.days_ahead)

        items = calendar.Items
        items.IncludeRecurrences = True
        items.Sort("[Start]")

        start_str = start_range.strftime("%m/%d/%Y %H:%M %p")
        end_str = end_range.strftime("%m/%d/%Y %H:%M %p")
        restriction = f"[Start] >= '{start_str}' AND [End] <= '{end_str}'"

        try:
            filtered = items.Restrict(restriction)
        except Exception:
            filtered = items

        results = []
        for i in range(1, min(filtered.Count + 1, 101)):
            try:
                appt = filtered.Item(i)
                results.append(calendar_item_to_dict(appt))
            except Exception:
                continue

        return json.dumps({
            "count": len(results),
            "range": f"{start_range.date()} to {end_range.date()}",
            "events": results,
        }, indent=2)

    except Exception as e:
        return f"Error: {e}"


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
