#!/usr/bin/env python3
"""run_hallboys_pitch_forge.py — Standalone CLI orchestrator for the Pitch Forge pipeline.

Runs the full Pitch Forge loop for a project:
  1. Generate presentation deck (markdown, 12 slides)
  2. Run Sarat Mode red team critique
  3. If REJECT and iterations remain, trigger proposal rebuild and repeat
  4. Write each iteration to demo_docs/hall_boys/pitch_forge/iteration_N/
  5. Write final/best_presentation.md and final/summary.md

Usage:
    python scripts/run_hallboys_pitch_forge.py \\
        --env-id <env_id> \\
        --business-id <uuid> \\
        --project-id <uuid> \\
        --topic "AP Automation + Scheduling Intelligence for Hall Boys Holdings" \\
        --iterations 3

Output structure:
    demo_docs/hall_boys/pitch_forge/
        iteration_1/
            presentation.md
            critique.md
        iteration_2/
            presentation.md
            critique.md
        final/
            best_presentation.md
            summary.md
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from uuid import UUID


# ---------------------------------------------------------------------------
# Bootstrap: add backend to sys.path so app.* imports work
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

OUTPUT_BASE = REPO_ROOT / "demo_docs" / "hall_boys" / "pitch_forge"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  wrote {path.relative_to(REPO_ROOT)}")


def _verdict_emoji(verdict: str) -> str:
    return {"PASS": "✅", "WEAK": "⚠️", "REJECT": "❌"}.get(verdict, "?")


def _format_critique_md(review: dict, iteration_num: int, client_name: str) -> str:
    lines = [
        f"# Sarat Mode Critique — Iteration {iteration_num}",
        f"**Client:** {client_name}",
        f"**Date:** {datetime.utcnow().strftime('%Y-%m-%d')}",
        f"**Overall Verdict:** {_verdict_emoji(review.get('overall_verdict', '?'))} {review.get('overall_verdict', 'UNKNOWN')}",
        f"**Score:** {review.get('score', 0)}/100",
        "",
        "---",
        "",
        "## Sarat's Assessment",
        "",
        review.get("sarat_voice_summary", "_No summary provided._"),
        "",
        "---",
        "",
        "## Section Verdicts",
        "",
    ]

    sv = review.get("section_verdicts", {})
    for section, verdict in sv.items():
        lines.append(f"- **{section}**: {_verdict_emoji(verdict)} {verdict}")
    if not sv:
        lines.append("_No section verdicts._")

    lines += [
        "",
        "## Objection Scores (0 = no objection, 10 = fatal)",
        "",
    ]

    obj = review.get("objection_scores", {})
    for criterion, score in sorted(obj.items(), key=lambda x: -x[1]):
        bar = "█" * score + "░" * (10 - score)
        lines.append(f"- **{criterion}**: {bar} {score}/10")
    if not obj:
        lines.append("_No objection scores._")

    lines += ["", "---", "", "## Kill List", ""]
    kills = review.get("kill_list", [])
    if kills:
        for k in kills:
            lines.append(f"- **{k.get('section', 'Unknown')}** [{k.get('lens', '')}]")
            lines.append(f"  > {k.get('reason', '')}")
    else:
        lines.append("_No kills._")

    lines += ["", "## Fatal Issues", ""]
    fatal = review.get("fatal_issues", [])
    if fatal:
        for f_item in fatal:
            lines.append(f"- {f_item}")
    else:
        lines.append("_None._")

    lines += ["", "## Fixable Issues", ""]
    fixable = review.get("fixable_issues", [])
    if fixable:
        for fi in fixable:
            lines.append(f"- {fi}")
    else:
        lines.append("_None._")

    lines += ["", "---", "", "## Raw Review (JSON)", "", "```json",
              json.dumps(review, indent=2, default=str), "```", ""]

    return "\n".join(lines)


def _format_summary_md(
    iterations_run: list[dict],
    best_iteration: int,
    client_name: str,
    topic: str,
) -> str:
    lines = [
        f"# Pitch Forge Run Summary — {client_name}",
        f"**Topic:** {topic}",
        f"**Date:** {datetime.utcnow().strftime('%Y-%m-%d')}",
        f"**Iterations run:** {len(iterations_run)}",
        f"**Best iteration:** {best_iteration}",
        "",
        "---",
        "",
        "## Iteration Results",
        "",
    ]

    for it in iterations_run:
        overall = it["overall_verdict"]
        lines.append(
            f"### Iteration {it['iteration_num']} "
            f"{_verdict_emoji(overall)} {overall} — Score {it['score']}/100"
        )
        lines.append("")
        lines.append(it.get("sarat_voice_summary", "_No summary._"))
        lines.append("")

    lines += [
        "---",
        "",
        f"## Best Presentation",
        "",
        f"See `final/best_presentation.md` (iteration {best_iteration}).",
        "",
    ]

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run(
    env_id: str,
    business_id: UUID,
    project_id: UUID,
    topic: str,
    max_iterations: int,
) -> int:
    from app.services import pitch_forge as pf_db
    from app.services import pitch_forge_ai as pf_ai

    print(f"\nPitch Forge CLI — {topic}")
    print(f"Project: {project_id}  Env: {env_id}")
    print(f"Max iterations: {max_iterations}")
    print("=" * 60)

    project = pf_db.get_project(
        env_id=env_id, business_id=business_id, project_id=project_id
    )
    client_name = project["client_name"]

    # Load claims once — same research base for all iterations
    claims = pf_db.list_claims(
        env_id=env_id, business_id=business_id, project_id=project_id
    )
    facts = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "fact"]
    constraints = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "constraint"]
    inferences = [{"text": c["claim_text"]} for c in claims if c["claim_category"] == "inference"]
    gaps = [
        {"text": c["claim_text"], "why_it_matters": c.get("unavailable_reason", "unknown")}
        for c in claims if not c["is_available"]
    ]

    iterations_run = []
    best_score = -1
    best_iteration = 1
    best_presentation = ""
    previous_critique = None

    for i in range(1, max_iterations + 1):
        iter_dir = OUTPUT_BASE / f"iteration_{i}"
        print(f"\n[Iteration {i}/{max_iterations}]")

        # --- Generate deck ---
        print(f"  Generating presentation deck...")
        try:
            presentation = pf_ai.generate_presentation_deck(
                client_name=client_name,
                topic=topic,
                facts=facts,
                constraints=constraints,
                inferences=inferences,
                gaps=gaps,
                iteration_num=i,
                previous_critique=previous_critique,
            )
        except ValueError as exc:
            print(f"  ERROR generating deck: {exc}")
            return 1

        _write(iter_dir / "presentation.md", presentation)

        # --- Sarat critique ---
        print(f"  Running Sarat Mode critique...")
        try:
            review = pf_ai.run_sarat_red_team(
                client_name=client_name,
                presentation_content=presentation,
                iteration_num=i,
                max_iterations=max_iterations,
                known_constraints=constraints,
            )
        except ValueError as exc:
            print(f"  ERROR in Sarat critique: {exc}")
            return 1

        critique_md = _format_critique_md(review, i, client_name)
        _write(iter_dir / "critique.md", critique_md)

        overall = review.get("overall_verdict", "REJECT")
        score = review.get("score", 0)
        print(f"  Result: {_verdict_emoji(overall)} {overall} — Score {score}/100")
        print(f"  Sarat: {review.get('sarat_voice_summary', '')[:120]}...")

        iterations_run.append({
            "iteration_num": i,
            "overall_verdict": overall,
            "score": score,
            "sarat_voice_summary": review.get("sarat_voice_summary", ""),
        })

        if score > best_score:
            best_score = score
            best_iteration = i
            best_presentation = presentation

        previous_critique = review

        if overall == "PASS":
            print(f"\n  Sarat approves. Stopping at iteration {i}.")
            break

        if i < max_iterations:
            print(f"  Verdict is {overall}. Rebuilding for iteration {i+1}...")
        else:
            print(f"\n  Max iterations reached. Best score: {best_score}/100 (iteration {best_iteration}).")

    # --- Write final outputs ---
    final_dir = OUTPUT_BASE / "final"
    _write(final_dir / "best_presentation.md", best_presentation)
    _write(
        final_dir / "summary.md",
        _format_summary_md(iterations_run, best_iteration, client_name, topic),
    )

    print(f"\n{'=' * 60}")
    print(f"Done. Best iteration: {best_iteration} ({best_score}/100)")
    print(f"Output: {OUTPUT_BASE.relative_to(REPO_ROOT)}/")
    return 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the Pitch Forge CLI loop for a project and write outputs to demo_docs/."
    )
    parser.add_argument("--env-id", required=True, help="Environment ID")
    parser.add_argument("--business-id", required=True, help="Business UUID")
    parser.add_argument("--project-id", required=True, help="Project UUID")
    parser.add_argument(
        "--topic",
        default="AI-Assisted Operations for Hall Boys Holdings",
        help="Presentation topic / pitch angle",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=3,
        choices=[1, 2, 3],
        help="Max iterations to run (1–3)",
    )

    args = parser.parse_args()

    return run(
        env_id=args.env_id,
        business_id=UUID(args.business_id),
        project_id=UUID(args.project_id),
        topic=args.topic,
        max_iterations=args.iterations,
    )


if __name__ == "__main__":
    raise SystemExit(main())
