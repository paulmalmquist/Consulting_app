"""Normalized email import pipeline for Novendor outreach.

The pipeline accepts provider-shaped messages from Gmail, Outlook COM exports,
or Microsoft Graph, resolves CRM links, writes `cro_outreach_log`, and creates
reply tasks for inbound prospect mail.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import getaddresses, parsedate_to_datetime
from uuid import UUID

import psycopg

from app.config import NOVENDOR_OUTREACH_OWN_EMAILS
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services import execution_tasks
from app.services.reporting_common import resolve_tenant_id


_SUBJECT_PREFIX_RE = re.compile(r"^\s*((re|fw|fwd):\s*)+", re.I)
_SPACE_RE = re.compile(r"\s+")
_EMAIL_RE = re.compile(r"([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})", re.I)


@dataclass(frozen=True)
class NormalizedEmailEvent:
    provider: str
    mailbox: str
    provider_message_id: str
    message_ts: datetime
    sender_email: str
    sender_name: str | None
    to_emails: list[str]
    cc_emails: list[str]
    subject: str | None
    body_preview: str | None
    direction: str
    logical_dedupe_hash: str
    internet_message_id: str | None = None
    thread_id: str | None = None
    has_attachments: bool = False
    attachment_names: list[str] = field(default_factory=list)
    raw_metadata: dict = field(default_factory=dict)
    crm_account_id: UUID | None = None
    crm_contact_id: UUID | None = None
    crm_opportunity_id: UUID | None = None


def _parse_dt(value: object) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            dt = parsedate_to_datetime(raw)
    else:
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _clean_email(value: str | None) -> str:
    return (value or "").strip().strip("<>").lower()


def _extract_addresses(values: object) -> list[tuple[str | None, str]]:
    if values is None:
        return []
    if isinstance(values, str):
        raw_values = [values]
    elif isinstance(values, list):
        raw_values = values
    else:
        raw_values = [str(values)]

    out: list[tuple[str | None, str]] = []
    for item in raw_values:
        if isinstance(item, dict):
            addr_obj = item.get("emailAddress") if isinstance(item.get("emailAddress"), dict) else item
            name = addr_obj.get("name") if isinstance(addr_obj, dict) else None
            address = addr_obj.get("address") if isinstance(addr_obj, dict) else None
            email = _clean_email(address)
            if email:
                out.append((str(name).strip() if name else None, email))
            continue
        for name, email in getaddresses([str(item)]):
            clean = _clean_email(email)
            if clean:
                out.append((name.strip() or None, clean))
        if not out:
            match = _EMAIL_RE.search(str(item))
            if match:
                out.append((None, _clean_email(match.group(1))))
    return out


def _first_address(value: object) -> tuple[str | None, str]:
    parsed = _extract_addresses(value)
    if parsed:
        return parsed[0]
    return None, ""


def normalize_subject(subject: str | None) -> str:
    return _SPACE_RE.sub(" ", _SUBJECT_PREFIX_RE.sub("", subject or "").strip()).lower()


def _preview(body: object, snippet: object = None) -> str | None:
    text = str(body or snippet or "").strip()
    if not text:
        return None
    return _SPACE_RE.sub(" ", text)[:2000]


def infer_direction(sender_email: str, own_emails: list[str] | None = None) -> str:
    own = {item.lower() for item in (own_emails or NOVENDOR_OUTREACH_OWN_EMAILS)}
    return "outbound" if sender_email.lower() in own else "inbound"


def compute_logical_dedupe_hash(
    *,
    internet_message_id: str | None,
    message_ts: datetime,
    sender_email: str,
    to_emails: list[str],
    cc_emails: list[str],
    subject: str | None,
    body_preview: str | None,
) -> str:
    if internet_message_id:
        basis = f"internet:{internet_message_id.strip().lower()}"
    else:
        rounded = message_ts.astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat()
        recipients = ",".join(sorted(set(to_emails + cc_emails)))
        basis = "|".join([
            rounded,
            sender_email.lower(),
            recipients,
            normalize_subject(subject),
            (body_preview or "")[:500].lower(),
        ])
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def normalize_provider_payload(
    payload: dict,
    *,
    provider: str,
    mailbox: str,
    own_emails: list[str] | None = None,
) -> NormalizedEmailEvent:
    """Normalize Gmail connector, Outlook COM export, or Microsoft Graph payloads."""
    if provider == "msgraph":
        sender_name, sender_email = _first_address(payload.get("from") or payload.get("sender"))
        to_pairs = _extract_addresses(payload.get("toRecipients") or payload.get("to"))
        cc_pairs = _extract_addresses(payload.get("ccRecipients") or payload.get("cc"))
        message_ts = _parse_dt(payload.get("sentDateTime") or payload.get("receivedDateTime") or payload.get("createdDateTime"))
        provider_message_id = str(payload.get("id") or payload.get("provider_message_id") or "")
        internet_message_id = payload.get("internetMessageId")
        thread_id = payload.get("conversationId")
        graph_body = payload.get("body", {}).get("content") if isinstance(payload.get("body"), dict) else payload.get("body")
        body_preview = _preview(graph_body, payload.get("bodyPreview"))
        attachments = payload.get("attachments") or []
        attachment_names = [
            str(item.get("name"))
            for item in attachments
            if isinstance(item, dict) and item.get("name")
        ]
        has_attachments = bool(payload.get("hasAttachments")) or bool(attachment_names)
    else:
        sender_name, sender_email = _first_address(payload.get("from_") or payload.get("from") or payload.get("sender"))
        to_pairs = _extract_addresses(payload.get("to") or payload.get("recipients"))
        cc_pairs = _extract_addresses(payload.get("cc"))
        message_ts = _parse_dt(payload.get("email_ts") or payload.get("received_at") or payload.get("sent_at") or payload.get("message_ts"))
        provider_message_id = str(payload.get("id") or payload.get("message_id") or payload.get("provider_message_id") or "")
        internet_message_id = payload.get("internet_message_id") or payload.get("internetMessageId")
        thread_id = payload.get("thread_id") or payload.get("conversation_id")
        body_preview = _preview(payload.get("body"), payload.get("snippet") or payload.get("body_preview"))
        attachments = payload.get("attachments") or []
        attachment_names = [
            str(item.get("filename") or item.get("name"))
            for item in attachments
            if isinstance(item, dict) and (item.get("filename") or item.get("name"))
        ]
        has_attachments = bool(payload.get("has_attachment")) or bool(payload.get("has_attachments")) or bool(attachment_names)

    if not provider_message_id:
        provider_message_id = compute_logical_dedupe_hash(
            internet_message_id=internet_message_id,
            message_ts=message_ts,
            sender_email=sender_email,
            to_emails=[email for _, email in to_pairs],
            cc_emails=[email for _, email in cc_pairs],
            subject=payload.get("subject"),
            body_preview=body_preview,
        )

    if not sender_email:
        raise ValueError("email payload missing sender address")

    to_emails = [email for _, email in to_pairs]
    cc_emails = [email for _, email in cc_pairs]
    subject = payload.get("subject")
    direction = infer_direction(sender_email, own_emails=own_emails)
    logical_hash = compute_logical_dedupe_hash(
        internet_message_id=str(internet_message_id) if internet_message_id else None,
        message_ts=message_ts,
        sender_email=sender_email,
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=str(subject) if subject else None,
        body_preview=body_preview,
    )

    return NormalizedEmailEvent(
        provider=provider,
        mailbox=mailbox.lower(),
        provider_message_id=provider_message_id,
        internet_message_id=str(internet_message_id) if internet_message_id else None,
        thread_id=str(thread_id) if thread_id else None,
        message_ts=message_ts,
        sender_email=sender_email,
        sender_name=sender_name,
        to_emails=to_emails,
        cc_emails=cc_emails,
        subject=str(subject) if subject else None,
        body_preview=body_preview,
        direction=direction,
        logical_dedupe_hash=logical_hash,
        has_attachments=has_attachments,
        attachment_names=attachment_names,
        raw_metadata={
            "labels": payload.get("labels"),
            "display_url": payload.get("display_url"),
            "has_attachment": has_attachments,
        },
    )


def _counterparty_emails(event: NormalizedEmailEvent, own_emails: list[str] | None = None) -> list[str]:
    own = {item.lower() for item in (own_emails or NOVENDOR_OUTREACH_OWN_EMAILS)}
    if event.direction == "inbound":
        return [event.sender_email]
    return [email for email in event.to_emails + event.cc_emails if email.lower() not in own]


def _domain(email: str) -> str | None:
    if "@" not in email:
        return None
    return email.rsplit("@", 1)[1].lower()


def resolve_crm_links(
    *,
    business_id: UUID,
    event: NormalizedEmailEvent,
    target_account_name: str | None = None,
    target_domain: str | None = None,
) -> dict:
    """Resolve account/contact/opportunity links for a normalized email."""
    emails = _counterparty_emails(event)
    domains = sorted({d for d in [_domain(email) for email in emails] if d})
    if target_domain:
        domains.insert(0, target_domain.lower())

    with get_cursor() as cur:
        if emails:
            cur.execute(
                """
                SELECT c.crm_contact_id, c.crm_account_id, a.name AS account_name
                FROM crm_contact c
                LEFT JOIN crm_account a ON a.crm_account_id = c.crm_account_id
                WHERE c.business_id = %s
                  AND lower(c.email::text) = ANY(%s)
                ORDER BY c.is_active DESC NULLS LAST, c.created_at DESC
                LIMIT 1
                """,
                (str(business_id), emails),
            )
            row = cur.fetchone()
            if row and row.get("crm_account_id"):
                account_id = UUID(str(row["crm_account_id"]))
                contact_id = UUID(str(row["crm_contact_id"])) if row.get("crm_contact_id") else None
                return {
                    "crm_account_id": account_id,
                    "crm_contact_id": contact_id,
                    "crm_opportunity_id": _latest_opportunity_id(cur, business_id, account_id),
                    "account_name": row.get("account_name"),
                }

        if target_account_name:
            cur.execute(
                """
                SELECT crm_account_id, name
                FROM crm_account
                WHERE business_id = %s
                  AND lower(name) LIKE %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(business_id), f"%{target_account_name.lower()}%"),
            )
            row = cur.fetchone()
            if row:
                account_id = UUID(str(row["crm_account_id"]))
                return {
                    "crm_account_id": account_id,
                    "crm_contact_id": None,
                    "crm_opportunity_id": _latest_opportunity_id(cur, business_id, account_id),
                    "account_name": row.get("name"),
                }

        for domain in domains:
            cur.execute(
                """
                SELECT crm_account_id, name
                FROM crm_account
                WHERE business_id = %s
                  AND (
                    lower(coalesce(website, '')) LIKE %s
                    OR lower(name) LIKE %s
                  )
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (str(business_id), f"%{domain}%", f"%{domain.split('.')[0]}%"),
            )
            row = cur.fetchone()
            if row:
                account_id = UUID(str(row["crm_account_id"]))
                return {
                    "crm_account_id": account_id,
                    "crm_contact_id": None,
                    "crm_opportunity_id": _latest_opportunity_id(cur, business_id, account_id),
                    "account_name": row.get("name"),
                }

    return {"crm_account_id": None, "crm_contact_id": None, "crm_opportunity_id": None, "account_name": None}


def _latest_opportunity_id(cur, business_id: UUID, account_id: UUID) -> UUID | None:
    cur.execute(
        """
        SELECT crm_opportunity_id
        FROM crm_opportunity
        WHERE business_id = %s AND crm_account_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (str(business_id), str(account_id)),
    )
    row = cur.fetchone()
    return UUID(str(row["crm_opportunity_id"])) if row and row.get("crm_opportunity_id") else None


