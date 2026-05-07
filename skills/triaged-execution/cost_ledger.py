#!/usr/bin/env python3
"""
Triaged execution cost ledger.

Tracks per-step token usage from BOTH sources:
  - Claude Code CLI runs (`claude -p`) recorded by runner.py
  - Cowork subagent runs (Agent tool) recorded manually from session output

Aggregates total cost, then benchmarks against two ungoverned baselines:
  - All-Sonnet baseline: same token volume, every step on Sonnet, no thinking
  - All-Opus baseline:   same token volume, every step on Opus, no thinking

Savings (or premium) vs each baseline tells you whether the triaging is
actually paying off. Triaging wins when:
  - Many cheap steps (Haiku) outweigh a few thinking-heavy steps
  - You spend Opus dollars only on the stakes that warrant them

Triaging is BREAK-EVEN OR PREMIUM when:
  - The plan is dominated by a single C3/C4 + I3/I4 step. There the routing
    correctly picks Opus and adds thinking. That's not waste — it's calibration.
    The right comparison is "what would a wrong call have cost you", not raw $.

Usage:
    # Add a Cowork-side run (paste numbers from the Agent tool's <usage> block)
    python cost_ledger.py add --plan altered_mind_prod --step 1 \\
        --source cowork --model sonnet --input 80000 --output 36000

    # Add a Claude Code CLI run (the runner.py writes these automatically)
    # Manual form:
    python cost_ledger.py add --plan altered_mind_prod --step 2 \\
        --source cli --model haiku --input 5000 --output 1500

    # See the full ledger and cost analysis for a plan
    python cost_ledger.py report --plan altered_mind_prod

    # See all plans
    python cost_ledger.py list
"""

import argparse
import json
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path

# Pricing per 1M tokens (rough, May 2026; adjust against Anthropic console)
PRICES = {
    "haiku":  {"in": 1.0,  "out": 5.0},
    "sonnet": {"in": 3.0,  "out": 15.0},
    "opus":   {"in": 15.0, "out": 75.0},
}

LEDGER_ROOT = Path(__file__).parent / "runs"


@dataclass
class Entry:
    step: int
    source: str          # "cowork" or "cli"
    model: str           # "haiku" / "sonnet" / "opus"
    input_tokens: int
    output_tokens: int
    thinking_tokens: int = 0
    duration_s: float = 0.0
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    note: str = ""

    def cost(self, model_override: str | None = None) -> float:
        m = model_override or self.model
        p = PRICES[m]
        # Thinking tokens are billed as input tokens in Anthropic's API.
        billed_in = self.input_tokens + self.thinking_tokens
        return (billed_in / 1_000_000) * p["in"] + (self.output_tokens / 1_000_000) * p["out"]


def ledger_path(plan: str) -> Path:
    p = LEDGER_ROOT / plan / "_costs.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def load(plan: str) -> list[Entry]:
    p = ledger_path(plan)
    if not p.exists():
        return []
    raw = json.loads(p.read_text(encoding="utf-8"))
    return [Entry(**e) for e in raw]


