"""
Messaging Service — Twilio SMS + SendGrid Email
=================================================

Thin wrapper around Twilio REST API and SendGrid v3 API.
Each function returns delivery metadata for storage in dc_message_events.
"""

from __future__ import annotations

import os
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config — loaded from environment
# ---------------------------------------------------------------------------

def _twilio_config() -> dict[str, str]:
    return {
        "account_sid": os.environ.get("TWILIO_ACCOUNT_SID", ""),
        "auth_token": os.environ.get("TWILIO_AUTH_TOKEN", ""),
        "from_number": os.environ.get("TWILIO_FROM_NUMBER", ""),
    }


def _sendgrid_config() -> dict[str, str]:
    return {
        "api_key": os.environ.get("SENDGRID_API_KEY", ""),
        "from_email": os.environ.get("SENDGRID_FROM_EMAIL", "noreply@novendor.com"),
        "from_name": os.environ.get("SENDGRID_FROM_NAME", "Document Completion"),
    }


# ---------------------------------------------------------------------------
# SMS via Twilio
# ---------------------------------------------------------------------------

def send_sms(*, to: str, body: str, from_number: str | None = None) -> dict[str, Any]:
    """Send an SMS via Twilio REST API.

    Returns dict with: success, external_message_id, error
    """
    cfg = _twilio_config()
    if not cfg["account_sid"] or not cfg["auth_token"]:
        logger.warning("Twilio not configured — SMS not sent to %s", to)
        return {"success": False, "external_message_id": None, "error": "twilio_not_configured"}

    try:
        from twilio.rest import Client  # type: ignore[import-untyped]
        client = Client(cfg["account_sid"], cfg["auth_token"])
        message = client.messages.create(
            body=body,
            from_=from_number or cfg["from_number"],
            to=to,
        )
        logger.info("SMS sent to %s — SID: %s", to, message.sid)
        return {
            "success": True,
            "external_message_id": message.sid,
            "error": None,
        }
    except Exception as exc:
        logger.error("SMS send failed to %s: %s", to, exc)
        return {
            "success": False,
            "external_message_id": None,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Email via SendGrid
# ---------------------------------------------------------------------------

def send_email(
    *,
    to: str,
    subject: str,
    html_body: str,
    from_email: str | None = None,
    from_name: str | None = None,
) -> dict[str, Any]:
    """Send an email via SendGrid v3 API.

    Returns dict with: success, external_message_id, error
    """
    cfg = _sendgrid_config()
    if not cfg["api_key"]:
        logger.warning("SendGrid not configured — email not sent to %s", to)
        return {"success": False, "external_message_id": None, "error": "sendgrid_not_configured"}

    try:
        import sendgrid  # type: ignore[import-untyped]
        from sendgrid.helpers.mail import Mail, Email, To, Content  # type: ignore[import-untyped]

        sg = sendgrid.SendGridAPIClient(api_key=cfg["api_key"])
        mail = Mail(
            from_email=Email(from_email or cfg["from_email"], from_name or cfg["from_name"]),
            to_emails=To(to),
            subject=subject,
            html_content=Content("text/html", html_body),
        )
        response = sg.client.mail.send.post(request_body=mail.get())
        msg_id = None
        if hasattr(response, "headers") and "X-Message-Id" in response.headers:
            msg_id = response.headers["X-Message-Id"]
        logger.info("Email sent to %s — status: %s", to, getattr(response, "status_code", "unknown"))
        return {
            "success": True,
            "external_message_id": msg_id,
            "error": None,
        }
    except Exception as exc:
        logger.error("Email send failed to %s: %s", to, exc)
        return {
            "success": False,
            "external_message_id": None,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Message templates
# ---------------------------------------------------------------------------

# Standard doc display names for human-friendly messaging
DOC_TYPE_DISPLAY: dict[str, str] = {
    "government_id": "Government-issued ID",
    "pay_stub": "Recent pay stub",
    "bank_statement": "Bank statement (last 2 months)",
    "tax_return": "Tax return (most recent year)",
    "w2": "W-2 form",
    "proof_of_insurance": "Proof of insurance",
    "employment_verification": "Employment verification letter",
    "proof_of_address": "Proof of address",
    "credit_authorization": "Credit authorization form",
    "purchase_agreement": "Purchase agreement",
    "gift_letter": "Gift letter",
    "divorce_decree": "Divorce decree",
}


def compose_initial_sms(
    *,
    borrower_first_name: str,
    missing_docs: list[str],
    upload_url: str,
) -> str:
    count = len(missing_docs)
    doc_list = ", ".join(DOC_TYPE_DISPLAY.get(d, d.replace("_", " ")) for d in missing_docs[:3])
    if count > 3:
        doc_list += f", and {count - 3} more"
    return (
        f"Hi {borrower_first_name}, we're missing {count} item(s) to continue your loan file: "
        f"{doc_list}. Upload them here: {upload_url}"
    )


def compose_followup_sms(
    *,
    borrower_first_name: str,
    missing_docs: list[str],
    upload_url: str,
    followup_number: int,
) -> str:
    count = len(missing_docs)
    if followup_number <= 1:
        tone = "Just a friendly reminder"
    elif followup_number == 2:
        tone = "We still need"
    else:
        tone = "Urgent reminder — we're still waiting on"

    doc_list = ", ".join(DOC_TYPE_DISPLAY.get(d, d.replace("_", " ")) for d in missing_docs[:3])
    if count > 3:
        doc_list += f", and {count - 3} more"
    return f"{tone}: {count} document(s) for your loan file — {doc_list}. Upload here: {upload_url}"


def compose_initial_email(
    *,
    borrower_first_name: str,
    missing_docs: list[str],
    upload_url: str,
    lender_name: str = "Your Lender",
    support_email: str = "",
) -> tuple[str, str]:
    """Returns (subject, html_body)."""
    subject = "Documents needed to complete your loan file"
    doc_items = "".join(
        f"<li>{DOC_TYPE_DISPLAY.get(d, d.replace('_', ' '))}</li>"
        for d in missing_docs
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Documents Needed for Your Loan File</h2>
        <p>Hi {borrower_first_name},</p>
        <p>To continue processing your loan application with {lender_name},
        we need the following documents:</p>
        <ul style="line-height: 1.8;">{doc_items}</ul>
        <p>These documents help us verify your information and move your
        application forward.</p>
        <p style="margin: 24px 0;">
            <a href="{upload_url}"
               style="background-color: #2563eb; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
                Upload Documents
            </a>
        </p>
        <p style="font-size: 13px; color: #666;">
            This link will expire in 72 hours.
            {f'If you have questions, contact us at {support_email}.' if support_email else ''}
        </p>
    </div>
    """
    return subject, html


def compose_followup_email(
    *,
    borrower_first_name: str,
    missing_docs: list[str],
    upload_url: str,
    followup_number: int,
    lender_name: str = "Your Lender",
) -> tuple[str, str]:
    """Returns (subject, html_body)."""
    if followup_number <= 1:
        subject = "Reminder: Documents still needed for your loan"
        tone = "This is a friendly reminder that"
    elif followup_number == 2:
        subject = "Action needed: Missing loan documents"
        tone = "We still haven't received"
    else:
        subject = "Urgent: Your loan file is incomplete"
        tone = "Your loan application cannot proceed without"

    doc_items = "".join(
        f"<li>{DOC_TYPE_DISPLAY.get(d, d.replace('_', ' '))}</li>"
        for d in missing_docs
    )
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">{'Reminder' if followup_number <= 1 else 'Action Needed'}: Missing Documents</h2>
        <p>Hi {borrower_first_name},</p>
        <p>{tone} the following documents for your loan with {lender_name}:</p>
        <ul style="line-height: 1.8;">{doc_items}</ul>
        <p style="margin: 24px 0;">
            <a href="{upload_url}"
               style="background-color: #2563eb; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
                Upload Now
            </a>
        </p>
    </div>
    """
    return subject, html
