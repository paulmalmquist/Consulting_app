"""Tests for normalized Novendor outreach email imports."""

import uuid
from datetime import datetime, timezone

from app.services import outreach_email_sync


ENV_ID = "test-env"
BUSINESS_ID = uuid.uuid4()
TENANT_ID = uuid.uuid4()
ACCOUNT_ID = uuid.uuid4()
CONTACT_ID = uuid.uuid4()
OPP_ID = uuid.uuid4()
SOURCE_ID = uuid.uuid4()
ACTIVITY_ID = uuid.uuid4()
OUTREACH_ID = uuid.uuid4()
MESSAGE_TS = datetime(2026, 4, 30, 19, 44, 58, tzinfo=timezone.utc)


def test_normalize_gmail_payload_detects_outbound():
    event = outreach_email_sync.normalize_provider_payload(
        {
            "id": "gmail-1",
            "from_": "Paul Malmquist <info@novendor.ai>",
            "to": ["Sarat Vemuri <saratvemuri@hallboys.com>"],
            "cc": ["Paul <paulmalmquist@gmail.com>"],
            "subject": "Re: Novendor / Hallboys Questionnaire",
            "body": "Sarat, what day works best?",
            "email_ts": "2026-04-30T19:44:58Z",
        },
        provider="gmail",
        mailbox="info@novendor.ai",
    )

    assert event.direction == "outbound"
    assert event.sender_email == "info@novendor.ai"
    assert event.to_emails == ["saratvemuri@hallboys.com"]
    assert event.message_ts == MESSAGE_TS


def test_logical_hash_prefers_internet_message_id_across_providers():
    gmail = outreach_email_sync.normalize_provider_payload(
        {
            "id": "gmail-1",
            "internet_message_id": "<abc@novendor.ai>",
            "from_": "Paul <info@novendor.ai>",
            "to": ["saratvemuri@hallboys.com"],
            "subject": "Questionnaire",
            "body": "Body",
            "email_ts": "2026-04-28T02:25:20Z",
        },
        provider="gmail",
        mailbox="info@novendor.ai",
    )
    graph = outreach_email_sync.normalize_provider_payload(
        {
            "id": "graph-1",
            "internetMessageId": "<abc@novendor.ai>",
            "from": {"emailAddress": {"address": "info@novendor.ai", "name": "Paul"}},
            "toRecipients": [{"emailAddress": {"address": "saratvemuri@hallboys.com"}}],
            "subject": "Re: Questionnaire",
            "bodyPreview": "Body",
            "sentDateTime": "2026-04-28T02:25:20Z",
        },
        provider="msgraph",
        mailbox="info@novendor.ai",
    )

    assert gmail.logical_dedupe_hash == graph.logical_dedupe_hash


def test_import_email_event_preserves_timestamp_and_direction(fake_cursor):
    event = outreach_email_sync.NormalizedEmailEvent(
        provider="gmail",
        mailbox="info@novendor.ai",
        provider_message_id="gmail-inbound-1",
        message_ts=MESSAGE_TS,
        sender_email="saratvemuri@hallboys.com",
        sender_name="Sarat Vemuri",
        to_emails=["info@novendor.ai"],
        cc_emails=[],
        subject="Re: Novendor / Hallboys Questionnaire",
        body_preview="Let's meet next week.",
        direction="inbound",
        logical_dedupe_hash="hash-1",
        crm_account_id=ACCOUNT_ID,
        crm_contact_id=CONTACT_ID,
        crm_opportunity_id=OPP_ID,
    )
    fake_cursor.push_result([])  # existing provider
    fake_cursor.push_result([])  # duplicate logical hash
    fake_cursor.push_result([{"id": SOURCE_ID}])  # source insert
    fake_cursor.push_result([{"tenant_id": TENANT_ID}])  # tenant
    fake_cursor.push_result([{"crm_activity_id": ACTIVITY_ID}])
    fake_cursor.push_result([{"id": OUTREACH_ID}])
    fake_cursor.push_result([])  # prior outbound update

    result = outreach_email_sync.import_email_event(
        env_id=ENV_ID,
        business_id=BUSINESS_ID,
        event=event,
        create_reply_task=False,
    )

    assert result["status"] == "imported"
    assert result["outreach_log_id"] == str(OUTREACH_ID)
    outreach_insert = next(sql for sql, _ in fake_cursor.queries if "INSERT INTO cro_outreach_log" in sql)
    assert "sent_at" in outreach_insert
    assert any(params and "inbound" in params for _, params in fake_cursor.queries)
