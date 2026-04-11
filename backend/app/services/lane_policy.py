"""Lane-based composition policy for Winston AI Gateway.

Defines per-lane token budgets, feature gates, and cut strategies. Consumed by
prompt_strategy (to decide what's even requested) and context_compiler (to
enforce budget under pressure). Replaces the old ad-hoc LaneBudget in
prompt_composer.py — prompt_composer still keeps its local LaneBudget for the
legacy code path but the unified runtime reads only from here.

Tuning knobs live here. When the autotuner (prompt_autotuner.py) surfaces a
proposal (e.g. "reduce max_rag_chunks on C"), an operator edits this file and
redeploys. In v2 this may be replaced by a DB-backed override table.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

# Global hard cap on skill instruction size. Skills must never dominate the
# prompt. If a skill file is larger than this, the compiler trims it.
MAX_SKILL_TOKENS = 1500


@dataclass(frozen=True)
class LanePolicy:
    """Per-lane composition policy.

    A lane policy governs (a) what is eligible to enter the prompt and
    (b) the total token budget the compiler must fit within.
    """

    total_budget: int
    include_rag: bool
    max_history_turns: int
    max_rag_chunks: int
    rag_min_score: float
    use_thread_summary: bool
    use_visible_context: bool
    use_domain_blocks: bool
    use_visible_records: bool
    max_skill_tokens: int = MAX_SKILL_TOKENS

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Lanes are assigned upstream by the router (dispatch_engine). The Prompt
# Strategy Engine may override the router's lane when a composition profile
# forces a specific lane (e.g. "simple_lookup" profile forces lane A).
LANE_POLICY: dict[str, LanePolicy] = {
    "A": LanePolicy(
        total_budget=4_000,
        include_rag=False,
        max_history_turns=2,
        max_rag_chunks=0,
        rag_min_score=1.0,
        use_thread_summary=False,
        use_visible_context=False,
        use_domain_blocks=False,
        use_visible_records=False,
    ),
    "B": LanePolicy(
        total_budget=10_000,
        include_rag=True,
        max_history_turns=4,
        max_rag_chunks=3,
        rag_min_score=0.55,
        use_thread_summary=True,
        use_visible_context=True,
        use_domain_blocks=True,
        use_visible_records=True,
    ),
    "C": LanePolicy(
        total_budget=16_000,
        include_rag=True,
        max_history_turns=6,
        max_rag_chunks=5,
        rag_min_score=0.50,
        use_thread_summary=True,
        use_visible_context=True,
        use_domain_blocks=True,
        use_visible_records=True,
    ),
    "D": LanePolicy(
        total_budget=24_000,
        include_rag=True,
        max_history_turns=8,
        max_rag_chunks=8,
        rag_min_score=0.45,
        use_thread_summary=True,
        use_visible_context=True,
        use_domain_blocks=True,
        use_visible_records=True,
    ),
}


def get_policy(lane: str | None) -> LanePolicy:
    """Return the policy for a lane, falling back to B if unknown.

    Accepts both bare lane letters ("A", "B", "C", "D") and the Lane enum
    string forms from turn_receipts ("A_FAST", "B_LOOKUP", ...).
    """
    if not lane:
        return LANE_POLICY["B"]
    key = str(lane).upper()
    # Enum forms: 'A_FAST' → 'A', 'B_LOOKUP' → 'B', etc.
    if "_" in key:
        key = key.split("_", 1)[0]
    return LANE_POLICY.get(key, LANE_POLICY["B"])
