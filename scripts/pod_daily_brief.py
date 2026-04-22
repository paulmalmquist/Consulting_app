#!/usr/bin/env python3
"""Daily podcast intelligence brief.

Aggregates the last 24h of episode analysis into a single daily-brief row
in podcast_daily_briefs AND writes a human-readable markdown summary to
docs/podcast-intelligence/daily/YYYY-MM-DD.md.

Schedule (planned): daily 8:00 AM, after pod_narrative_velocity.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from dotenv import load_dotenv
    load_dotenv(backend_dir / ".env", override=True)

    from app.db import get_cursor

    today = date.today()
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    with get_cursor() as cur:
        # Episodes analyzed in the last 24h
        cur.execute(
            """
            SELECT episode_id, title, extraction_status, metadata
            FROM public.podcast_episodes
            WHERE updated_at > %s AND extraction_status IN ('completed', 'partial')
            ORDER BY updated_at DESC
            """,
            (since,),
        )
        episodes = cur.fetchall()

        # Top novelty narratives (proxy for emerging ideas)
        cur.execute(
            """
            SELECT narrative_label, conviction, novelty_score, episode_id
            FROM public.podcast_narratives
            WHERE created_at > %s
            ORDER BY novelty_score DESC NULLS LAST, conviction DESC NULLS LAST
            LIMIT 10
            """,
            (since,),
        )
        top_emerging = cur.fetchall()

        # Crowding alerts from velocity table
        cur.execute(
            """
            SELECT narrative_label, mention_count, unique_speakers,
                   conviction_avg, crowding_risk
            FROM public.podcast_narrative_velocity
            WHERE crowding_risk IN ('moderate', 'elevated', 'high', 'extreme')
            ORDER BY
                CASE crowding_risk
                    WHEN 'extreme' THEN 1 WHEN 'high' THEN 2
                    WHEN 'elevated' THEN 3 WHEN 'moderate' THEN 4
                    ELSE 5 END,
                mention_count DESC
            LIMIT 10
            """
        )
        crowding = cur.fetchall()

    # Pull synthesis summaries
    syntheses = []
    for ep in episodes:
        meta = ep.get("metadata") or {}
        synth = meta.get("synthesis")
        if synth:
            syntheses.append({
                "title": ep["title"],
                "dominant_narrative": synth.get("dominant_narrative"),
                "most_actionable": synth.get("single_most_actionable"),
            })

    # Persist brief row (if any episodes today)
    if episodes:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.podcast_daily_briefs (
                    tenant_id, brief_date, episodes_analyzed,
                    top_emerging_ideas, crowding_alerts, full_summary
                ) VALUES (NULL, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, brief_date) DO UPDATE SET
                    episodes_analyzed = EXCLUDED.episodes_analyzed,
                    top_emerging_ideas = EXCLUDED.top_emerging_ideas,
                    crowding_alerts = EXCLUDED.crowding_alerts,
                    full_summary = EXCLUDED.full_summary
                """,
                (
                    today,
                    len(episodes),
                    json.dumps([{"narrative": r["narrative_label"],
                                 "novelty": float(r["novelty_score"] or 0),
                                 "conviction": float(r["conviction"] or 0)}
                                for r in top_emerging[:5]]),
                    json.dumps([{"narrative": r["narrative_label"],
                                 "crowding": r["crowding_risk"],
                                 "mentions": r["mention_count"]}
                                for r in crowding[:5]]),
                    _markdown_summary(episodes, top_emerging, crowding, syntheses),
                ),
            )

    # Write markdown daily brief
    out_dir = repo_root / "docs" / "podcast-intelligence" / "daily"
    out_dir.mkdir(parents=True, exist_ok=True)
    md = _markdown_summary(episodes, top_emerging, crowding, syntheses)
    (out_dir / f"{today.isoformat()}.md").write_text(md)

    print(json.dumps({
        "status": "done",
        "episodes_analyzed": len(episodes),
        "top_emerging": len(top_emerging),
        "crowding_alerts": len(crowding),
        "output": f"docs/podcast-intelligence/daily/{today.isoformat()}.md",
    }))
    return 0


def _markdown_summary(episodes, top_emerging, crowding, syntheses) -> str:
    lines = [f"# Podcast Intelligence Daily Brief — {date.today().isoformat()}", ""]
    lines.append(f"_{len(episodes)} episodes analyzed in the last 24h._")
    lines.append("")

    if crowding:
        lines.append("## ⚠️ Crowding Alerts (cross-episode)")
        lines.append("")
        lines.append("| Narrative | Mentions | Speakers | Conviction | Risk |")
        lines.append("|---|---:|---:|---:|---|")
        for c in crowding[:8]:
            lines.append(
                f"| {c['narrative_label'][:60]} | {c['mention_count']} | "
                f"{c['unique_speakers']} | {float(c['conviction_avg']):.0f} | {c['crowding_risk']} |"
            )
        lines.append("")

    if top_emerging:
        lines.append("## 🌱 Top Emerging Ideas (last 24h)")
        lines.append("")
        for r in top_emerging[:5]:
            lines.append(
                f"- **{r['narrative_label']}** — novelty {float(r['novelty_score'] or 0):.0f}, "
                f"conviction {float(r['conviction'] or 0):.0f}"
            )
        lines.append("")

    if syntheses:
        lines.append("## 📖 Per-Episode Synthesis")
        lines.append("")
        for s in syntheses:
            lines.append(f"### {s['title']}")
            if s.get("dominant_narrative"):
                lines.append(f"- **Dominant:** {s['dominant_narrative']}")
            act = s.get("most_actionable")
            if act and isinstance(act, dict) and act.get("thesis"):
                lines.append(
                    f"- **Actionable:** `{act.get('direction')}` "
                    f"{act.get('asset_or_ticker')} — conv={act.get('conviction')}"
                )
                lines.append(f"    > {act.get('thesis')[:200]}")
            lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    sys.exit(main())
