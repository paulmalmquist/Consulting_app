from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

import httpx


MANAGED_AGENTS_BETA = "managed-agents-2026-04-01"
DEFAULT_PRODUCTION_MCP_URL = "https://authentic-sparkle-production-7f37.up.railway.app/mcp"
DEFAULT_PROFILE_PATH = "scripts/winston_managed_agent_profile.json"
DEFAULT_STATE_PATH = "scripts/.winston_managed_agent_state.json"
DEFAULT_SMOKE_PROMPT = (
    "Use Winston MCP tools to run bm.describe_system and bm.list_tools, then report the "
    "backend version, whether writes are enabled, and list five available tool names."
)


class ManagedAgentError(RuntimeError):
    """Base error for Winston Managed Agent operator workflows."""


class MCPPreflightError(ManagedAgentError):
    """Raised when the Winston MCP endpoint fails compatibility checks."""


class SessionStreamError(ManagedAgentError):
    """Raised when a managed-agent session surfaces a hard runtime error."""


@dataclass(frozen=True)
class ToolConfirmationDecision:
    result: str
    deny_message: str | None = None


@dataclass(frozen=True)
class ManagedAgentProfile:
    profile_path: Path
    agent_name: str
    agent_description: str
    agent_metadata: dict[str, str]
    agent_system: str
    agent_model: str
    environment_name: str
    environment_description: str
    environment_metadata: dict[str, str]
    environment_config: dict[str, Any]
    vault_name: str
    vault_metadata: dict[str, str]
    credential_display_name: str
    credential_metadata: dict[str, str]
    mcp_server_name: str
    mcp_url: str
    smoke_prompt: str
    pinned_agent_version: int | None = None

    @classmethod
    def load(
        cls,
        profile_path: str | Path | None = None,
        *,
        env: Mapping[str, str] | None = None,
    ) -> "ManagedAgentProfile":
        environment = env or os.environ
        resolved_path = Path(profile_path or repo_root() / DEFAULT_PROFILE_PATH)
        payload = json.loads(resolved_path.read_text())

        def _metadata(value: Mapping[str, Any] | None) -> dict[str, str]:
            return {
                str(key): str(item)
                for key, item in (value or {}).items()
                if item is not None
            }

        default_mcp_url = (
            payload.get("mcp_server", {}).get("url")
            or DEFAULT_PRODUCTION_MCP_URL
        )
        version_raw = environment.get("WINSTON_MANAGED_AGENT_VERSION") or payload.get("agent", {}).get("version")
        version = int(version_raw) if version_raw else None

        return cls(
            profile_path=resolved_path,
            agent_name=environment.get("WINSTON_MANAGED_AGENT_NAME", payload["agent"]["name"]),
            agent_description=payload["agent"].get("description", ""),
            agent_metadata=_metadata(payload["agent"].get("metadata")),
            agent_system=payload["agent"]["system"],
            agent_model=environment.get("WINSTON_MANAGED_AGENT_MODEL", payload["agent"]["model"]),
            environment_name=environment.get("WINSTON_MANAGED_ENV_NAME", payload["environment"]["name"]),
            environment_description=payload["environment"].get("description", ""),
            environment_metadata=_metadata(payload["environment"].get("metadata")),
            environment_config=payload["environment"]["config"],
            vault_name=environment.get("WINSTON_MANAGED_VAULT_NAME", payload["vault"]["display_name"]),
            vault_metadata=_metadata(payload["vault"].get("metadata")),
            credential_display_name=payload["vault"]["credential"]["display_name"],
            credential_metadata=_metadata(payload["vault"]["credential"].get("metadata")),
            mcp_server_name=payload["mcp_server"]["name"],
            mcp_url=environment.get("WINSTON_MANAGED_MCP_URL", default_mcp_url),
            smoke_prompt=payload.get("smoke_prompt", DEFAULT_SMOKE_PROMPT),
            pinned_agent_version=version,
        )

    def agent_create_params(self) -> dict[str, Any]:
        return {
            "name": self.agent_name,
            "description": self.agent_description,
            "metadata": self.agent_metadata,
            "model": self.agent_model,
            "system": self.agent_system,
            "mcp_servers": [
                {
                    "type": "url",
                    "name": self.mcp_server_name,
                    "url": self.mcp_url,
                }
            ],
            "tools": [
                {"type": "agent_toolset_20260401"},
                {
                    "type": "mcp_toolset",
                    "mcp_server_name": self.mcp_server_name,
                    "default_config": {
                        "enabled": True,
                        "permission_policy": {"type": "always_ask"},
                    },
                },
            ],
        }

    def environment_create_params(self) -> dict[str, Any]:
        return {
            "name": self.environment_name,
            "description": self.environment_description,
            "metadata": self.environment_metadata,
            "config": self.environment_config,
        }


