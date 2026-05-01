"""Microsoft Graph mailbox subscription helpers for Novendor outreach."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx

from app.config import (
    MSGRAPH_CLIENT_ID,
    MSGRAPH_CLIENT_SECRET,
    MSGRAPH_LIFECYCLE_NOTIFICATION_URL,
    MSGRAPH_NOTIFICATION_URL,
    MSGRAPH_TENANT_ID,
    MSGRAPH_WEBHOOK_CLIENT_STATE,
    NOVENDOR_OUTREACH_BUSINESS_ID,
    NOVENDOR_OUTREACH_ENV_ID,
    NOVENDOR_OUTREACH_MAILBOX,
)
from app.db import get_cursor
from app.observability.logger import emit_log
from app.services.outreach_email_sync import import_email_event, normalize_provider_payload


GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"


def _require_graph_config() -> None:
    missing = [
        name for name, value in [
            ("MSGRAPH_TENANT_ID", MSGRAPH_TENANT_ID),
            ("MSGRAPH_CLIENT_ID", MSGRAPH_CLIENT_ID),
            ("MSGRAPH_CLIENT_SECRET", MSGRAPH_CLIENT_SECRET),
            ("MSGRAPH_NOTIFICATION_URL", MSGRAPH_NOTIFICATION_URL),
            ("MSGRAPH_WEBHOOK_CLIENT_STATE", MSGRAPH_WEBHOOK_CLIENT_STATE),
        ] if not value
    ]
    if missing:
        raise RuntimeError(f"Missing Microsoft Graph config: {', '.join(missing)}")


def _client_state_hash(client_state: str) -> str:
    return hashlib.sha256(client_state.encode("utf-8")).hexdigest()


def validate_client_state(payload: dict[str, Any]) -> bool:
    expected = MSGRAPH_WEBHOOK_CLIENT_STATE
    if not expected:
        return False
    for item in payload.get("value") or []:
        if item.get("clientState") != expected:
            return False
    return True


def get_access_token() -> str:
    _require_graph_config()
    token_url = f"https://login.microsoftonline.com/{MSGRAPH_TENANT_ID}/oauth2/v2.0/token"
    with httpx.Client(timeout=20) as client:
        resp = client.post(
            token_url,
            data={
                "client_id": MSGRAPH_CLIENT_ID,
                "client_secret": MSGRAPH_CLIENT_SECRET,
                "scope": GRAPH_SCOPE,
                "grant_type": "client_credentials",
            },
        )
        resp.raise_for_status()
        return str(resp.json()["access_token"])


def _graph_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def subscription_resource(mailbox: str = NOVENDOR_OUTREACH_MAILBOX, inbox_only: bool = True) -> str:
    if inbox_only:
        return f"users/{mailbox}/mailFolders('inbox')/messages"
    return f"users/{mailbox}/messages"


def build_subscription_payload(
    *,
    mailbox: str = NOVENDOR_OUTREACH_MAILBOX,
    resource: str | None = None,
    expiration_at: datetime | None = None,
) -> dict[str, Any]:
    _require_graph_config()
    expires = expiration_at or (datetime.now(timezone.utc) + timedelta(days=6))
    payload = {
        "changeType": "created",
        "notificationUrl": MSGRAPH_NOTIFICATION_URL,
        "resource": resource or subscription_resource(mailbox),
        "expirationDateTime": expires.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "clientState": MSGRAPH_WEBHOOK_CLIENT_STATE,
    }
    if MSGRAPH_LIFECYCLE_NOTIFICATION_URL:
        payload["lifecycleNotificationUrl"] = MSGRAPH_LIFECYCLE_NOTIFICATION_URL
    return payload


def create_subscription(
    *,
    env_id: str = NOVENDOR_OUTREACH_ENV_ID,
    business_id: UUID | str = NOVENDOR_OUTREACH_BUSINESS_ID,
    mailbox: str = NOVENDOR_OUTREACH_MAILBOX,
    resource: str | None = None,
) -> dict[str, Any]:
    token = get_access_token()
    payload = build_subscription_payload(mailbox=mailbox, resource=resource)
    with httpx.Client(timeout=20) as client:
        resp = client.post(f"{GRAPH_BASE_URL}/subscriptions", headers=_graph_headers(token), json=payload)
        resp.raise_for_status()
        subscription = resp.json()
    _upsert_subscription(env_id=env_id, business_id=UUID(str(business_id)), mailbox=mailbox, subscription=subscription)
    return subscription


def renew_subscription(subscription_id: str, *, expiration_at: datetime | None = None) -> dict[str, Any]:
    token = get_access_token()
    expires = expiration_at or (datetime.now(timezone.utc) + timedelta(days=6))
    payload = {"expirationDateTime": expires.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")}
    with httpx.Client(timeout=20) as client:
        resp = client.patch(
            f"{GRAPH_BASE_URL}/subscriptions/{subscription_id}",
            headers=_graph_headers(token),
            json=payload,
        )
        resp.raise_for_status()
        subscription = resp.json()
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_email_sync_subscription
            SET expiration_at = %s,
                status = 'active',
                last_renewed_at = now(),
                error = NULL,
                updated_at = now()
            WHERE subscription_id = %s
            """,
            (_parse_graph_dt(subscription.get("expirationDateTime")), subscription_id),
        )
    return subscription


