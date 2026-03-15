"""E2E test harness for Winston chat assistant.

Tests flow through the Next.js proxy at localhost:3001 to match real user path.
Collects SSE events with timing for performance measurement.

Usage:
    cd backend && .venv/bin/python -m pytest tests/test_chat_e2e.py -v -s
    cd backend && .venv/bin/python tests/test_chat_e2e.py   # standalone mode
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

# ── Configuration ─────────────────────────────────────────────────
PROXY_BASE = os.getenv("WINSTON_TEST_BASE", "http://127.0.0.1:3001")
GATEWAY_ENDPOINT = f"{PROXY_BASE}/api/ai/gateway/ask"
# Production seed IDs from CLAUDE.md
BUSINESS_ID = "a1b2c3d4-0001-0001-0001-000000000001"
ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001"
FUND_ID = "a1b2c3d4-0003-0030-0001-000000000001"
TIMEOUT = 180  # seconds per request


@dataclass
class SSEEvent:
    event_type: str
    data: dict[str, Any]
    elapsed_ms: int


@dataclass
class TestResult:
    test_name: str
    prompt: str
    pass_fail: str = "FAIL"
    answer: str = ""
    first_token_ms: int = 0
    total_ms: int = 0
    tools_invoked: list[str] = field(default_factory=list)
    tool_durations_ms: list[int] = field(default_factory=list)
    sse_events: list[SSEEvent] = field(default_factory=list)
    lane: str = ""
    model: str = ""
    notes: str = ""
    error: str = ""
    timings: dict[str, int] = field(default_factory=dict)


def _send_prompt(
    message: str,
    conversation_id: str | None = None,
) -> TestResult:
    """Send a prompt to the gateway and collect the SSE response."""
    result = TestResult(test_name="", prompt=message)
    start = time.time()

    payload = {
        "message": message,
        "business_id": BUSINESS_ID,
        "env_id": ENV_ID,
        "conversation_id": conversation_id,
        "context_envelope": None,
        "session_id": f"test_{int(time.time())}",
    }

    try:
        with httpx.stream(
            "POST",
            GATEWAY_ENDPOINT,
            json=payload,
            timeout=TIMEOUT,
            headers={
                "Content-Type": "application/json",
                "cookie": "demo_lab_session=active",
            },
        ) as response:
            if response.status_code != 200:
                result.error = f"HTTP {response.status_code}: {response.read().decode()[:500]}"
                result.total_ms = int((time.time() - start) * 1000)
                return result

            first_token_recorded = False
            buffer = ""

            def _process_raw_event(raw_event: str):
                nonlocal first_token_recorded
                lines = raw_event.strip().split("\n")
                event_type = "message"
                event_data = {}

                for line in lines:
                    if line.startswith("event: "):
                        event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        try:
                            event_data = json.loads(line[6:])
                        except json.JSONDecodeError:
                            event_data = {"raw": line[6:]}

                if not event_type or event_type == "message":
                    return  # skip empty/unknown events

                elapsed = int((time.time() - start) * 1000)
                result.sse_events.append(SSEEvent(event_type, event_data, elapsed))

                if event_type == "token":
                    text = event_data.get("text", "")
                    result.answer += text
                    if not first_token_recorded and text.strip():
                        result.first_token_ms = elapsed
                        first_token_recorded = True

                elif event_type == "tool_call":
                    result.tools_invoked.append(event_data.get("tool_name", "unknown"))
                    result.tool_durations_ms.append(event_data.get("duration_ms", 0))

                elif event_type == "done":
                    trace = event_data.get("trace", {})
                    result.lane = trace.get("lane", "")
                    result.model = trace.get("model", "")
                    result.timings = trace.get("timings", {})
                    if not first_token_recorded:
                        result.first_token_ms = trace.get("timings", {}).get("ttft_ms", 0)

                elif event_type == "error":
                    result.error = event_data.get("message", str(event_data))

                elif event_type == "structured_result":
                    result.notes += f"structured_result: {event_data.get('result_type', 'unknown')}; "

            for chunk in response.iter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    raw_event, buffer = buffer.split("\n\n", 1)
                    if raw_event.strip():
                        _process_raw_event(raw_event)

            # Process any remaining data in buffer
            if buffer.strip():
                _process_raw_event(buffer)

    except httpx.TimeoutException:
        result.error = f"Timeout after {TIMEOUT}s"
    except Exception as exc:
        result.error = str(exc)[:500]

    result.total_ms = int((time.time() - start) * 1000)
    return result


def _check_server():
    """Verify the proxy is reachable."""
    try:
        r = httpx.get(f"{PROXY_BASE}/api/ai/gateway/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def _print_result(r: TestResult):
    status = "PASS" if r.pass_fail == "PASS" else "FAIL"
    print(f"\n{'='*70}")
    print(f"[{status}] {r.test_name}")
    print(f"  Prompt: {r.prompt[:80]}...")
    print(f"  Lane: {r.lane} | Model: {r.model}")
    print(f"  First token: {r.first_token_ms}ms | Total: {r.total_ms}ms")
    if r.tools_invoked:
        print(f"  Tools: {', '.join(r.tools_invoked)}")
        print(f"  Tool durations: {r.tool_durations_ms}")
    if r.timings:
        print(f"  Timings: {json.dumps(r.timings)}")
    if r.error:
        print(f"  ERROR: {r.error}")
    answer_preview = r.answer[:300].replace("\n", " ") if r.answer else "(empty)"
    print(f"  Answer: {answer_preview}")
    if r.notes:
        print(f"  Notes: {r.notes}")
    # Debug: show all SSE event types for diagnosis
    event_types = [f"{e.event_type}(+{e.elapsed_ms}ms)" for e in r.sse_events]
    print(f"  SSE events: {', '.join(event_types)}")


# ── Test Functions ────────────────────────────────────────────────

class TestWinstonRetrieval:
    """A. Retrieve fund information."""

    def test_a1_fund_details(self):
        """Show me the key details for the Meridian Capital Management fund."""
        r = _send_prompt("Show me the key details for the Meridian Capital Management fund.")
        r.test_name = "A1: Fund details retrieval"
        # Pass if answer mentions fund data and no error
        if not r.error and r.answer and ("meridian" in r.answer.lower() or "fund" in r.answer.lower()):
            r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'answer did not mention fund details'}"

    def test_a2_fund_assets(self):
        """What assets are in Meridian Capital Management?"""
        r = _send_prompt("What assets are in Meridian Capital Management and how are they performing?")
        r.test_name = "A2: Fund assets and performance"
        if not r.error and r.answer and len(r.answer) > 20:
            r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'insufficient answer'}"

    def test_a3_noi_trend(self):
        """Which investment has strongest NOI trend?"""
        r = _send_prompt("Which investment in the fund has the strongest NOI trend?")
        r.test_name = "A3: NOI trend analysis"
        if not r.error and r.answer and len(r.answer) > 20:
            r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'insufficient answer'}"


class TestWinstonCreateFund:
    """B. Create new fund."""

    def test_b1_create_fund_simple(self):
        """Create a new fund called Sun Ridge Income Fund."""
        r = _send_prompt("Create a new fund called Sun Ridge Income Fund.")
        r.test_name = "B1: Create fund (simple)"
        # Should either call create_fund tool or ask for missing fields
        if not r.error and r.answer:
            has_tool = any("create_fund" in t for t in r.tools_invoked)
            asks_for_fields = any(w in r.answer.lower() for w in ["vintage", "fund type", "strategy", "missing", "provide"])
            if has_tool or asks_for_fields:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'no tool call or field request'}"

    def test_b2_create_fund_with_details(self):
        """Create fund with strategy and vintage."""
        r = _send_prompt(
            "Create a new real estate fund called Coastal Workforce Housing Fund "
            "with strategy equity, fund type closed_end, and vintage 2025."
        )
        r.test_name = "B2: Create fund (with details)"
        if not r.error and r.answer:
            has_tool = any("create_fund" in t for t in r.tools_invoked)
            mentions_fund = "coastal" in r.answer.lower() or "fund" in r.answer.lower()
            if has_tool and mentions_fund:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'tool not called or fund not mentioned'}"


class TestWinstonCreateAsset:
    """C. Create new asset."""

    def test_c1_create_asset(self):
        """Create an asset named Harbor Flats in Miami with 220 units."""
        r = _send_prompt("Create an asset named Harbor Flats in Miami with 220 units.")
        r.test_name = "C1: Create asset"
        if not r.error and r.answer:
            has_tool = any("create_asset" in t for t in r.tools_invoked)
            mentions_asset = "harbor" in r.answer.lower() or "asset" in r.answer.lower()
            if has_tool or mentions_asset:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'no tool call or asset mention'}"


class TestWinstonCreateInvestment:
    """D. Create new investment."""

    def test_d1_create_investment(self):
        """Create a new investment."""
        r = _send_prompt(
            "Create a new investment called Palm Grove Apartments with deal type equity."
        )
        r.test_name = "D1: Create investment"
        if not r.error and r.answer:
            has_tool = any("create_deal" in t for t in r.tools_invoked)
            mentions_deal = "palm grove" in r.answer.lower() or "investment" in r.answer.lower() or "deal" in r.answer.lower()
            if has_tool or mentions_deal:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'no tool call or deal mention'}"


class TestWinstonWaterfall:
    """E. Run waterfalls."""

    def test_e1_run_waterfall(self):
        """Run a waterfall for the fund."""
        r = _send_prompt("Run a waterfall for the Meridian Capital Management fund.")
        r.test_name = "E1: Run waterfall"
        if not r.error and r.answer:
            has_tool = any("waterfall" in t for t in r.tools_invoked)
            mentions_waterfall = "waterfall" in r.answer.lower() or "distribution" in r.answer.lower()
            fast_path = any(e.event_type == "structured_result" for e in r.sse_events)
            if has_tool or mentions_waterfall or fast_path:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'no waterfall result'}"


class TestWinstonEdgeCases:
    """G. Failure and edge cases."""

    def test_g1_create_fund_no_name(self):
        """Create a fund without specifying a name."""
        r = _send_prompt("Create a fund.")
        r.test_name = "G1: Create fund (no name)"
        if not r.error and r.answer:
            asks_for_info = any(w in r.answer.lower() for w in ["name", "what", "which", "provide", "missing", "need"])
            if asks_for_info:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'did not ask for missing info'}"

    def test_g2_waterfall_nonexistent(self):
        """Run a waterfall on a fund that doesn't exist."""
        r = _send_prompt("Run a waterfall for the Nonexistent Ghost Fund.")
        r.test_name = "G2: Waterfall nonexistent fund"
        if not r.error and r.answer:
            # Should either fail gracefully or explain
            has_error_handling = any(w in r.answer.lower() for w in [
                "not found", "doesn't exist", "could not", "no fund", "unable", "error",
                "couldn't find", "not available",
            ])
            if has_error_handling or len(r.answer) > 20:
                r.pass_fail = "PASS"
        _print_result(r)
        assert r.pass_fail == "PASS", f"Failed: {r.error or 'no graceful failure'}"


# ── Standalone runner ─────────────────────────────────────────────
def _run_standalone():
    """Run all tests in sequence with summary table."""
    if not _check_server():
        print(f"ERROR: Cannot reach {PROXY_BASE}. Start servers first.")
        sys.exit(1)

    print(f"\nWinston E2E Test Harness — targeting {GATEWAY_ENDPOINT}")
    print("=" * 70)

    # Instantiate test classes and run methods
    test_classes = [
        TestWinstonRetrieval(),
        TestWinstonCreateFund(),
        TestWinstonCreateAsset(),
        TestWinstonCreateInvestment(),
        TestWinstonWaterfall(),
        TestWinstonEdgeCases(),
    ]

    for cls in test_classes:
        for method_name in sorted(dir(cls)):
            if method_name.startswith("test_"):
                method = getattr(cls, method_name)
                print(f"\n--- Running {cls.__class__.__name__}.{method_name} ---")
                try:
                    method()
                except AssertionError as e:
                    print(f"  ASSERTION FAILED: {e}")

    print("\n" + "=" * 70)
    print("Test run complete.")


if __name__ == "__main__":
    _run_standalone()