@dataclass(frozen=True)
class MCPPreflightStep:
    name: str
    ok: bool
    status_code: int | None = None
    detail: str | None = None
    payload: dict[str, Any] | None = None


@dataclass(frozen=True)
class MCPPreflightResult:
    mcp_url: str
    server_name: str | None
    protocol_version: str | None
    tools_count: int
    steps: list[MCPPreflightStep] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(step.ok for step in self.steps)

    def to_dict(self) -> dict[str, Any]:
        return {
            "mcp_url": self.mcp_url,
            "server_name": self.server_name,
            "protocol_version": self.protocol_version,
            "tools_count": self.tools_count,
            "ok": self.ok,
            "steps": [asdict(step) for step in self.steps],
        }

    def raise_for_failure(self) -> None:
        if self.ok:
            return
        failed = [
            f"{step.name}: {step.detail or 'failed'}"
            for step in self.steps
            if not step.ok
        ]
        raise MCPPreflightError(
            "Winston MCP preflight failed. "
            + "; ".join(failed)
        )


@dataclass(frozen=True)
class SessionTurnResult:
    session_id: str
    transcript: str
    tool_uses: list[dict[str, Any]]
    event_count: int
    final_status: str | None
    stop_reason_type: str | None
    session_snapshot: dict[str, Any]
    errors: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_state_path() -> Path:
    return repo_root() / DEFAULT_STATE_PATH


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_anthropic_client(api_key: str | None = None) -> Any:
    try:
        from anthropic import Anthropic
    except ImportError as exc:  # pragma: no cover - exercised only when dependency is absent
        raise ManagedAgentError(
            "Anthropic SDK is not installed. Run `pip install -r backend/requirements.txt` first."
        ) from exc
    return Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))


def write_json(path: str | Path, payload: dict[str, Any]) -> None:
    resolved = Path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def read_json(path: str | Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text())


