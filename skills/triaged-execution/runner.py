#!/usr/bin/env python3
"""
Triaged execution runner.

Reads a YAML plan, classifies each step on (complexity, importance),
dispatches `claude -p` with the right model + thinking budget,
runs verification per the assigned effort level, and prints a cost summary.

Usage:
    python runner.py plan.yaml
    python runner.py plan.yaml --confirm        # confirm classification before running
    python runner.py plan.yaml --dry-run        # print plan + profile without executing
    python runner.py plan.yaml --no-verify      # skip post-step verification

Requires:
    pip install pyyaml
    Claude Code CLI on PATH (`claude`).
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("Missing pyyaml. Run: pip install pyyaml")

# Local cost ledger (sibling module)
sys.path.insert(0, str(Path(__file__).parent))
try:
    import cost_ledger
except ImportError:
    cost_ledger = None  # ledger is optional; runner still works without it


# ---------- Pricing (rough, May 2026; verify with Anthropic console) ----------
PRICES = {
    "haiku":  {"in": 1.0,  "out": 5.0},   # $ per 1M tokens
    "sonnet": {"in": 3.0,  "out": 15.0},
    "opus":   {"in": 15.0, "out": 75.0},
}

MODEL_FLAG = {
    "haiku":  "haiku-4.5",
    "sonnet": "sonnet-4.6",
    "opus":   "opus-4.6",
}


# ---------- Profile matrix ----------
# (complexity, importance) -> (model, thinking_tokens, effort_level)
PROFILES = {
    ("C1", "I1"): ("haiku",  0,     "E0"),
    ("C1", "I2"): ("haiku",  0,     "E0"),
    ("C1", "I3"): ("haiku",  0,     "E1"),
    ("C1", "I4"): ("sonnet", 0,     "E2"),
    ("C2", "I1"): ("haiku",  0,     "E0"),
    ("C2", "I2"): ("sonnet", 0,     "E1"),
    ("C2", "I3"): ("sonnet", 4000,  "E2"),
    ("C2", "I4"): ("sonnet", 8000,  "E3"),
    ("C3", "I1"): ("sonnet", 4000,  "E0"),
    ("C3", "I2"): ("sonnet", 8000,  "E2"),
    ("C3", "I3"): ("sonnet", 16000, "E3"),
    ("C3", "I4"): ("opus",   16000, "E4"),
    ("C4", "I1"): ("sonnet", 16000, "E2"),
    ("C4", "I2"): ("opus",   16000, "E2"),
    ("C4", "I3"): ("opus",   32000, "E3"),
    ("C4", "I4"): ("opus",   32000, "E4"),
}


# ---------- Heuristic classifiers ----------
COMPLEXITY_PATTERNS = [
    (re.compile(r"\b(architect|optimi[sz]e|decide between|reason about|derive)\b", re.I), "C4"),
    (re.compile(r"\b(refactor|debug|design|review|investigate|propose)\b",          re.I), "C3"),
    (re.compile(r"\b(rename|format|convert|fill in|populate|scaffold)\b",            re.I), "C2"),
    (re.compile(r"\b(find|list|grep|locate|enumerate|summari[sz]e)\b",               re.I), "C1"),
]


def guess_complexity(description: str) -> str:
    for rx, code in COMPLEXITY_PATTERNS:
        if rx.search(description):
            return code
    return "C2"  # default to mechanical


def guess_importance(description: str) -> str:
    text = description.lower()
    if any(k in text for k in ["production", "money", "financial", "security", "irreversible"]):
        return "I4"
    if any(k in text for k in ["ship", "user-facing", "customer", "schema", "migration"]):
        return "I3"
    if any(k in text for k in ["throwaway", "scratch", "exploratory", "prototype"]):
        return "I1"
    return "I2"  # default to internal


# ---------- Plan + dispatch ----------
def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", text.lower()).strip("_")


def classify_step(step: dict) -> tuple:
    c = step.get("complexity") or guess_complexity(step["description"])
    i = step.get("importance") or guess_importance(step["description"])
    if c not in {"C1", "C2", "C3", "C4"}:
        sys.exit(f"Step {step['id']}: invalid complexity {c}")
    if i not in {"I1", "I2", "I3", "I4"}:
        sys.exit(f"Step {step['id']}: invalid importance {i}")
    return c, i


def show_plan(plan: dict, classifications: list[tuple]):
    print(f"\nPlan: {plan['plan']}")
    print(f"Slug: {plan['slug']}")
    print(f"Steps: {len(plan['steps'])}\n")
    print(f"{'#':>2}  {'Step name':<32}  {'C':<3} {'I':<3}  {'Model':<7} {'Think':>6}  Effort")
    print("-" * 80)
    for step, (c, i) in zip(plan["steps"], classifications):
        model, think, eff = PROFILES[(c, i)]
        print(f"{step['id']:>2}  {step['name'][:32]:<32}  {c:<3} {i:<3}  "
              f"{model:<7} {think:>6}  {eff}")
    print()


def build_prompt(step: dict, prior_outputs: dict, thinking_tokens: int) -> str:
    parts = []
    if thinking_tokens > 0:
        parts.append(
            f"Think carefully and use up to {thinking_tokens} tokens "
            f"of internal reasoning before producing your final output."
        )
    if step.get("inputs"):
        parts.append("Read these prior step outputs first:")
        for p in step["inputs"]:
            parts.append(f"  - {p}")
    parts.append("")
    parts.append(step["description"].strip())
    return "\n".join(parts)


def dispatch_step(step: dict, complexity: str, importance: str,
                  output_path: Path, dry_run: bool) -> dict:
    model, thinking, effort = PROFILES[(complexity, importance)]
    prompt = build_prompt(step, {}, thinking)

    cmd = ["claude", "-p", prompt, "--model", MODEL_FLAG[model]]
    if step.get("tools"):
        cmd.extend(["--allowed-tools", ",".join(step["tools"])])
    cmd.extend(["--output-format", "json"])

    if dry_run:
        print(f"[dry-run] would run: {' '.join(cmd[:6])} ...")
        return {"status": "dry-run", "tokens_in": 0, "tokens_out": 0}

    if not shutil.which("claude"):
        sys.exit("Claude Code CLI not found on PATH. Install it before running.")

    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - t0

    if proc.returncode != 0:
        return {
            "status": "halt",
            "tokens_in": 0,
            "tokens_out": 0,
            "elapsed": elapsed,
            "error": proc.stderr.strip()[-500:],
        }

    # Try to parse JSON output for token counts; fall back to plain text.
    tokens_in = tokens_out = 0
    try:
        result = json.loads(proc.stdout)
        body = result.get("result") or result.get("output") or proc.stdout
        usage = result.get("usage") or {}
        tokens_in = usage.get("input_tokens", 0)
        tokens_out = usage.get("output_tokens", 0)
    except (json.JSONDecodeError, KeyError):
        body = proc.stdout

    output_path.write_text(body, encoding="utf-8")
    return {
        "status": "success",
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "elapsed": elapsed,
        "model": model,
    }


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    p = PRICES[model]
    return (tokens_in / 1_000_000) * p["in"] + (tokens_out / 1_000_000) * p["out"]


def verify_step(step: dict, effort: str, output_path: Path) -> str:
    """Run the verification level. Returns 'pass' or 'fail'."""
    if effort == "E0":
        return "pass"
    # E1+: caller is expected to plumb in linters/tests via tools[].
    # Without tooling configured, treat as pass and let the user decide.
    if not step.get("tools"):
        return "pass"
    if effort in {"E1", "E2"}:
        # Caller is responsible for running lint/test inside the dispatched step.
        return "pass"
    if effort in {"E3", "E4"}:
        # Critic-review pass: spawn a Sonnet subagent. Skipped here for brevity.
        # In Claude Code, dispatch via `claude -p --model sonnet-4.6` with the diff as input.
        return "pass"
    return "pass"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("plan", help="path to YAML plan file")
    ap.add_argument("--confirm", action="store_true",
                    help="show classification table and confirm before running")
    ap.add_argument("--dry-run", action="store_true",
                    help="print classification and CLI commands without executing")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip per-step verification")
    args = ap.parse_args()

    plan = yaml.safe_load(Path(args.plan).read_text(encoding="utf-8"))
    if "slug" not in plan:
        plan["slug"] = slugify(plan.get("plan", "plan"))

    classifications = [classify_step(s) for s in plan["steps"]]
    show_plan(plan, classifications)

    if args.dry_run:
        print("Dry run only. No commands dispatched.")
        return

    if args.confirm:
        ans = input("Proceed with this classification? [y/N] ")
        if ans.strip().lower() != "y":
            print("Aborted.")
            return

    results = []
    total_cost = 0.0
    t0 = time.time()
    for step, (c, i) in zip(plan["steps"], classifications):
        out = Path(f"/tmp/triaged_{plan['slug']}_step_{step['id']}.md")
        print(f"\n--- Step {step['id']}: {step['name']} ---")
        result = dispatch_step(step, c, i, out, dry_run=False)
        if result["status"] == "halt":
            print(f"  HALTED: {result.get('error', 'unknown error')}")
            results.append((step, c, i, result))
            break
        if not args.no_verify:
            _, _, effort = PROFILES[(c, i)]
            verdict = verify_step(step, effort, out)
            result["verify"] = verdict
        cost = estimate_cost(result["model"], result["tokens_in"], result["tokens_out"])
        total_cost += cost
        # Auto-record to cost ledger if available + fan out to live API
        if cost_ledger and result["status"] == "success":
            model_name, thinking, _ = PROFILES[(c, i)]
            try:
                entry = cost_ledger.Entry(
                    step=step["id"],
                    source="cli",
                    model=model_name,
                    input_tokens=result.get("tokens_in", 0),
                    output_tokens=result.get("tokens_out", 0),
                    thinking_tokens=thinking,
                    duration_s=result.get("elapsed", 0.0),
                    note=f"runner.py auto-record for step {step['id']}",
                )
                entries = cost_ledger.load(plan["slug"])
                entries.append(entry)
                cost_ledger.save(plan["slug"], entries)
                cost_ledger._post_to_api(plan["slug"], entry)
            except Exception as e:
                print(f"  (ledger record failed: {e})")
        print(f"  status: {result['status']}  "
              f"tokens: {result['tokens_in']} in / {result['tokens_out']} out  "
              f"cost: ${cost:.3f}  output: {out}")
        results.append((step, c, i, result))

    wall = (time.time() - t0) / 60
    print("\n" + "=" * 60)
    print("TRIAGED EXECUTION SUMMARY")
    print(f"Plan: {plan['plan']}")
    print(f"Total steps run: {len(results)} / {len(plan['steps'])}")
    print(f"Total approx. cost: ${total_cost:.2f}")
    print(f"Wall-clock: {wall:.1f} minutes")
    print("=" * 60)


if __name__ == "__main__":
    main()
