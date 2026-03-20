"""Tests for RunNarrator — execution step deduplication and clean error surfaces."""
import pytest

from app.services.run_narrator import (
    CLEAN_ERROR_MESSAGE,
    TOOL_STEP_MAP,
    RunNarrator,
)


class TestDeduplication:
    """10 sequential calls to same tool → ONE step."""

    def test_repeated_calls_produce_single_step(self):
        narrator = RunNarrator()
        emitted_count = 0
        for _ in range(10):
            result = narrator.on_tool_call("repe.get_asset")
            if result is not None:
                emitted_count += 1

        # Only the first call emits a new step
        assert emitted_count == 1

    def test_repeated_calls_single_item_in_block(self):
        narrator = RunNarrator()
        first_block = narrator.on_tool_call("repe.get_asset")
        for _ in range(9):
            narrator.on_tool_call("repe.get_asset")

        assert first_block is not None
        assert len(first_block["items"]) == 1
        assert first_block["items"][0]["label"] == "Fetching assets"

    def test_different_tools_same_label_deduplicated(self):
        """repe.get_asset and repe.list_assets both map to 'Fetching assets'."""
        narrator = RunNarrator()
        block1 = narrator.on_tool_call("repe.get_asset")
        block2 = narrator.on_tool_call("repe.list_assets")

        assert block1 is not None
        assert block2 is None  # deduplicated

    def test_different_labels_create_separate_steps(self):
        narrator = RunNarrator()
        block1 = narrator.on_tool_call("repe.get_asset")
        block2 = narrator.on_tool_call("finance.fund_metrics")

        assert block1 is not None
        assert block2 is not None
        assert len(block2["items"]) == 2
        assert block2["items"][0]["label"] == "Fetching assets"
        assert block2["items"][1]["label"] == "Computing fund metrics"


class TestStepStatus:
    """Step status transitions."""

    def test_success_marks_completed(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")
        result = narrator.on_tool_result("repe.get_asset", success=True, duration_ms=120)

        assert result is not None
        step = result["items"][0]
        assert step["status"] == "completed"
        assert step["duration_ms"] == 120

    def test_failure_marks_failed_with_clean_message(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")
        result = narrator.on_tool_result(
            "repe.get_asset",
            success=False,
            duration_ms=50,
            error_msg="validation error for GetAssetInput asset_id invalid UUID",
            is_final_retry=True,
        )

        assert result is not None
        step = result["items"][0]
        assert step["status"] == "failed"
        # User sees clean message, not raw validation text
        assert step["summary"] == CLEAN_ERROR_MESSAGE


class TestRetrySuppression:
    """Retries are invisible to the user unless final failure."""

    def test_retry_suppressed(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")

        # First attempt fails but retry is happening
        result = narrator.on_tool_result(
            "repe.get_asset",
            success=False,
            duration_ms=50,
            error_msg="timeout",
            is_retry=True,
            is_final_retry=False,
        )
        assert result is None  # suppressed

    def test_retry_then_success_shows_no_error(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")

        # Retry (suppressed)
        narrator.on_tool_result(
            "repe.get_asset",
            success=False,
            duration_ms=50,
            error_msg="timeout",
            is_retry=True,
            is_final_retry=False,
        )
        # Success
        result = narrator.on_tool_result("repe.get_asset", success=True, duration_ms=120)

        assert result is not None
        step = result["items"][0]
        assert step["status"] == "completed"

    def test_final_retry_failure_shows_error(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")

        # Suppress first retry
        narrator.on_tool_result(
            "repe.get_asset",
            success=False,
            error_msg="timeout",
            is_retry=True,
            is_final_retry=False,
        )
        # Final failure
        result = narrator.on_tool_result(
            "repe.get_asset",
            success=False,
            duration_ms=200,
            error_msg="timeout after 3 retries",
            is_final_retry=True,
        )

        assert result is not None
        step = result["items"][0]
        assert step["status"] == "failed"
        assert step["summary"] == CLEAN_ERROR_MESSAGE


class TestMixedToolTypes:
    """Correct step label transitions for mixed tool types."""

    def test_mixed_tools_ordered(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.list_funds")
        narrator.on_tool_call("repe.get_asset")
        narrator.on_tool_call("finance.fund_metrics")

        block = narrator.on_tool_call("rag.search")
        assert block is not None
        labels = [item["label"] for item in block["items"]]
        assert labels == [
            "Loading fund data",
            "Fetching assets",
            "Computing fund metrics",
            "Searching documents",
        ]

    def test_unknown_tool_gets_default_label(self):
        narrator = RunNarrator()
        block = narrator.on_tool_call("some.unknown_tool")
        assert block is not None
        assert block["items"][0]["label"] == "Processing"


class TestBlockFormat:
    """Output block has correct shape."""

    def test_block_has_type_and_id(self):
        narrator = RunNarrator()
        block = narrator.on_tool_call("repe.get_asset")
        assert block["type"] == "tool_activity"
        assert block["block_id"].startswith("narrated_steps_")

    def test_get_all_steps(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")
        narrator.on_tool_call("finance.fund_metrics")
        narrator.on_tool_result("repe.get_asset", success=True, duration_ms=100)

        steps = narrator.get_all_steps()
        assert len(steps) == 2
        assert steps[0]["status"] == "completed"
        assert steps[1]["status"] == "running"


class TestLongExecution:
    """User always sees an active step (never blank)."""

    def test_always_has_active_step_during_execution(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")
        narrator.on_tool_call("finance.fund_metrics")

        # Complete first, second still running
        narrator.on_tool_result("repe.get_asset", success=True, duration_ms=100)

        steps = narrator.get_all_steps()
        running = [s for s in steps if s["status"] == "running"]
        assert len(running) == 1
        assert running[0]["label"] == "Computing fund metrics"


class TestDurationAccumulation:
    """Duration accumulates across multiple calls to same step."""

    def test_duration_accumulates(self):
        narrator = RunNarrator()
        narrator.on_tool_call("repe.get_asset")
        narrator.on_tool_call("repe.list_assets")  # same step, deduplicated

        narrator.on_tool_result("repe.get_asset", success=True, duration_ms=100)
        narrator.on_tool_result("repe.list_assets", success=True, duration_ms=150)

        steps = narrator.get_all_steps()
        assert steps[0]["duration_ms"] == 250
