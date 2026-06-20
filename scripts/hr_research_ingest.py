#!/usr/bin/env python3
"""Weekly History Rhymes research-brief auto-ingest — v1 thin submitter.

Closes the manual gap: instead of a human pasting the weekly research brief into
the planning UI, this script feeds a generated brief markdown straight into the
canonical ingestion route `POST /api/hr/v1/research/briefs`. The route remains
the single orchestration path (run tracking + deterministic extraction +
candidate + planning-markdown persistence) — this script adds no parsing and no
LLM. Distinct from `scripts/hr_weekly_brief.py`, which persists the
execution-layer regime brief (`hr_weekly_briefs`).

Usage:
    # Submit a generated research brief markdown file:
    python scripts/hr_research_ingest.py --input docs/historyrhymes/briefs/HR_Weekly_Brief_2026-05-18.md

    # From stdin:
    cat brief.md | python scripts/hr_research_ingest.py --input -

    # Show the exact payload without posting (safe for scheduled validation):
    python scripts/hr_research_ingest.py --input brief.md --dry-run

Metadata is derived deterministically (no AI):
    brief_date    : --brief-date, else a YYYY-MM-DD in the filename, else today (UTC)
    week_type     : --week-type, else 4-week ISO-week rotation ("Week 1".."Week 4")
    pillar_name   : --pillar, else the rotation pillar for week_type
    title         : --title, else the first markdown "# " heading, else None
    source_filename: input file basename (None for stdin)

Target base URL: --base-url, else $HR_RESEARCH_API_BASE, else http://127.0.0.1:8000.

Exit codes mirror scripts/hr_weekly_brief.py:
    0  brief ingested (INCLUDING a degraded brief — degraded still persists with
       warnings and zero candidates, which is a successful, fail-closed ingest)
    1  hard failure (network error, non-2xx response, unreadable input)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
INGEST_PATH = "/api/hr/v1/research/briefs"

# 4-week rotating pillars — must match the planning UI (PILLARS in
# repo-b/src/components/historyrhymes/ResearchBriefUpload.tsx) and the original
# History Rhymes weekly-research pillar rotation.
PILLAR_ROTATION: dict[str, str] = {
    "Week 1": "Novel Signals & Data Sources",
    "Week 2": "Methodology & Model Improvements",
    "Week 3": "Competitive & Structural Intelligence",
    "Week 4": "Adversarial & Regime-Change Research",
}

_DATE_IN_NAME = re.compile(r"(\d{4}-\d{2}-\d{2})")
_H1 = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)


class IngestError(RuntimeError):
    """Raised when the brief cannot be submitted (network / non-2xx / input)."""


# ── Pure helpers (unit-tested without network) ────────────────────────────────


def week_type_for(d: datetime) -> str:
    """Deterministic 4-week rotation keyed on ISO week number."""
    iso_week = d.isocalendar()[1]
    return f"Week {((iso_week - 1) % 4) + 1}"


def pillar_for(week_type: str) -> str:
    return PILLAR_ROTATION.get(week_type, PILLAR_ROTATION["Week 1"])


def _derive_brief_date(
    brief_date_arg: str | None, input_path: str | None
) -> str:
    if brief_date_arg:
        # Validate shape; raise early rather than send a bad payload.
        datetime.strptime(brief_date_arg, "%Y-%m-%d")
        return brief_date_arg
    if input_path and input_path != "-":
        m = _DATE_IN_NAME.search(Path(input_path).name)
        if m:
            return m.group(1)
    return datetime.now(timezone.utc).date().isoformat()


def _derive_title(markdown: str, title_arg: str | None) -> str | None:
    if title_arg:
        return title_arg
    m = _H1.search(markdown)
    return m.group(1).strip() if m else None


def build_payload(
    markdown: str,
    *,
    input_path: str | None = None,
    brief_date_arg: str | None = None,
    week_type_arg: str | None = None,
    pillar_arg: str | None = None,
    title_arg: str | None = None,
) -> dict[str, Any]:
    """Build the exact /research/briefs request body. Pure; no AI; no parsing."""
    if not markdown or not markdown.strip():
        raise IngestError("Brief markdown is empty.")

    brief_date = _derive_brief_date(brief_date_arg, input_path)
    week_type = week_type_arg or week_type_for(
        datetime.strptime(brief_date, "%Y-%m-%d")
    )
    pillar_name = pillar_arg or pillar_for(week_type)
    source_filename = (
        Path(input_path).name if input_path and input_path != "-" else None
    )

    return {
        "brief_date": brief_date,
        "week_type": week_type,
        "pillar_name": pillar_name,
        "title": _derive_title(markdown, title_arg),
        "source_filename": source_filename,
        "markdown_content": markdown,
    }


def _default_post(url: str, body: bytes, timeout: float) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        # Non-2xx — surface body for diagnostics, do not swallow.
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        raise IngestError(f"Network error reaching {url}: {exc.reason}") from exc


def submit(
    payload: dict[str, Any],
    base_url: str,
    *,
    timeout: float = 30.0,
    _post: Callable[[str, bytes, float], tuple[int, str]] | None = None,
) -> dict[str, Any]:
    """POST the payload to the ingestion route. Returns the parsed response.

    Raises IngestError on network failure or any non-2xx status (fail closed —
    a degraded *extraction* still returns HTTP 200 from the route, so a non-2xx
    here is a genuine submission failure, not a degraded brief).

    `_post` resolves at call time (not as a bound default) so the module-level
    `_default_post` stays patchable in tests.
    """
    post = _post or _default_post
    url = base_url.rstrip("/") + INGEST_PATH
    status, raw = post(url, json.dumps(payload).encode("utf-8"), timeout)
    if status < 200 or status >= 300:
        raise IngestError(f"{url} returned HTTP {status}: {raw[:500]}")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise IngestError(f"Non-JSON response from {url}: {raw[:300]}") from exc


def _read_markdown(source: str) -> str:
    if source == "-":
        return sys.stdin.read()
    path = Path(source)
    if not path.exists():
        raise IngestError(f"Input file not found: {source}")
    return path.read_text(encoding="utf-8")


# ── Entry point ───────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Auto-ingest a History Rhymes weekly research brief."
    )
    parser.add_argument(
        "--input", required=True, help="Brief markdown file path, or '-' for stdin."
    )
    parser.add_argument("--brief-date", help="YYYY-MM-DD (default: from filename or today).")
    parser.add_argument("--week-type", help='e.g. "Week 1" (default: ISO-week rotation).')
    parser.add_argument("--pillar", help="Pillar name (default: rotation for week).")
    parser.add_argument("--title", help="Brief title (default: first markdown heading).")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("HR_RESEARCH_API_BASE", DEFAULT_BASE_URL),
        help="Backend base URL (default: $HR_RESEARCH_API_BASE or local).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the payload and exit 0 without posting.",
    )
    args = parser.parse_args(argv)

    try:
        markdown = _read_markdown(args.input)
        payload = build_payload(
            markdown,
            input_path=args.input,
            brief_date_arg=args.brief_date,
            week_type_arg=args.week_type,
            pillar_arg=args.pillar,
            title_arg=args.title,
        )

        if args.dry_run:
            preview = dict(payload)
            preview["markdown_content"] = (
                f"<{len(markdown)} chars omitted in dry-run>"
            )
            print(json.dumps({"dry_run": True, "payload": preview}, indent=2))
            return 0

        result = submit(payload, args.base_url)
        brief = result.get("brief") or {}
        summary = {
            "brief_id": brief.get("brief_id"),
            "brief_date": payload["brief_date"],
            "week_type": payload["week_type"],
            "pillar_name": payload["pillar_name"],
            "candidate_count": len(result.get("candidates") or []),
            "degraded": bool(result.get("degraded")),
            "confidence": result.get("confidence"),
            "warnings": result.get("warnings") or [],
            "posted_to": args.base_url.rstrip("/") + INGEST_PATH,
        }
        print(json.dumps(summary))
        return 0

    except IngestError as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