def recover_subscription(subscription_id: str) -> dict[str, Any]:
    """Recreate a removed subscription using the stored mailbox when possible."""
    mailbox = NOVENDOR_OUTREACH_MAILBOX
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT mailbox
            FROM cro_email_sync_subscription
            WHERE subscription_id = %s
            LIMIT 1
            """,
            (subscription_id,),
        )
        row = cur.fetchone()
        if row and row.get("mailbox"):
            mailbox = str(row["mailbox"])
        cur.execute(
            """
            UPDATE cro_email_sync_subscription
            SET status = 'removed',
                error = 'subscription_removed',
                updated_at = now()
            WHERE subscription_id = %s
            """,
            (subscription_id,),
        )
    return create_subscription(mailbox=mailbox)


def _upsert_subscription(*, env_id: str, business_id: UUID, mailbox: str, subscription: dict[str, Any]) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_email_sync_subscription
              (env_id, business_id, provider, mailbox, graph_user_id,
               subscription_id, resource, change_type, client_state_hash,
               notification_url, lifecycle_notification_url, expiration_at,
               status, last_renewed_at)
            VALUES (%s, %s, 'msgraph', %s, %s, %s, %s, %s, %s, %s, %s, %s, 'active', now())
            ON CONFLICT (subscription_id) DO UPDATE SET
               resource = EXCLUDED.resource,
               expiration_at = EXCLUDED.expiration_at,
               status = 'active',
               last_renewed_at = now(),
               error = NULL,
               updated_at = now()
            """,
            (
                env_id, str(business_id), mailbox, subscription.get("creatorId"),
                subscription.get("id"), subscription.get("resource"),
                subscription.get("changeType", "created"),
                _client_state_hash(MSGRAPH_WEBHOOK_CLIENT_STATE),
                subscription.get("notificationUrl") or MSGRAPH_NOTIFICATION_URL,
                subscription.get("lifecycleNotificationUrl") or MSGRAPH_LIFECYCLE_NOTIFICATION_URL or None,
                _parse_graph_dt(subscription.get("expirationDateTime")),
            ),
        )


def _parse_graph_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def fetch_message(message_id: str, *, mailbox: str = NOVENDOR_OUTREACH_MAILBOX) -> dict[str, Any]:
    token = get_access_token()
    encoded = quote(message_id, safe="")
    select = "id,conversationId,internetMessageId,subject,bodyPreview,from,sender,toRecipients,ccRecipients,receivedDateTime,sentDateTime,hasAttachments"
    url = f"{GRAPH_BASE_URL}/users/{mailbox}/messages/{encoded}?$select={select}"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url, headers=_graph_headers(token))
        resp.raise_for_status()
        return resp.json()


