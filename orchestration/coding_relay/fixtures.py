"""FakeProviders: drive the whole relay loop from a fixture directory.

No CLIs, no tokens. A fixture dir looks like:

    plan.md
    iterations/1/files/<relpath>      files the fake builder writes verbatim
    iterations/1/build-output.md      fake builder stdout
    iterations/1/review.json          fake reviewer verdict (JSON object)
    iterations/2/...

The fake builder copies iterations/N/files/** into the worktree (simulating
edits) and returns build-output.md as stdout. The fake reviewer returns
review.json as stdout. Missing per-iteration files fall back to minimal
defaults so short fixtures stay short.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from orchestration.coding_relay.providers import AdapterResult


class FakeProviders:
    def __init__(self, fixture_dir: Path, worktree: Path):
        self.fixture_dir = Path(fixture_dir)
        self.worktree = Path(worktree)
        self.build_calls = 0
        self.review_calls = 0
        if not self.fixture_dir.is_dir():
            raise FileNotFoundError(f"fixture dir not found: {self.fixture_dir}")

    def _iter_dir(self, n: int) -> Path:
        return self.fixture_dir / "iterations" / str(n)

    def build(self, prompt: str) -> AdapterResult:
        self.build_calls += 1
        n = self.build_calls
        it = self._iter_dir(n)
        files_root = it / "files"
        if files_root.is_dir():
            for src in files_root.rglob("*"):
                if src.is_file():
                    rel = src.relative_to(files_root)
                    dest = self.worktree / rel
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(src, dest)
        out_file = it / "build-output.md"
        stdout = (
            out_file.read_text(encoding="utf-8", errors="replace")
            if out_file.is_file()
            else f"(fixture iteration {n}: no build-output.md)\nBUILD_COMPLETE"
        )
        # Optional failure injection: iterations/N/build-exit holds an int.
        exit_code = 0
        exit_file = it / "build-exit"
        if exit_file.is_file():
            try:
                exit_code = int(exit_file.read_text(encoding="utf-8").strip())
            except ValueError:
                exit_code = 1
        return AdapterResult(
            agent="fixture-builder", adapter="fixture", command=["fixture", "build", str(n)],
            exit_code=exit_code, duration_ms=1, stdout=stdout, stderr="",
        )

    def review(self, prompt: str, review_dir: Path, effort: str) -> AdapterResult:
        self.review_calls += 1
        # The iteration number comes from the bundle path
        # (.../iterations/NN/review-bundle), NOT the call count: the loop's
        # verdict retry calls review() twice for one iteration, and a
        # call-count index would silently consume the next iteration's file.
        try:
            n = int(review_dir.parent.name)
        except (ValueError, AttributeError):
            n = self.review_calls
        v_file = self._iter_dir(n) / "review.json"
        if v_file.is_file():
            stdout = v_file.read_text(encoding="utf-8", errors="replace")
        else:
            # A missing fixture file must NEVER fabricate success.
            stdout = json.dumps(
                {
                    "status": "blocked",
                    "summary": f"fixture iteration {n}: no review.json scripted",
                    "criteria_status": [],
                    "required_next_steps": [],
                    "plan_refinements": [],
                    "tests_to_run_next": [],
                    "risk_flags": ["fixture gap: iterations/" + str(n) + "/review.json missing"],
                    "should_open_pr": False,
                }
            )
        return AdapterResult(
            agent="fixture-reviewer", adapter="fixture", command=["fixture", "review", str(n)],
            exit_code=0, duration_ms=1, stdout=stdout, stderr="",
        )
