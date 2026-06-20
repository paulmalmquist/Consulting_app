"""ADE Ops registry invariants — risk tiers, executability, no-shell wall."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops.models import RiskTier  # noqa: E402
from app.services.ade_ops.registry import ops_registry  # noqa: E402
from app.services.ade_ops.executors import EXECUTORS  # noqa: E402

FIVE_COMMANDS = {
    "ade.inventory.scan_pipelines",
    "ade.lineage.trust_number",
    "ade.freshness.assess",
    "ade.cost.show_hotspots",
    "ade.compute.recommend_rightsize",
}


def test_five_pr1_commands_present_and_executable():
    names = {s.name for s in ops_registry.list_all()}
    assert FIVE_COMMANDS <= names
    for n in FIVE_COMMANDS:
        s = ops_registry.get(n)
        assert s.executable is True
        assert s.risk_tier <= RiskTier.RECOMMENDATION


def test_tier_executability_invariant():
    """Only tiers 0-1 may be executable; every tier >= 2 must be non-executable."""
    for s in ops_registry.list_all():
        if s.risk_tier >= RiskTier.DRY_RUN:
            assert s.executable is False, f"{s.name} tier {int(s.risk_tier)} must not be executable"
        # and every executable skill has a wired executor
        if s.executable:
            assert s.name in EXECUTORS, f"{s.name} executable but no executor"


def test_write_capable_skills_registered_but_not_executable():
    write_skills = [s for s in ops_registry.list_all() if s.risk_tier >= RiskTier.DRY_RUN]
    assert write_skills, "expected some tier >= 2 skills registered for visibility"
    assert all(not s.executable for s in write_skills)
    # ...and none of them has an executor (no write path exists at all)
    assert all(s.name not in EXECUTORS for s in write_skills)


def test_no_skill_carries_a_shell_or_command_string():
    """The no-arbitrary-shell wall: skill defs are metadata only, never command lines.

    Word-boundary patterns so prose like 'platform' / 'subquery' never trips it.
    """
    import re
    PATTERNS = [
        r"\bsnow\s+sql\b", r"\bdatabricks\s+\w", r"\bgcloud\s+\w", r"\baws\s+\w+\s",
        r"\bpsql\b", r"\bbq\s+query\b", r"\brm\s+-", r"&&", r"\$\(", r";\s*drop\b",
    ]
    for s in ops_registry.list_all():
        blob = (s.name + " " + s.description + " " + s.lane).lower()
        for pat in PATTERNS:
            assert not re.search(pat, blob), f"{s.name} contains shell-like pattern {pat!r}"


def test_describe_all_shape():
    for m in ops_registry.describe_all():
        assert set(m) >= {"name", "risk_tier", "mode", "executable", "approval_required",
                          "permission_required", "lane"}