def sdk_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if is_dataclass(value):
        return asdict(value)
    if hasattr(value, "__dict__"):
        return {
            key: sdk_to_jsonable(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return {"value": str(value)}


def sdk_to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [sdk_to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [sdk_to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): sdk_to_jsonable(item) for key, item in value.items()}
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return sdk_to_dict(value)


def resource_matches_metadata(resource: Any, expected_metadata: Mapping[str, str]) -> bool:
    actual = getattr(resource, "metadata", {}) or {}
    return all(actual.get(key) == value for key, value in expected_metadata.items())


def resource_is_active(resource: Any) -> bool:
    return not bool(getattr(resource, "archived_at", None))


def list_items(cursor: Any) -> list[Any]:
    if cursor is None:
        return []
    data = getattr(cursor, "data", None)
    if data is not None:
        return list(data)
    if isinstance(cursor, list):
        return cursor
    try:
        return list(cursor)
    except TypeError:
        return [cursor]


def ensure_agent(client: Any, profile: ManagedAgentProfile) -> tuple[Any, str]:
    for agent in list_items(client.beta.agents.list(limit=100)):
        if (
            resource_is_active(agent)
            and getattr(agent, "name", None) == profile.agent_name
            and resource_matches_metadata(agent, profile.agent_metadata)
        ):
            return agent, "reused"
    return client.beta.agents.create(**profile.agent_create_params()), "created"


def ensure_environment(client: Any, profile: ManagedAgentProfile) -> tuple[Any, str]:
    for environment in list_items(client.beta.environments.list(limit=100)):
        if (
            resource_is_active(environment)
            and getattr(environment, "name", None) == profile.environment_name
            and resource_matches_metadata(environment, profile.environment_metadata)
        ):
            return environment, "reused"
    return client.beta.environments.create(**profile.environment_create_params()), "created"


def ensure_vault(client: Any, profile: ManagedAgentProfile) -> tuple[Any, str]:
    for vault in list_items(client.beta.vaults.list(limit=100)):
        if (
            resource_is_active(vault)
            and getattr(vault, "display_name", None) == profile.vault_name
            and resource_matches_metadata(vault, profile.vault_metadata)
        ):
            return vault, "reused"
    return client.beta.vaults.create(
        display_name=profile.vault_name,
        metadata=profile.vault_metadata,
    ), "created"


def ensure_static_bearer_credential(
    client: Any,
    *,
    vault_id: str,
    mcp_url: str,
    token: str,
    display_name: str,
    metadata: Mapping[str, str],
) -> tuple[Any, str]:
    for credential in list_items(client.beta.vaults.credentials.list(vault_id=vault_id, limit=100)):
        auth = getattr(credential, "auth", None)
        server_url = getattr(auth, "mcp_server_url", None)
        if resource_is_active(credential) and server_url == mcp_url:
            updated = client.beta.vaults.credentials.update(
                credential_id=getattr(credential, "id"),
                vault_id=vault_id,
                display_name=display_name,
                metadata=dict(metadata),
                auth={
                    "type": "static_bearer",
                    "token": token,
                },
            )
            return updated, "updated"
    created = client.beta.vaults.credentials.create(
        vault_id=vault_id,
        display_name=display_name,
        metadata=dict(metadata),
        auth={
            "type": "static_bearer",
            "mcp_server_url": mcp_url,
            "token": token,
        },
    )
    return created, "created"


def retrieve_latest_agent(client: Any, agent_id: str) -> Any:
    return client.beta.agents.retrieve(agent_id=agent_id)


def build_session_agent_ref(agent_id: str, version: int | None) -> str | dict[str, Any]:
    if version is None:
        return agent_id
    return {
        "id": agent_id,
        "type": "agent",
        "version": version,
    }


def create_session(
    client: Any,
    *,
    agent_id: str,
    environment_id: str,
    vault_id: str | None,
    title: str,
    agent_version: int | None = None,
    metadata: Mapping[str, str] | None = None,
) -> Any:
    params: dict[str, Any] = {
        "agent": build_session_agent_ref(agent_id, agent_version),
        "environment_id": environment_id,
        "title": title,
    }
    if metadata:
        params["metadata"] = dict(metadata)
    if vault_id:
        params["vault_ids"] = [vault_id]
    return client.beta.sessions.create(**params)


def format_event_error(event: Any) -> dict[str, Any]:
    payload = sdk_to_dict(event)
    error = payload.get("error") or {}
    return {
        "event_id": payload.get("id"),
        "event_type": payload.get("type"),
        "error_type": error.get("type"),
        "message": error.get("message", str(error) or str(payload)),
        "retry_status": (error.get("retry_status") or {}).get("type"),
        "mcp_server_name": error.get("mcp_server_name"),
        "raw": payload,
    }


def is_session_error_event(event: Any) -> bool:
    return getattr(event, "type", None) == "session.error" or (
        isinstance(event, dict) and event.get("type") == "session.error"
    )


def is_mcp_auth_session_error(event: Any) -> bool:
    if not is_session_error_event(event):
        return False
    error = (sdk_to_dict(event).get("error") or {})
    error_type = (error.get("type") or "").lower()
    message = (error.get("message") or "").lower()
    return (
        error_type in {"mcp_authentication_failed_error", "mcp_connection_failed_error"}
        or any(token in message for token in ("mcp", "auth", "credential", "vault", "401", "403"))
    )


def extract_text_blocks(content: list[Any] | None) -> str:
    chunks: list[str] = []
    for block in content or []:
        if isinstance(block, dict):
            text = block.get("text")
        else:
            text = getattr(block, "text", None)
        if text:
            chunks.append(text)
    return "".join(chunks)


def perform_mcp_preflight(
    mcp_url: str,
    *,
    token: str | None,
    timeout: float = 15.0,
) -> MCPPreflightResult:
    normalized_mcp_url = mcp_url.rstrip("/")
    health_url = f"{normalized_mcp_url}/health"
    steps: list[MCPPreflightStep] = []
    server_name: str | None = None
    protocol_version: str | None = None
    tools_count = 0

    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    initialize_payload = {
        "jsonrpc": "2.0",
        "id": "initialize-1",
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "winston-managed-agent-bootstrap",
                "version": "1.0.0",
            },
        },
    }
    tools_payload = {
        "jsonrpc": "2.0",
        "id": "tools-list-1",
        "method": "tools/list",
        "params": {},
    }

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        try:
            health_response = client.get(health_url)
            health_json = health_response.json() if health_response.content else {}
            steps.append(
                MCPPreflightStep(
                    name="health",
                    ok=health_response.status_code == 200,
                    status_code=health_response.status_code,
                    detail=None if health_response.status_code == 200 else health_response.text[:200],
                    payload=sdk_to_jsonable(health_json),
                )
            )
        except Exception as exc:
            steps.append(MCPPreflightStep(name="health", ok=False, detail=str(exc)))
            return MCPPreflightResult(
                mcp_url=normalized_mcp_url,
                server_name=server_name,
                protocol_version=protocol_version,
                tools_count=tools_count,
                steps=steps,
            )

        try:
            initialize_response = client.post(
                normalized_mcp_url,
                headers={"Content-Type": "application/json", **headers},
                json=initialize_payload,
            )
            initialize_json = initialize_response.json() if initialize_response.content else {}
            result = initialize_json.get("result") or {}
            protocol_version = result.get("protocolVersion")
            server_name = (result.get("serverInfo") or {}).get("name")
            initialize_ok = (
                initialize_response.status_code == 200
                and bool(protocol_version)
                and bool(server_name)
            )
            steps.append(
                MCPPreflightStep(
                    name="initialize",
                    ok=initialize_ok,
                    status_code=initialize_response.status_code,
                    detail=None if initialize_ok else json.dumps(initialize_json)[:200],
                    payload=sdk_to_jsonable(initialize_json),
                )
            )
        except Exception as exc:
            steps.append(MCPPreflightStep(name="initialize", ok=False, detail=str(exc)))
            return MCPPreflightResult(
                mcp_url=normalized_mcp_url,
                server_name=server_name,
                protocol_version=protocol_version,
                tools_count=tools_count,
                steps=steps,
            )

        try:
            client.post(
                normalized_mcp_url,
                headers={"Content-Type": "application/json", **headers},
                json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            )
        except Exception:
            pass

        try:
            tools_response = client.post(
                normalized_mcp_url,
                headers={"Content-Type": "application/json", **headers},
                json=tools_payload,
            )
            tools_json = tools_response.json() if tools_response.content else {}
            tools = (tools_json.get("result") or {}).get("tools") or []
            tools_count = len(tools)
            tools_ok = tools_response.status_code == 200 and tools_count > 0
            steps.append(
                MCPPreflightStep(
                    name="tools_list",
                    ok=tools_ok,
                    status_code=tools_response.status_code,
                    detail=None if tools_ok else json.dumps(tools_json)[:200],
                    payload={"tool_count": tools_count},
                )
            )
        except Exception as exc:
            steps.append(MCPPreflightStep(name="tools_list", ok=False, detail=str(exc)))
            return MCPPreflightResult(
                mcp_url=normalized_mcp_url,
                server_name=server_name,
                protocol_version=protocol_version,
                tools_count=tools_count,
                steps=steps,
            )

    transport_ok = all(step.ok for step in steps)
    steps.append(
        MCPPreflightStep(
            name="streamable_http_compatibility",
            ok=transport_ok,
            detail=(
                "Verified via MCP JSON-RPC initialize + tools/list over the remote HTTP endpoint."
                if transport_ok
                else "Remote MCP endpoint did not satisfy the expected streamable HTTP / JSON-RPC shape."
            ),
            payload={
                "protocol_version": protocol_version,
                "server_name": server_name,
                "tool_count": tools_count,
            },
        )
    )
    return MCPPreflightResult(
        mcp_url=normalized_mcp_url,
        server_name=server_name,
        protocol_version=protocol_version,
        tools_count=tools_count,
        steps=steps,
    )