def save(plan: str, entries: list[Entry]) -> None:
    p = ledger_path(plan)
    p.write_text(json.dumps([asdict(e) for e in entries], indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Optional fan-out to the live AI usage attribution service.
# Configure via env vars:
#   AI_USAGE_API_BASE       e.g. https://novendor.ai
#   AI_USAGE_ENV_ID         the env_id this ledger run is attributed to
#   AI_USAGE_BUSINESS_ID    the business_id (UUID)
#   AI_USAGE_USER_EMAIL     optional, defaults to $USER@novendor.ai
#   AI_USAGE_BUSINESS_UNIT  optional free-text label
# If AI_USAGE_API_BASE is unset, POSTs are skipped silently. The local
# JSON ledger is always written either way.
# ---------------------------------------------------------------------------

def _post_to_api(plan: str, entry: "Entry") -> None:
    import os
    base = os.environ.get("AI_USAGE_API_BASE")
    env_id = os.environ.get("AI_USAGE_ENV_ID")
    business_id = os.environ.get("AI_USAGE_BUSINESS_ID")
    if not (base and env_id and business_id):
        return
    try:
        import urllib.request  # stdlib, no extra deps
        body = {
            "env_id": env_id,
            "business_id": business_id,
            "user_email": os.environ.get("AI_USAGE_USER_EMAIL"),
            "business_unit": os.environ.get("AI_USAGE_BUSINESS_UNIT"),
            "source": entry.source,
            "session_id": None,
            "skill": "triaged-execution",
            "workflow": plan,
            "plan_slug": plan,
            "plan_step": entry.step,
            "decision_ref": None,
            "model": entry.model,
            "model_version": None,
            "cached": False,
            "input_tokens": entry.input_tokens,
            "output_tokens": entry.output_tokens,
            "thinking_tokens": entry.thinking_tokens,
            "cached_input_tokens": 0,
            "duration_ms": int(entry.duration_s * 1000) if entry.duration_s else None,
        }
        req = urllib.request.Request(
            url=base.rstrip("/") + "/api/ai-usage/v1/events",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5).close()  # fire-and-mostly-forget
    except Exception as exc:
        # Never let API failures break the local ledger flow.
        print(f"  (AI usage API POST failed, ledger still saved locally: {exc})")


def add(args) -> None:
    entries = load(args.plan)
    entry = Entry(
        step=args.step,
        source=args.source,
        model=args.model,
        input_tokens=args.input,
        output_tokens=args.output,
        thinking_tokens=args.thinking,
        duration_s=args.duration,
        note=args.note or "",
    )
    entries.append(entry)
    save(args.plan, entries)
    _post_to_api(args.plan, entry)
    print(f"  added: plan={args.plan} step={args.step} source={args.source} "
          f"model={args.model} cost=${entry.cost():.4f}")


def report(args) -> None:
    entries = load(args.plan)
    if not entries:
        print(f"No ledger entries for plan: {args.plan}")
        return

    print()
    print(f"COST LEDGER: {args.plan}")
    print(f"Entries: {len(entries)}   updated: {entries[-1].timestamp}")
    print("-" * 96)
    print(f"{'#':>3} {'src':<6} {'model':<7} {'in':>10} {'out':>10} {'think':>8} "
          f"{'$ actual':>10} {'$ if Sonnet':>13} {'$ if Opus':>11}")
    print("-" * 96)

    actual_total = 0.0
    sonnet_total = 0.0
    opus_total = 0.0
    by_step = {}

    for e in entries:
        c_actual = e.cost()
        c_sonnet = e.cost("sonnet")
        c_opus = e.cost("opus")
        actual_total += c_actual
        sonnet_total += c_sonnet
        opus_total += c_opus
        by_step.setdefault(e.step, []).append(e)
        print(f"{e.step:>3} {e.source:<6} {e.model:<7} {e.input_tokens:>10,} "
              f"{e.output_tokens:>10,} {e.thinking_tokens:>8,} "
              f"${c_actual:>8.3f}  ${c_sonnet:>11.3f}  ${c_opus:>9.3f}")

    print("-" * 96)
    print(f"{'TOTAL':>34} {'':>10} {'':>8} ${actual_total:>8.3f}  "
          f"${sonnet_total:>11.3f}  ${opus_total:>9.3f}")
    print()

    # Comparison
    print("BENCHMARK")
    sonnet_delta = actual_total - sonnet_total
    opus_delta = actual_total - opus_total
    print(f"  Triaged vs all-Sonnet : ${actual_total:.3f}  vs  ${sonnet_total:.3f}  "
          f"({fmt_delta(sonnet_delta, sonnet_total)})")
    print(f"  Triaged vs all-Opus   : ${actual_total:.3f}  vs  ${opus_total:.3f}  "
          f"({fmt_delta(opus_delta, opus_total)})")
    print()

    # Per-source breakdown
    cowork_total = sum(e.cost() for e in entries if e.source == "cowork")
    cli_total = sum(e.cost() for e in entries if e.source == "cli")
    print("BY SOURCE")
    print(f"  Cowork (Agent tool, this conversation) : ${cowork_total:.3f}")
    print(f"  CLI (claude -p via runner.py)          : ${cli_total:.3f}")
    print()

    # Per-step rollup if a step had multiple entries
    multi_step = {s: es for s, es in by_step.items() if len(es) > 1}
    if multi_step:
        print("STEPS WITH MULTIPLE ENTRIES (retries or split runs)")
        for s, es in sorted(multi_step.items()):
            total = sum(e.cost() for e in es)
            print(f"  step {s}: {len(es)} entries, ${total:.3f} total")
        print()


def list_plans(args) -> None:
    if not LEDGER_ROOT.exists():
        print("No plans recorded yet.")
        return
    plans = sorted(p.name for p in LEDGER_ROOT.iterdir() if p.is_dir())
    if not plans:
        print("No plans recorded yet.")
        return
    print()
    print(f"{'plan':<40} {'entries':>8} {'$ total':>10}")
    print("-" * 60)
    for plan in plans:
        entries = load(plan)
        if entries:
            total = sum(e.cost() for e in entries)
            print(f"{plan:<40} {len(entries):>8} ${total:>8.3f}")
    print()


def fmt_delta(delta: float, base: float) -> str:
    if base == 0:
        return "n/a"
    pct = (delta / base) * 100
    if delta < 0:
        return f"saved ${abs(delta):.3f}, {abs(pct):.0f}% cheaper"
    if delta > 0:
        return f"premium ${delta:.3f}, {pct:.0f}% more expensive"
    return "break-even"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    pa = sub.add_parser("add", help="record a step run")
    pa.add_argument("--plan", required=True)
    pa.add_argument("--step", type=int, required=True)
    pa.add_argument("--source", required=True, choices=["cowork", "cli"])
    pa.add_argument("--model", required=True, choices=["haiku", "sonnet", "opus"])
    pa.add_argument("--input", type=int, required=True, help="input tokens (excludes thinking)")
    pa.add_argument("--output", type=int, required=True, help="output tokens")
    pa.add_argument("--thinking", type=int, default=0, help="extended thinking tokens (billed as input)")
    pa.add_argument("--duration", type=float, default=0.0, help="wall-clock seconds")
    pa.add_argument("--note", default="", help="free-text note")
    pa.set_defaults(func=add)

    pr = sub.add_parser("report", help="show ledger and benchmark for a plan")
    pr.add_argument("--plan", required=True)
    pr.set_defaults(func=report)

    pl = sub.add_parser("list", help="list all plans with ledger entries")
    pl.set_defaults(func=list_plans)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