def import_email_event(
    *,
    env_id: str,
    business_id: UUID,
    event: NormalizedEmailEvent,
    target_account_name: str | None = None,
    target_domain: str | None = None,
    create_reply_task: bool = True,
) -> dict:
    links = {
        "crm_account_id": event.crm_account_id,
        "crm_contact_id": event.crm_contact_id,
        "crm_opportunity_id": event.crm_opportunity_id,
        "account_name": None,
    }
    if not links["crm_account_id"]:
        links = resolve_crm_links(
            business_id=business_id,
            event=event,
            target_account_name=target_account_name,
            target_domain=target_domain,
        )

    with get_cursor() as cur:
        cur.execute(
            """
            SELECT id, status, outreach_log_id
            FROM cro_email_source_message
            WHERE provider = %s AND mailbox = %s AND provider_message_id = %s
            LIMIT 1
            """,
            (event.provider, event.mailbox, event.provider_message_id),
        )
        existing_provider = cur.fetchone()
        if existing_provider:
            return {
                "source_message_id": str(existing_provider["id"]),
                "status": existing_provider["status"],
                "outreach_log_id": str(existing_provider["outreach_log_id"]) if existing_provider.get("outreach_log_id") else None,
                "deduped": True,
            }

        cur.execute(
            """
            SELECT id, outreach_log_id
            FROM cro_email_source_message
            WHERE env_id = %s AND business_id = %s
              AND logical_dedupe_hash = %s
              AND status = 'imported'
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (env_id, str(business_id), event.logical_dedupe_hash),
        )
        duplicate = cur.fetchone()
        if duplicate:
            source_id = _insert_source_message(
                cur, env_id=env_id, business_id=business_id, event=event, links=links,
                status="ignored", duplicate_of_source_id=duplicate["id"],
                outreach_log_id=duplicate.get("outreach_log_id"),
                error="logical_duplicate",
            )
            return {
                "source_message_id": str(source_id),
                "status": "ignored",
                "outreach_log_id": str(duplicate["outreach_log_id"]) if duplicate.get("outreach_log_id") else None,
                "deduped": True,
            }

        if not links.get("crm_account_id"):
            source_id = _insert_source_message(
                cur, env_id=env_id, business_id=business_id, event=event, links=links,
                status="ignored", error="no_crm_account_match",
            )
            return {
                "source_message_id": str(source_id),
                "status": "ignored",
                "error": "no_crm_account_match",
                "deduped": False,
            }

        source_id = _insert_source_message(
            cur, env_id=env_id, business_id=business_id, event=event, links=links, status="pending",
        )
        tenant_id = resolve_tenant_id(cur, business_id)
        crm_activity_id = _insert_crm_activity(
            cur, tenant_id=tenant_id, business_id=business_id, event=event, links=links,
        )
        outreach_log_id = _insert_outreach_log(
            cur, env_id=env_id, business_id=business_id, event=event, links=links,
            crm_activity_id=crm_activity_id,
        )
        replied_outreach_id = None
        if event.direction == "inbound":
            replied_outreach_id = _mark_prior_outbound_replied(
                cur, business_id=business_id, event=event, links=links,
            )

        cur.execute(
            """
            UPDATE cro_email_source_message
            SET status = 'imported',
                outreach_log_id = %s,
                updated_at = now()
            WHERE id = %s
            """,
            (str(outreach_log_id), str(source_id)),
        )

    task_id = None
    if create_reply_task and event.direction == "inbound":
        task_id = _create_inbound_reply_task(
            env_id=env_id,
            business_id=business_id,
            event=event,
            source_id=source_id,
            links=links,
        )

    emit_log(
        level="info",
        service="backend",
        action="outreach_email_sync.imported",
        message=f"Imported {event.direction} email from {event.sender_email}",
        context={
            "provider": event.provider,
            "source_message_id": str(source_id),
            "outreach_log_id": str(outreach_log_id),
            "crm_account_id": str(links.get("crm_account_id")),
        },
    )
    return {
        "source_message_id": str(source_id),
        "status": "imported",
        "outreach_log_id": str(outreach_log_id),
        "replied_outreach_id": str(replied_outreach_id) if replied_outreach_id else None,
        "execution_task_id": str(task_id) if task_id else None,
        "deduped": False,
    }


def _insert_source_message(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    event: NormalizedEmailEvent,
    links: dict,
    status: str,
    duplicate_of_source_id=None,
    outreach_log_id=None,
    error: str | None = None,
):
    cur.execute(
        """
        INSERT INTO cro_email_source_message
          (env_id, business_id, provider, mailbox, provider_message_id,
           internet_message_id, thread_id, logical_dedupe_hash, direction,
           message_ts, sender_email, sender_name, to_emails, cc_emails,
           subject, body_preview, has_attachments, attachment_names,
           raw_metadata_json, crm_account_id, crm_contact_id, crm_opportunity_id,
           outreach_log_id, duplicate_of_source_id, status, error)
        VALUES
          (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
           %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            env_id, str(business_id), event.provider, event.mailbox,
            event.provider_message_id, event.internet_message_id, event.thread_id,
            event.logical_dedupe_hash, event.direction, event.message_ts,
            event.sender_email, event.sender_name, event.to_emails, event.cc_emails,
            event.subject, event.body_preview, event.has_attachments,
            event.attachment_names, json.dumps(event.raw_metadata or {}),
            str(links["crm_account_id"]) if links.get("crm_account_id") else None,
            str(links["crm_contact_id"]) if links.get("crm_contact_id") else None,
            str(links["crm_opportunity_id"]) if links.get("crm_opportunity_id") else None,
            str(outreach_log_id) if outreach_log_id else None,
            str(duplicate_of_source_id) if duplicate_of_source_id else None,
            status, error,
        ),
    )
    return cur.fetchone()["id"]


