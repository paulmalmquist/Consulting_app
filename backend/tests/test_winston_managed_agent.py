from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import respx

from app.services.winston_managed_agent import (
    ManagedAgentProfile,
    build_session_agent_ref,
    ensure_agent,
    ensure_static_bearer_credential,
    ensure_vault,
    is_mcp_auth_session_error,
    perform_mcp_preflight,
)


class _FakeAgents:
    def __init__(self, items):
        self._items = items
        self.created = []

    def list(self, **_kwargs):
        return self._items

    def create(self, **kwargs):
        self.created.append(kwargs)
        return SimpleNamespace(id="agent_created", version=1, **kwargs)


class _FakeVaults:
    def __init__(self, items):
        self._items = items
        self.created = []

    def list(self, **_kwargs):
        return self._items

    def create(self, **kwargs):
        self.created.append(kwargs)
        return SimpleNamespace(id="vault_created", archived_at=None, **kwargs)


class _FakeCredentials:
    def __init__(self, items):
        self._items = items
        self.created = []
        self.updated = []

    def list(self, **_kwargs):
        return self._items

    def create(self, **kwargs):
        self.created.append(kwargs)
        return SimpleNamespace(
            id="cred_created",
            archived_at=None,
            auth=SimpleNamespace(mcp_server_url=kwargs["auth"]["mcp_server_url"], type=kwargs["auth"]["type"]),
            **kwargs,
        )

    def update(self, **kwargs):
        self.updated.append(kwargs)
        return SimpleNamespace(
            id=kwargs["credential_id"],
            archived_at=None,
            auth=SimpleNamespace(mcp_server_url="https://example.com/mcp", type="static_bearer"),
            vault_id=kwargs["vault_id"],
            display_name=kwargs.get("display_name"),
            metadata=kwargs.get("metadata"),
        )


class _FakeClient:
    def __init__(self, *, agents=None, vaults=None, credentials=None):
        self.beta = SimpleNamespace(
            agents=agents,
            vaults=SimpleNamespace(
                list=vaults.list,
                create=vaults.create,
                credentials=credentials,
            ),
        )


def _profile(tmp_path):
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(
        json.dumps(
            {
                "agent": {
                    "name": "Winston Managed Agent",
                    "description": "operator",
                    "model": "claude-sonnet-4-6",
                    "metadata": {"managed_by": "consulting_app", "integration": "winston_managed_agent_v1"},
                    "system": "You are Winston.",
                },
                "environment": {
                    "name": "env",
                    "description": "cloud",
                    "metadata": {"managed_by": "consulting_app"},
                    "config": {"type": "cloud", "networking": {"type": "unrestricted"}},
                },
                "vault": {
                    "display_name": "vault",
                    "metadata": {"managed_by": "consulting_app"},
                    "credential": {"display_name": "cred", "metadata": {"managed_by": "consulting_app"}},
                },
                "mcp_server": {"name": "winston", "url": "https://example.com/mcp"},
            }
        )
    )
    return ManagedAgentProfile.load(profile_path)


def test_ensure_agent_reuses_matching_resource(tmp_path):
    profile = _profile(tmp_path)
    existing = SimpleNamespace(
        id="agent_123",
        archived_at=None,
        name=profile.agent_name,
        metadata=dict(profile.agent_metadata),
        version=7,
    )
    fake_agents = _FakeAgents([existing])
    client = _FakeClient(
        agents=fake_agents,
        vaults=_FakeVaults([]),
        credentials=_FakeCredentials([]),
    )

    agent, action = ensure_agent(client, profile)

    assert action == "reused"
    assert agent.id == "agent_123"
    assert fake_agents.created == []


def test_ensure_vault_reuses_matching_resource(tmp_path):
    profile = _profile(tmp_path)
    existing = SimpleNamespace(
        id="vlt_123",
        archived_at=None,
        display_name=profile.vault_name,
        metadata=dict(profile.vault_metadata),
    )
    fake_vaults = _FakeVaults([existing])
    client = _FakeClient(
        agents=_FakeAgents([]),
        vaults=fake_vaults,
        credentials=_FakeCredentials([]),
    )

    vault, action = ensure_vault(client, profile)

    assert action == "reused"
    assert vault.id == "vlt_123"
    assert fake_vaults.created == []


def test_existing_credential_is_rotated_for_same_mcp_url(tmp_path):
    profile = _profile(tmp_path)
    credentials = _FakeCredentials(
        [
            SimpleNamespace(
                id="cred_123",
                archived_at=None,
                auth=SimpleNamespace(mcp_server_url="https://example.com/mcp", type="static_bearer"),
            )
        ]
    )
    client = _FakeClient(
        agents=_FakeAgents([]),
        vaults=_FakeVaults([]),
        credentials=credentials,
    )

    credential, action = ensure_static_bearer_credential(
        client,
        vault_id="vlt_123",
        mcp_url="https://example.com/mcp",
        token="secret-token",
        display_name="Winston MCP",
        metadata={"managed_by": "consulting_app"},
    )

    assert action == "updated"
    assert credential.id == "cred_123"
    assert credentials.created == []
    assert credentials.updated[0]["auth"] == {"type": "static_bearer", "token": "secret-token"}


@respx.mock
def test_perform_mcp_preflight_verifies_streamable_http_shape():
    mcp_url = "https://example.com/mcp"
    respx.get("https://example.com/mcp/health").respond(200, json={"status": "ok", "server": "winston-mcp"})

    def _rpc(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {"listChanged": False}},
                        "serverInfo": {"name": "winston-mcp", "version": "0.2.0"},
                    },
                },
            )
        if body["method"] == "notifications/initialized":
            return httpx.Response(200, json={"jsonrpc": "2.0", "result": "ok"})
        if body["method"] == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "result": {"tools": [{"name": "bm.describe_system"}, {"name": "bm.list_tools"}]},
                },
            )
        raise AssertionError(f"Unexpected method: {body['method']}")

    respx.post(mcp_url).mock(side_effect=_rpc)

    result = perform_mcp_preflight(mcp_url, token="token")

    assert result.ok is True
    assert result.server_name == "winston-mcp"
    assert result.protocol_version == "2024-11-05"
    assert result.tools_count == 2
    assert result.steps[-1].name == "streamable_http_compatibility"
    assert result.steps[-1].ok is True


def test_mcp_auth_errors_are_detected_from_session_error_events():
    event = {
        "type": "session.error",
        "error": {
            "type": "mcp_authentication_failed_error",
            "mcp_server_name": "winston",
            "message": "Invalid bearer token",
            "retry_status": {"type": "exhausted"},
        },
    }

    assert is_mcp_auth_session_error(event) is True


def test_build_session_agent_ref_supports_latest_and_pinned_versions():
    assert build_session_agent_ref("agent_123", None) == "agent_123"
    assert build_session_agent_ref("agent_123", 3) == {
        "id": "agent_123",
        "type": "agent",
        "version": 3,
    }
