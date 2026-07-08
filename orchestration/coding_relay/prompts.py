"""Prompt templates for the builder (Claude) and reviewer (Codex)."""
from __future__ import annotations

from orchestration.coding_relay.intake import AcceptanceCriteria

BUILD_COMPLETE_MARKER = "BUILD_COMPLETE"

BUILDER_RULES = """## Hard rules
- Make the actual file edits in this working directory. Do not just describe changes.
- Edit ONLY inside this working directory. Never write outside it, never create
  symlinks or junctions, never use .. paths. The relay stops the run if you do.
- Stay inside the surfaces the plan names. No unrelated refactors, no gold-plating.
- Do not commit, push, create branches, or change git or tool configuration.
- Do not touch .github/workflows/, .githooks/, supabase/, DB schema/migration
  files, auth/security code, or .orchestration/ unless the plan explicitly
  scopes them. The relay's safety scanner stops the run on violations.
- Never print, embed, or copy secrets, tokens, or environment variable values.
- Do not fake success. If something cannot be done, say so plainly.
- Run nothing destructive: no deploys, no database writes, no mass deletions.
"""


def builder_prompt(
    plan_text: str,
    criteria: AcceptanceCriteria,
    iteration: int,
    max_iterations: int,
    reviewer_feedback: str | None = None,
    test_failures: str | None = None,
) -> str:
    parts = [
        "You are the BUILDER in a bounded build/review relay. You implement; "
        "a separate reviewer audits your work against acceptance criteria "
        "after every pass.",
        "",
        f"This is iteration {iteration} of at most {max_iterations}.",
        "",
        "## Plan to implement",
        "",
        plan_text.rstrip(),
        "",
        "## Acceptance criteria (the reviewer judges each id)",
        "",
        criteria.to_markdown().rstrip(),
        "",
    ]
    if reviewer_feedback:
        parts += [
            "## Reviewer feedback from the previous iteration (address ALL of it)",
            "",
            reviewer_feedback.rstrip(),
            "",
        ]
    if test_failures:
        parts += [
            "## Failing test output from the previous iteration",
            "",
            "```",
            test_failures.rstrip(),
            "```",
            "",
        ]
    parts += [
        BUILDER_RULES,
        "When you believe the implementation is complete, end your final "
        "message with a one-line summary of what you changed and the literal "
        f'marker: "{BUILD_COMPLETE_MARKER}".',
    ]
    return "\n".join(parts) + "\n"


REVIEWER_SCHEMA = """{
  "status": "pass" | "continue" | "blocked" | "risk_escalation",
  "summary": "one paragraph, plain text",
  "criteria_status": [
    {"id": "<criterion id>", "section": "<section>", "text": "<criterion>",
     "status": "met" | "unmet" | "unknown" | "not_applicable",
     "evidence": "concrete evidence from the diff or test output"}
  ],
  "required_next_steps": ["concrete step the builder must take next"],
  "plan_refinements": ["adjustment to the plan justified by repo facts"],
  "tests_to_run_next": ["exact test command worth running next"],
  "risk_flags": ["anything risky the human should know"],
  "should_open_pr": true | false
}"""

STATUS_SEMANTICS = """Status semantics:
- "pass": EVERY criterion is met or not_applicable, tests that ran are
  green, and there are no risk flags. Do not pass on partial work.
- "continue": progress is real but criteria remain unmet and another
  bounded iteration can plausibly close them.
- "blocked": the plan cannot proceed without information or decisions the
  relay does not have. Explain the blocker in summary.
- "risk_escalation": the diff touches something a human must approve
  (auth/security, schema, workflows, destructive behavior, scope break).
"""


def reviewer_prompt(
    plan_text: str,
    criteria: AcceptanceCriteria,
    iteration: int,
    bundle_summary: str,
) -> str:
    return (
        "You are the REVIEWER in a bounded build/review relay. You are "
        "read-only: you never edit files, and you review only the artifact "
        "bundle below (you have no repository access).\n\n"
        f"This is review iteration {iteration}.\n\n"
        "## Plan\n\n"
        f"{plan_text.rstrip()}\n\n"
        "## Acceptance criteria (judge every id)\n\n"
        f"{criteria.to_markdown().rstrip()}\n\n"
        "## Review bundle (diff, changed files, tests, builder summary)\n\n"
        f"{bundle_summary.rstrip()}\n\n"
        f"{STATUS_SEMANTICS}\n"
        "Judge honestly. Evidence must come from the bundle; if you cannot "
        'verify a criterion, mark it "unknown", never "met".\n\n'
        "Respond with EXACTLY ONE JSON object and nothing else (no prose, no "
        "markdown fences) matching this schema:\n\n"
        f"{REVIEWER_SCHEMA}\n"
    )