def run_session_turn(
    client: Any,
    *,
    session_id: str,
    message: str,
    confirmation_callback: Callable[[Any], ToolConfirmationDecision] | None = None,
    on_event: Callable[[Any], None] | None = None,
) -> SessionTurnResult:
    transcript_parts: list[str] = []
    tool_uses: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    events_by_id: dict[str, Any] = {}
    event_count = 0
    final_status: str | None = None
    stop_reason_type: str | None = None

    with client.beta.sessions.events.stream(session_id=session_id) as stream:
        client.beta.sessions.events.send(
            session_id=session_id,
            events=[
                {
                    "type": "user.message",
                    "content": [{"type": "text", "text": message}],
                }
            ],
        )
        for event in stream:
            event_count += 1
            event_id = getattr(event, "id", None)
            if event_id:
                events_by_id[event_id] = event
            if on_event:
                on_event(event)

            event_type = getattr(event, "type", "")
            if event_type == "agent.message":
                transcript_parts.append(extract_text_blocks(getattr(event, "content", None)))
                continue

            if event_type in {"agent.tool_use", "agent.mcp_tool_use", "agent.custom_tool_use"}:
                tool_uses.append(
                    {
                        "id": event_id,
                        "type": event_type,
                        "name": getattr(event, "name", None),
                        "mcp_server_name": getattr(event, "mcp_server_name", None),
                        "evaluated_permission": getattr(event, "evaluated_permission", None),
                        "input": sdk_to_jsonable(getattr(event, "input", None)),
                    }
                )
                continue

            if event_type == "session.error":
                formatted = format_event_error(event)
                errors.append(formatted)
                raise SessionStreamError(
                    f"Managed-agent session error ({formatted['error_type'] or 'unknown'}): {formatted['message']}"
                )

            if event_type == "session.status_idle":
                final_status = "idle"
                stop = getattr(event, "stop_reason", None)
                stop_reason_type = getattr(stop, "type", None)
                if stop_reason_type == "requires_action":
                    if confirmation_callback is None:
                        snapshot = sdk_to_jsonable(client.beta.sessions.retrieve(session_id=session_id))
                        return SessionTurnResult(
                            session_id=session_id,
                            transcript="".join(transcript_parts).strip(),
                            tool_uses=tool_uses,
                            event_count=event_count,
                            final_status=final_status,
                            stop_reason_type=stop_reason_type,
                            session_snapshot=snapshot,
                            errors=errors,
                        )
                    confirmations = []
                    for blocking_event_id in getattr(stop, "event_ids", []) or []:
                        tool_event = events_by_id.get(blocking_event_id)
                        decision = confirmation_callback(tool_event)
                        payload = {
                            "type": "user.tool_confirmation",
                            "tool_use_id": blocking_event_id,
                            "result": decision.result,
                        }
                        if decision.deny_message:
                            payload["deny_message"] = decision.deny_message
                        confirmations.append(payload)
                    client.beta.sessions.events.send(session_id=session_id, events=confirmations)
                    continue
                break

            if event_type == "session.status_running":
                final_status = "running"
                continue

            if event_type == "session.status_terminated":
                final_status = "terminated"
                break

    snapshot = sdk_to_jsonable(client.beta.sessions.retrieve(session_id=session_id))
    return SessionTurnResult(
        session_id=session_id,
        transcript="".join(transcript_parts).strip(),
        tool_uses=tool_uses,
        event_count=event_count,
        final_status=final_status or snapshot.get("status"),
        stop_reason_type=stop_reason_type,
        session_snapshot=snapshot,
        errors=errors,
    )


