"""Tests for email integration webhooks."""

from app.services import msgraph_email_sync


def test_msgraph_webhook_echoes_validation_token(client):
    response = client.post("/api/integrations/email/msgraph/webhook?validationToken=opaque-token")

    assert response.status_code == 200
    assert response.text == "opaque-token"
    assert response.headers["content-type"].startswith("text/plain")


def test_msgraph_webhook_rejects_bad_client_state(client, monkeypatch):
    monkeypatch.setattr(msgraph_email_sync, "MSGRAPH_WEBHOOK_CLIENT_STATE", "expected-secret")

    response = client.post(
        "/api/integrations/email/msgraph/webhook",
        json={"value": [{"clientState": "wrong"}]},
    )

    assert response.status_code == 403


def test_msgraph_webhook_accepts_valid_notification(client, monkeypatch):
    calls = []
    monkeypatch.setattr(msgraph_email_sync, "MSGRAPH_WEBHOOK_CLIENT_STATE", "expected-secret")
    monkeypatch.setattr(
        msgraph_email_sync,
        "process_notification_collection",
        lambda payload: calls.append(payload),
    )

    response = client.post(
        "/api/integrations/email/msgraph/webhook",
        json={"value": [{"clientState": "expected-secret", "resourceData": {"id": "msg-1"}}]},
    )

    assert response.status_code == 202
    assert response.json() == {"accepted": True}
    assert calls and calls[0]["value"][0]["resourceData"]["id"] == "msg-1"


def test_msgraph_lifecycle_reauthorization_renews(monkeypatch):
    calls = []
    monkeypatch.setattr(msgraph_email_sync, "MSGRAPH_WEBHOOK_CLIENT_STATE", "expected-secret")
    monkeypatch.setattr(msgraph_email_sync, "renew_subscription", lambda subscription_id: calls.append(subscription_id))

    result = msgraph_email_sync.process_notification_collection(
        {
            "value": [
                {
                    "clientState": "expected-secret",
                    "subscriptionId": "sub-1",
                    "lifecycleEvent": "reauthorizationRequired",
                }
            ]
        }
    )

    assert result["lifecycle"] == {"handled": 1, "errors": 0}
    assert calls == ["sub-1"]


def test_msgraph_lifecycle_removed_recovers(monkeypatch):
    calls = []
    monkeypatch.setattr(msgraph_email_sync, "MSGRAPH_WEBHOOK_CLIENT_STATE", "expected-secret")
    monkeypatch.setattr(msgraph_email_sync, "recover_subscription", lambda subscription_id: calls.append(subscription_id))

    result = msgraph_email_sync.process_notification_collection(
        {
            "value": [
                {
                    "clientState": "expected-secret",
                    "subscriptionId": "sub-2",
                    "lifecycleEvent": "subscriptionRemoved",
                }
            ]
        }
    )

    assert result["lifecycle"] == {"handled": 1, "errors": 0}
    assert calls == ["sub-2"]
