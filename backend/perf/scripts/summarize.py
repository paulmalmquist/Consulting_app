#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import median


@dataclass
class Thresholds:
    p95_ms: float
    p99_ms: float
    error_rate: float


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _metrics_from_summary(payload: dict) -> dict:
    metrics = payload.get("metrics", {})
    dur = ((metrics.get("http_req_duration") or {}).get("values") or {})
    failed = ((metrics.get("http_req_failed") or {}).get("values") or {})

    def _rate(name: str) -> float:
        values = ((metrics.get(name) or {}).get("values") or {})
        return float(values.get("rate", 0.0) or 0.0)

    return {
        "requests": int(dur.get("count", 0) or 0),
        "p50_ms": float(dur.get("med", 0.0) or 0.0),
        "p95_ms": float(dur.get("p(95)", 0.0) or 0.0),
        "p99_ms": float(dur.get("p(99)", 0.0) or 0.0),
        "max_ms": float(dur.get("max", 0.0) or 0.0),
        "error_rate": float(failed.get("rate", 0.0) or 0.0),
        "citation_missing_rate": _rate("citation_missing"),
        "header_missing_rate": _rate("header_missing"),
        "diagnostics_missing_rate": _rate("diagnostics_missing"),
    }


def _classify_bottleneck(kind: str, stats: dict) -> list[dict]:
    recs: list[dict] = []

    if kind == "ai" and stats["citation_missing_rate"] > 0.01:
        recs.append(
            {
                "class": "retrieval-bound",
                "recommendation": "Increase retrieval recall via hybrid lexical+embedding search and rerank before prompt assembly.",
            }
        )
    if kind == "ai" and stats["error_rate"] > 0.02:
        recs.append(
            {
                "class": "sidecar-bound",
                "recommendation": "Add sidecar circuit breaker and fallback model tier with timeout budget partitioning.",
            }
        )
    if kind == "metrics" and stats["p95_ms"] > 600:
        recs.append(
            {
                "class": "sql-bound",
                "recommendation": "Add covering indexes for dominant predicates and pre-aggregate common metric/date windows.",
            }
        )

    if not recs:
        recs.append(
            {
                "class": "none",
                "recommendation": "No dominant bottleneck identified. Continue trend monitoring.",
            }
        )
    return recs


def summarize_cmd(args: argparse.Namespace) -> int:
    summary = _load_json(Path(args.input))
    stats = _metrics_from_summary(summary)
    thresholds = Thresholds(args.p95_ms, args.p99_ms, args.error_rate)

    checks = {
        "p95_pass": stats["p95_ms"] <= thresholds.p95_ms,
        "p99_pass": stats["p99_ms"] <= thresholds.p99_ms,
        "error_pass": stats["error_rate"] < thresholds.error_rate,
        "header_pass": stats["header_missing_rate"] < 0.01,
        "diagnostics_pass": stats["diagnostics_missing_rate"] < 0.01,
    }
    if args.kind == "ai":
        checks["citation_pass"] = stats["citation_missing_rate"] < 0.01

    out = {
        "scenario": args.scenario,
        "kind": args.kind,
        "tier": args.tier,
        "profile": args.profile,
        "run_id": args.run_id,
        "summary_file": str(Path(args.input).resolve()),
        "stats": stats,
        "thresholds": {
            "p95_ms": thresholds.p95_ms,
            "p99_ms": thresholds.p99_ms,
            "error_rate": thresholds.error_rate,
        },
        "checks": checks,
        "pass": all(checks.values()),
        "recommendations": _classify_bottleneck(args.kind, stats),
    }

    Path(args.output).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scenario": args.scenario, "pass": out["pass"]}))
    return 0


def baseline_cmd(args: argparse.Namespace) -> int:
    reports = [_load_json(Path(p)) for p in args.inputs]
    if len(reports) < 1:
        raise ValueError("baseline-build requires at least one report")

    def _med(path: list[float]) -> float:
        return float(median(path))

    stats_sets = [r.get("stats", {}) for r in reports]
    baseline = {
        "scenario": args.scenario,
        "kind": reports[0].get("kind"),
        "tier": reports[0].get("tier"),
        "profile": reports[0].get("profile"),
        "sample_size": len(reports),
        "stats": {
            "p50_ms": _med([float(s.get("p50_ms", 0.0)) for s in stats_sets]),
            "p95_ms": _med([float(s.get("p95_ms", 0.0)) for s in stats_sets]),
            "p99_ms": _med([float(s.get("p99_ms", 0.0)) for s in stats_sets]),
            "error_rate": _med([float(s.get("error_rate", 0.0)) for s in stats_sets]),
            "citation_missing_rate": _med([float(s.get("citation_missing_rate", 0.0)) for s in stats_sets]),
            "header_missing_rate": _med([float(s.get("header_missing_rate", 0.0)) for s in stats_sets]),
            "diagnostics_missing_rate": _med([float(s.get("diagnostics_missing_rate", 0.0)) for s in stats_sets]),
        },
    }
    Path(args.output).write_text(json.dumps(baseline, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scenario": args.scenario, "baseline": args.output}))
    return 0


def compare_cmd(args: argparse.Namespace) -> int:
    current = _load_json(Path(args.current))
    baseline = _load_json(Path(args.baseline))

    cur_p95 = float(current.get("stats", {}).get("p95_ms", 0.0))
    base_p95 = float(baseline.get("stats", {}).get("p95_ms", 0.0))
    cur_err = float(current.get("stats", {}).get("error_rate", 0.0))
    base_err = float(baseline.get("stats", {}).get("error_rate", 0.0))

    if base_p95 <= 0:
        p95_regress_pct = 0.0
    else:
        p95_regress_pct = ((cur_p95 - base_p95) / base_p95) * 100.0

    error_delta = cur_err - base_err
    p95_regression_fail = p95_regress_pct > args.max_p95_regression_pct

    out = {
        "scenario": current.get("scenario"),
        "current": str(Path(args.current).resolve()),
        "baseline": str(Path(args.baseline).resolve()),
        "p95_regress_pct": p95_regress_pct,
        "error_delta": error_delta,
        "max_p95_regression_pct": args.max_p95_regression_pct,
        "regression_fail": p95_regression_fail,
        "pass": (not p95_regression_fail) and bool(current.get("pass", False)),
    }

    Path(args.output).write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"scenario": out["scenario"], "pass": out["pass"]}))
    return 0


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Summarize and compare backend perf runs")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("summarize")
    s.add_argument("--input", required=True)
    s.add_argument("--output", required=True)
    s.add_argument("--scenario", required=True)
    s.add_argument("--kind", choices=["ai", "metrics"], required=True)
    s.add_argument("--tier", required=True)
    s.add_argument("--profile", required=True)
    s.add_argument("--run-id", required=True)
    s.add_argument("--p95-ms", type=float, required=True)
    s.add_argument("--p99-ms", type=float, required=True)
    s.add_argument("--error-rate", type=float, required=True)
    s.set_defaults(func=summarize_cmd)

    b = sub.add_parser("baseline-build")
    b.add_argument("--scenario", required=True)
    b.add_argument("--inputs", nargs="+", required=True)
    b.add_argument("--output", required=True)
    b.set_defaults(func=baseline_cmd)

    c = sub.add_parser("compare")
    c.add_argument("--current", required=True)
    c.add_argument("--baseline", required=True)
    c.add_argument("--output", required=True)
    c.add_argument("--max-p95-regression-pct", type=float, default=20.0)
    c.set_defaults(func=compare_cmd)

    return p


def main() -> int:
    args = _parser().parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