def _message_id_from_notification(item: dict[str, Any]) -> str | None:
    resource_data = item.get("resourceData") or {}
    if resource_data.get("id"):
        return str(resource_data["id"])
    resource = str(item.get("resource") or "")
    if "/messages/" in resource:
        return resource.rsplit("/messages/", 1)[1]
    if "/Messages/" in resource:
        return resource.rsplit("/Messages/", 1)[1]
    return None


def process_notification_collection(payload: dict[str, Any]) -> dict[str, Any]:
    """Fetch and import messages referenced by a Graph notification payload."""
    if not validate_client_state(payload):
        emit_log(
            level="warn",
            service="backend",
            action="msgraph.webhook.client_state_invalid",
            message="Rejected Microsoft Graph notification with invalid clientState",
            context={},
        )
        return {"processed": 0, "rejected": True}

    lifecycle_result = _process_lifecycle_notifications(payload.get("value") or [])
    processed = 0
    errors = 0
    for item in payload.get("value") or []:
        if item.get("lifecycleEvent"):
            continue
        subscription_id = item.get("subscriptionId")
        message_id = _message_id_from_notification(item)
        if not message_id:
            continue
        try:
            graph_message = fetch_message(message_id)
            event = normalize_provider_payload(
                graph_message,
                provider="msgraph",
                mailbox=NOVENDOR_OUTREACH_MAILBOX,
            )
            import_email_event(
                env_id=NOVENDOR_OUTREACH_ENV_ID,
                business_id=UUID(NOVENDOR_OUTREACH_BUSINESS_ID),
                event=event,
            )
            processed += 1
        except Exception as exc:
            errors += 1
            emit_log(
                level="error",
                service="backend",
                action="msgraph.webhook.process_error",
                message=f"Failed to process Microsoft Graph message notification: {exc}",
                context={"subscription_id": subscription_id, "message_id": message_id},
                error=exc,
            )
        finally:
            if subscription_id:
                _mark_subscription_notified(str(subscription_id))
    return {
        "processed": processed,
        "errors": errors + lifecycle_result["errors"],
        "rejected": False,
        "lifecycle": lifecycle_result,
    }


def _process_lifecycle_notifications(items: list[dict[str, Any]]) -> dict[str, int]:
    handled = 0
    errors = 0
    for item in items:
        lifecycle_event = item.get("lifecycleEvent")
        if not lifecycle_event:
            continue
        subscription_id = item.get("subscriptionId")
        try:
            if lifecycle_event == "reauthorizationRequired" and subscription_id:
                renew_subscription(str(subscription_id))
            elif lifecycle_event == "subscriptionRemoved" and subscription_id:
                recover_subscription(str(subscription_id))
            elif lifecycle_event == "missed" and subscription_id:
                _mark_subscription_status(
                    str(subscription_id),
                    status="error",
                    error="missed_notifications_resync_required",
                )
            else:
                emit_log(
                    level="warn",
                    service="backend",
                    action="msgraph.webhook.lifecycle_unhandled",
                    message=f"Unhandled Microsoft Graph lifecycle event: {lifecycle_event}",
                    context={"subscription_id": subscription_id},
                )
            handled += 1
        except Exception as exc:
            errors += 1
            emit_log(
                level="error",
                service="backend",
                action="msgraph.webhook.lifecycle_error",
                message=f"Failed to process Microsoft Graph lifecycle event: {exc}",
                context={"subscription_id": subscription_id, "lifecycle_event": lifecycle_event},
                error=exc,
            )
    return {"handled": handled, "errors": errors}


def _mark_subscription_notified(subscription_id: str) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_email_sync_subscription
            SET last_notification_at = now(), updated_at = now()
            WHERE subscription_id = %s
            """,
            (subscription_id,),
        )


def _mark_subscription_status(subscription_id: str, *, status: str, error: str | None = None) -> None:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE cro_email_sync_subscription
            SET status = %s,
                error = %s,
                updated_at = now()
            WHERE subscription_id = %s
            """,
            (status, error, subscription_id),
        )