def _insert_crm_activity(cur, *, tenant_id, business_id: UUID, event: NormalizedEmailEvent, links: dict):
    cur.execute(
        """
        INSERT INTO crm_activity
          (tenant_id, business_id, crm_account_id, crm_contact_id, crm_opportunity_id,
           activity_type, subject, activity_at, payload_json, direction)
        VALUES (%s, %s, %s, %s, %s, 'email', %s, %s, %s, %s)
        RETURNING crm_activity_id
        """,
        (
            tenant_id, str(business_id),
            str(links["crm_account_id"]) if links.get("crm_account_id") else None,
            str(links["crm_contact_id"]) if links.get("crm_contact_id") else None,
            str(links["crm_opportunity_id"]) if links.get("crm_opportunity_id") else None,
            event.subject or "(no subject)",
            event.message_ts,
            json.dumps({
                "body_preview": event.body_preview,
                "provider": event.provider,
                "provider_message_id": event.provider_message_id,
                "mailbox": event.mailbox,
                "sender_email": event.sender_email,
                "to_emails": event.to_emails,
                "cc_emails": event.cc_emails,
            }),
            event.direction,
        ),
    )
    row = cur.fetchone()
    return row["crm_activity_id"] if row else None


def _insert_outreach_log(
    cur,
    *,
    env_id: str,
    business_id: UUID,
    event: NormalizedEmailEvent,
    links: dict,
    crm_activity_id,
):
    cur.execute(
        """
        INSERT INTO cro_outreach_log
          (crm_activity_id, env_id, business_id, crm_account_id, crm_contact_id,
           channel, direction, subject, body_preview, sent_at, sent_by)
        VALUES (%s, %s, %s, %s, %s, 'email', %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            str(crm_activity_id) if crm_activity_id else None,
            env_id, str(business_id),
            str(links["crm_account_id"]) if links.get("crm_account_id") else None,
            str(links["crm_contact_id"]) if links.get("crm_contact_id") else None,
            event.direction, event.subject, event.body_preview, event.message_ts,
            event.sender_email,
        ),
    )
    return cur.fetchone()["id"]


def _mark_prior_outbound_replied(cur, *, business_id: UUID, event: NormalizedEmailEvent, links: dict):
    cur.execute(
        """
        UPDATE cro_outreach_log
           SET replied_at = COALESCE(replied_at, %s),
               reply_sentiment = COALESCE(reply_sentiment, 'neutral')
         WHERE id = (
            SELECT id
              FROM cro_outreach_log
             WHERE business_id = %s
               AND crm_account_id = %s
               AND direction = 'outbound'
               AND sent_at <= %s
             ORDER BY sent_at DESC
             LIMIT 1
         )
        RETURNING id
        """,
        (
            event.message_ts, str(business_id),
            str(links["crm_account_id"]) if links.get("crm_account_id") else None,
            event.message_ts,
        ),
    )
    row = cur.fetchone()
    return row["id"] if row else None


def _create_inbound_reply_task(
    *,
    env_id: str,
    business_id: UUID,
    event: NormalizedEmailEvent,
    source_id,
    links: dict,
) -> UUID | None:
    account_label = links.get("account_name") or "prospect"
    try:
        task = execution_tasks.create_task(
            env_id=env_id,
            business_id=business_id,
            title=f"Reply to {account_label}: {event.subject or '(no subject)'}",
            description=event.body_preview,
            expected_outcome="Keep the prospect conversation moving.",
            next_action=f"Respond to {event.sender_email}",
            why_now=f"Inbound email received in {event.mailbox}.",
            type="follow_up",
            status="today",
            linked_deal_id=links.get("crm_opportunity_id"),
            linked_contact_id=links.get("crm_contact_id"),
            impact=4,
            revenue_tag="mid",
            due_date=event.message_ts.date(),
            auto_source="email_inbound_reply",
            auto_source_ref=UUID(str(source_id)),
        )
    except (psycopg.errors.UniqueViolation, execution_tasks.TodayFullError):
        return None
    except Exception as exc:
        emit_log(
            level="warn",
            service="backend",
            action="outreach_email_sync.task_failed",
            message=f"Could not create inbound email task: {exc}",
            context={"source_message_id": str(source_id)},
            error=exc,
        )
        return None

    task_id = UUID(str(task["id"]))
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_email_source_message
            SET execution_task_id = %s, updated_at = now()
            WHERE id = %s
            """,
            (str(task_id), str(source_id)),
        )
    return task_id
