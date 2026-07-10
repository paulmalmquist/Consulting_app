"""Wave preview exact-string assertion, roadmap intake, and dry-run shape."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from orchestration.relay_coordinator.cli import (  # noqa: E402
    build_plan,
    load_roadmap,
    render_dry_run,
    render_waves,
)
from orchestration.relay_coordinator.graph import Workstream  # noqa: E402

FIXTURE_DIR = ROOT / "orchestration" / "relay_coordinator" / "fixtures"


def _preview_workstreams():
    """The three workstreams from the documented preview example."""
    t1 = Workstream(
        workstream_id="SUS-T1", title="Contracts",
        owned_paths=["src/contracts.py"], acceptance_criteria=["define contracts"],
        builder_model="fable", reviewer_model="sol", is_shared_contract=True,
    )
    t4 = Workstream(
        workstream_id="SUS-T4", title="Factor registry", depends_on=["SUS-T1"],
        owned_paths=["src/factors.py"], acceptance_criteria=["register factors"],
        builder_model="fable", reviewer_model="sol",
    )
    t5 = Workstream(
        workstream_id="SUS-T5", title="Seed generator", depends_on=["SUS-T1"],
        owned_paths=["src/seed.py"], acceptance_criteria=["generate seed"],
        builder_model="sol", reviewer_model="fable",
    )
    return [t1, t4, t5]


def test_render_waves_exact_string():
    plan = build_plan(_preview_workstreams(), concurrency=3)
    rendered = render_waves(plan)
    expected = (
        "Wave 0 — serial\n"
        "  SUS-T1 Contracts       Fable builds / Sol reviews\n"
        "\n"
        "Wave 1 — parallel, max 3\n"
        "  SUS-T4 Factor registry Fable builds / Sol reviews\n"
        "  SUS-T5 Seed generator  Sol builds / Fable reviews"
    )
    assert rendered == expected


def test_load_roadmap_json_manifest():
    workstreams = load_roadmap(FIXTURE_DIR / "demo_roadmap.json")
    ids = {w.workstream_id for w in workstreams}
    assert ids == {"SUS-T1", "SUS-T4", "SUS-T5", "SUS-T7"}


def test_load_roadmap_from_markdown_json_block(tmp_path):
    md = tmp_path / "roadmap.md"
    md.write_text(
        "# Roadmap\n\nSome prose.\n\n```json\n"
        '{"workstreams": [{"workstream_id": "A", "title": "A", '
        '"owned_paths": ["src/a.py"], "acceptance_criteria": ["do a"]}]}\n'
        "```\n\nMore prose.\n",
        encoding="utf-8",
    )
    workstreams = load_roadmap(md)
    assert len(workstreams) == 1 and workstreams[0].workstream_id == "A"


def test_dry_run_shows_waves_commands_and_creates_nothing(tmp_path):
    plan = build_plan(load_roadmap(FIXTURE_DIR / "demo_roadmap.json"), concurrency=3)
    before = set(tmp_path.rglob("*"))
    text = render_dry_run(plan, base_commit="abc1234def", worktree_root=tmp_path / "coord")
    after = set(tmp_path.rglob("*"))
    assert before == after  # mutation-free: nothing written
    # Contains the wave preview, the model assignments, and real relay commands.
    assert "Wave 0" in text
    assert "-m orchestration.coding_relay" in text
    assert "--no-pr" in text
    assert "--claude-model claude-fable-5" in text
    assert "--base abc1234def" in text
    # The migration workstream command carries --allow-migrations.
    assert "--allow-migrations" in text
    assert "created nothing" in text


def test_dry_run_marks_unsupported_orientation(tmp_path):
    # A workstream routed to sol-builds is unsupported; dry-run flags it, no cmd.
    w = Workstream(
        workstream_id="X", title="X", owned_paths=["src/x.py"],
        acceptance_criteria=["do x"], builder_model="sol", reviewer_model="fable",
    )
    plan = build_plan([w], concurrency=3)
    text = render_dry_run(plan, base_commit="abc", worktree_root=tmp_path)
    assert "unsupported_by_current_worker" in text
    assert "NOT RUN" in text
