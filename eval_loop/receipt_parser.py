from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class ParsedRun:
    events: list[dict[str, Any]]
    response_text: str
    response_blocks: list[dict[str, Any]]
    done_payload: dict[str, Any] | None
    turn_receipt: dict[str, Any] | None
    trace: dict[str, Any] | None
    duration_ms: int
    first_token_ms: int | None


def parse_sse_line(raw: str) -> tuple[str, dict[str, Any]] | None:
    parts = [line for line in raw.splitlines() if line]
    if len(parts) < 2:
        return None
    event = parts[0].split(":", 1)[1].strip()
    payload = json.loads(parts[1].split(":", 1)[1].strip())
    return event, payload


async def collect_runtime_turn(stream) -> ParsedRun:
    started_at = time.perf_counter()
    first_token_ms: int | None = None
    events: list[dict[str, Any]] = []
    response_text = ""
    response_blocks: list[dict[str, Any]] = []
    done_payload: dict[str, Any] | None = None

    async for raw in stream:
        parsed = parse_sse_line(raw)
        if parsed is None:
            continue
        event, payload = parsed
        events.append(
            {
                "event": event,
                "payload": payload,
                "event_time_ms": int((time.perf_counter() - started_at) * 1000),
            }
        )
        if event == "token":
            if first_token_ms is None:
                first_token_ms = int((time.perf_counter() - started_at) * 1000)
            response_text += str(payload.get("text") or "")
        elif event == "response_block":
            block = payload.get("block") or {}
            response_blocks.append(block)
        elif event == "done":
            done_payload = payload

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    return ParsedRun(
        events=events,
        response_text=response_text.strip(),
        response_blocks=response_blocks,
        done_payload=done_payload,
        turn_receipt=(done_payload or {}).get("turn_receipt"),
        trace=(done_payload or {}).get("trace"),
        duration_ms=duration_ms,
        first_token_ms=first_token_ms,
    )