def allow_all_confirmation(_: Any) -> ToolConfirmationDecision:
    return ToolConfirmationDecision(result="allow")


def build_bootstrap_summary(
    *,
    profile: ManagedAgentProfile,
    preflight: MCPPreflightResult,
    agent: Any,
    agent_action: str,
    latest_agent: Any,
    environment: Any,
    environment_action: str,
    vault: Any,
    vault_action: str,
    credential: Any,
    credential_action: str,
    smoke_session: Any | None,
    smoke_turn: SessionTurnResult | None,
    state_path: Path | None,
) -> dict[str, Any]:
    credential_auth = getattr(credential, "auth", None)
    return {
        "generated_at": utc_now_iso(),
        "managed_agents_beta": MANAGED_AGENTS_BETA,
        "profile_path": str(profile.profile_path),
        "state_path": str(state_path) if state_path else None,
        "profile": {
            "agent_name": profile.agent_name,
            "agent_model": profile.agent_model,
            "environment_name": profile.environment_name,
            "vault_name": profile.vault_name,
            "mcp_server_name": profile.mcp_server_name,
            "mcp_url": profile.mcp_url,
            "pinned_agent_version": profile.pinned_agent_version,
        },
        "preflight": preflight.to_dict(),
        "resources": {
            "agent": {
                "action": agent_action,
                "id": getattr(agent, "id", None),
                "current_version": getattr(latest_agent, "version", None),
            },
            "environment": {
                "action": environment_action,
                "id": getattr(environment, "id", None),
            },
            "vault": {
                "action": vault_action,
                "id": getattr(vault, "id", None),
            },
            "credential": {
                "action": credential_action,
                "id": getattr(credential, "id", None),
                "matched_scope": getattr(credential_auth, "mcp_server_url", None),
            },
            "smoke_session": {
                "id": getattr(smoke_session, "id", None) if smoke_session else None,
                "status": (smoke_turn.session_snapshot or {}).get("status") if smoke_turn else None,
                "tool_use_count": len(smoke_turn.tool_uses) if smoke_turn else 0,
                "event_count": smoke_turn.event_count if smoke_turn else 0,
                "transcript": smoke_turn.transcript if smoke_turn else "",
                "usage": (smoke_turn.session_snapshot or {}).get("usage") if smoke_turn else None,
                "stats": (smoke_turn.session_snapshot or {}).get("stats") if smoke_turn else None,
            },
        },
    }
