"""Phase 1 gate-check report generator.

Queries the podcast_intelligence tables and emits a markdown report to
docs/podcast-intelligence/phase1-gate-check.md showing:

  - Episodes ingested and their transcription/extraction status
  - Signal yield per episode × extraction_model (Phase 0 vs Phase 1 delta)
  - Speaker attribution coverage (K1/K3 fix validation)
  - Sample macro views, trade ideas, analogs, narratives
  - Adversarial scores

Run: python backend/scripts/podcast_phase1_report.py
"""

from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / "backend" / ".env", override=True)
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.db import get_cursor  # noqa: E402


OUT_DIR = REPO_ROOT / "docs" / "podcast-intelligence"
OUT_FILE = OUT_DIR / "phase1-gate-check.md"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    add = lines.append

    add("# Podcast Intelligence — Phase 1 Gate Check")
    add("")
    add(f"_Generated: {datetime.utcnow().isoformat()}Z_")
    add("")
    add("Full end-to-end Phase 1 pipeline run: YouTube ingest → auto-caption "
        "transcription → sentence+speaker-turn chunking → 4-pass extraction "
        "(GPT-4o structured + Claude nuanced + Claude adversarial) → "
        "speaker resolver with fuzzy fallback → signals land in 7 tables.")
    add("")

    with get_cursor() as cur:
        # ── Episode roster ────────────────────────────────────────────────
        cur.execute("""
            SELECT e.episode_id, e.title, e.transcription_model,
                   e.transcription_status, e.extraction_status,
                   LENGTH(e.transcript_raw) AS transcript_chars,
                   e.duration_seconds, e.created_at,
                   s.name AS source_name
            FROM podcast_episodes e
            LEFT JOIN podcast_sources s ON s.source_id = e.source_id
            ORDER BY e.created_at DESC
        """)
        episodes = cur.fetchall()

        add("## Episodes")
        add("")
        add("| Source | Title | Duration | Transcript | Status |")
        add("|---|---|---|---|---|")
        for ep in episodes:
            dur = f"{ep['duration_seconds']//60}m" if ep['duration_seconds'] else "—"
            t_chars = f"{ep['transcript_chars']:,}" if ep['transcript_chars'] else "0"
            title = (ep['title'] or '')[:60].replace("|", "\\|")
            src = (ep['source_name'] or '?')[:25]
            add(f"| {src} | {title} | {dur} | {t_chars} | {ep['extraction_status']} |")
        add("")

        # ── Signal yield per episode ──────────────────────────────────────
        add("## Signal Yield per Episode")
        add("")
        add("Counts broken out by `extraction_model` so Phase 0 (legacy standalone "
            "pipeline) and Phase 1 (backend service) rows are distinguishable on "
            "the same episode.")
        add("")
        add("| Episode | Model | macro | trade | narr | analog | uncert | speakers |")
        add("|---|---|---:|---:|---:|---:|---:|---:|")

        for ep in episodes:
            eid = ep["episode_id"]
            # Collect all extraction_models seen for this episode
            cur.execute("""
                SELECT DISTINCT extraction_model FROM (
                    SELECT extraction_model FROM podcast_macro_views WHERE episode_id=%s
                    UNION SELECT extraction_model FROM podcast_trade_ideas WHERE episode_id=%s
                    UNION SELECT extraction_model FROM podcast_narratives WHERE episode_id=%s
                    UNION SELECT extraction_model FROM podcast_analogs WHERE episode_id=%s
                ) x WHERE extraction_model IS NOT NULL
            """, (eid, eid, eid, eid))
            models = [r["extraction_model"] for r in cur.fetchall()] or ["(none)"]
            title_short = (ep['title'] or '')[:40].replace("|", "\\|")
            for i, model in enumerate(models):
                cols = {}
                for tbl, key in [
                    ("podcast_macro_views", "macro"),
                    ("podcast_trade_ideas", "trade"),
                    ("podcast_narratives", "narr"),
                    ("podcast_analogs", "analog"),
                ]:
                    cur.execute(f"SELECT COUNT(*) c FROM {tbl} WHERE episode_id=%s AND extraction_model=%s", (eid, model))
                    cols[key] = cur.fetchone()["c"]
                # uncertainty + speakers are not split by model
                if i == 0:
                    cur.execute("SELECT COUNT(*) c FROM podcast_uncertainty_markers WHERE episode_id=%s", (eid,))
                    unc = cur.fetchone()["c"]
                    cur.execute("SELECT COUNT(*) c FROM podcast_episode_speakers WHERE episode_id=%s", (eid,))
                    spk = cur.fetchone()["c"]
                else:
                    unc = spk = ""
                ep_label = title_short if i == 0 else "  "
                add(f"| {ep_label} | `{model}` | {cols['macro']} | {cols['trade']} | {cols['narr']} | {cols['analog']} | {unc} | {spk} |")
        add("")

        # ── Speaker predictions (Phase 3.2) ───────────────────────────────
        cur.execute("""
            SELECT COUNT(*) total,
                   COUNT(*) FILTER (WHERE predicted_direction='up') ups,
                   COUNT(*) FILTER (WHERE predicted_direction='down') downs,
                   COUNT(*) FILTER (WHERE predicted_direction='flat') flats,
                   COUNT(*) FILTER (WHERE predicted_direction='range') ranges
            FROM speaker_predictions WHERE resolution_status='open'
        """)
        pred = cur.fetchone()
        if pred and pred["total"]:
            add("## Speaker Predictions (Phase 3.2)")
            add("")
            add(f"**{pred['total']} resolvable predictions** extracted from macro_views + "
                f"high-conviction trade_ideas and persisted as `speaker_predictions` with "
                f"`resolution_status='open'`. Phase 5 resolver will score them against "
                f"market data and build per-speaker Brier score + hit rate over time.")
            add("")
            add(f"Direction split: **{pred['ups']} up / {pred['downs']} down / "
                f"{pred['flats']} flat / {pred['ranges']} range**.")
            add("")
            cur.execute("""
                SELECT s.name, COUNT(*) c,
                       COUNT(*) FILTER (WHERE predicted_direction='up') ups,
                       COUNT(*) FILTER (WHERE predicted_direction='down') downs
                FROM speaker_predictions p JOIN podcast_speakers s ON s.speaker_id=p.speaker_id
                WHERE p.resolution_status='open'
                  AND s.normalized_name NOT LIKE '\\_\\_unattributed%%'
                GROUP BY s.name ORDER BY c DESC LIMIT 10
            """)
            add("**Top named predictors (pending resolution):**")
            add("")
            add("| Speaker | Total | Bullish | Bearish |")
            add("|---|---:|---:|---:|")
            for r in cur.fetchall():
                add(f"| {r['name']} | {r['c']} | {r['ups']} | {r['downs']} |")
            add("")

        # ── Trading lab promotions (Phase 4.2) ────────────────────────────
        cur.execute("""
            SELECT COUNT(*) c,
                   SUM(CASE WHEN direction='bullish' THEN 1 ELSE 0 END) bull,
                   SUM(CASE WHEN direction='bearish' THEN 1 ELSE 0 END) bear,
                   SUM(CASE WHEN direction='neutral' THEN 1 ELSE 0 END) neut
            FROM trading_signals WHERE evidence->>'origin' = 'podcast'
        """)
        promo = cur.fetchone()
        if promo and promo["c"]:
            add("## Trading Lab Promotions (Phase 4.2)")
            add("")
            add(f"**{promo['c']} podcast signals** promoted to `public.trading_signals` with "
                f"`source='ai_generated'` and `evidence->>'origin'='podcast'`. "
                f"Direction split: **{promo['bull']} bullish / {promo['bear']} bearish / "
                f"{promo['neut']} neutral**. Promotion gates:")
            add("")
            add("- Macro views: `confidence_implied >= 70`")
            add("- Trade ideas: `conviction='high' AND crowding_tag != 'crowded'`")
            add("- Narrative warnings: `crowding_risk in ('elevated','high','extreme')`")
            add("")
            add("Strength = `confidence * speaker_credibility/100`, floored at `0.7×` "
                "until speaker track records mature (Phase 5).")
            add("")
            # Top tickers
            cur.execute("""
                SELECT unnest(tickers) tick, COUNT(*) c FROM trading_signals
                WHERE evidence->>'origin'='podcast' AND array_length(tickers,1) > 0
                GROUP BY tick ORDER BY c DESC LIMIT 10
            """)
            tick_rows = cur.fetchall()
            if tick_rows:
                add("Top tickers appearing in promoted signals:")
                add("")
                add(f"`{'` `'.join(r['tick'] + f'×{r[chr(99)]}' for r in tick_rows)}`")
                add("")
            # Sample highest-strength signals
            cur.execute("""
                SELECT direction, strength, evidence->>'speaker_name' spk,
                       evidence->>'statement' stmt, evidence->>'description' desc,
                       evidence->>'episode_title' title, tickers
                FROM trading_signals
                WHERE evidence->>'origin' = 'podcast'
                ORDER BY strength DESC LIMIT 6
            """)
            add("Top promoted signals by strength:")
            add("")
            for r in cur.fetchall():
                txt = (r["stmt"] or r["desc"] or "")[:140]
                tick = ",".join(r["tickers"]) if r["tickers"] else ""
                tick_str = f" · tickers `{tick}`" if tick else ""
                add(f"- `{r['direction']}` strength={float(r['strength']):.0f} — "
                    f"**{r['spk'] or '?'}** · _{r['title'][:40]}_{tick_str}")
                add(f"    > {txt}")
            add("")

        # ── Cross-episode narrative crowding (Phase 3) ────────────────────
        cur.execute("""
            SELECT narrative_label, mention_count, unique_speakers, conviction_avg,
                   crowding_risk, metadata
            FROM podcast_narrative_velocity
            WHERE (metadata->'episode_ids') IS NOT NULL
              AND jsonb_array_length(metadata->'episode_ids') >= 2
            ORDER BY mention_count DESC, conviction_avg DESC
        """)
        cross_ep_rows = cur.fetchall()
        if cross_ep_rows:
            add("## Cross-Episode Narrative Crowding (Phase 3)")
            add("")
            add("Narrative labels clustered by cosine similarity (text-embedding-3-small, "
                "threshold 0.65). Labels that appear across ≥2 of the 3 episodes indicate "
                "convergent themes — candidates for crowding detection once the corpus grows.")
            add("")
            add("| Canonical narrative | Episodes | Mentions | Conviction | Crowding |")
            add("|---|---:|---:|---:|---|")
            for row in cross_ep_rows:
                meta = row["metadata"] or {}
                members = meta.get("cluster_members") or []
                ep_count = len(meta.get("episode_ids") or [])
                label = row["narrative_label"][:70].replace("|", "\\|")
                add(f"| {label} | {ep_count} | {row['mention_count']} | "
                    f"{float(row['conviction_avg']):.0f} | {row['crowding_risk']} |")
                if len(members) > 1:
                    for m in members[:4]:
                        add(f"|   ↳ _{m[:70]}_ |  |  |  |  |")
            add("")

        # ── Phase 0 vs Phase 1 comparison on Odd Lots ────────────────────
        cur.execute("SELECT episode_id FROM podcast_episodes WHERE title ILIKE '%exceptionalism%' LIMIT 1")
        odd_row = cur.fetchone()
        if odd_row:
            eid = odd_row["episode_id"]
            add("## K1/K3 Fix Validation — Odd Lots Episode (before vs after)")
            add("")
            add("Same transcript, same model choice, different extraction pipeline.")
            add("The legacy run (Phase 0, gpt-4o / claude-sonnet-4) dropped signals when "
                "speaker names varied between chunks. Phase 1 resolver fixes this.")
            add("")
            add("| Signal | Phase 0 | Phase 1 | Delta |")
            add("|---|---:|---:|---:|")
            for table, label in [
                ("podcast_macro_views", "macro_views"),
                ("podcast_trade_ideas", "trade_ideas"),
                ("podcast_narratives", "narratives"),
                ("podcast_analogs", "analogs"),
            ]:
                cur.execute(f"SELECT COUNT(*) c FROM {table} WHERE episode_id=%s AND extraction_model IN ('gpt-4o','claude-sonnet-4')", (eid,))
                p0 = cur.fetchone()["c"]
                cur.execute(f"SELECT COUNT(*) c FROM {table} WHERE episode_id=%s AND extraction_model = 'claude-sonnet-4-5'", (eid,))
                p1_claude = cur.fetchone()["c"]
                cur.execute(f"SELECT COUNT(*) c FROM {table} WHERE episode_id=%s AND extraction_model NOT IN ('gpt-4o','claude-sonnet-4','claude-sonnet-4-5')", (eid,))
                other = cur.fetchone()["c"]
                p1 = p1_claude + other
                # For macro_views and trade_ideas the Phase 1 gpt-4o write lands same model string.
                # Count phase 1 writes distinctly: they're created after phase 0. Use created_at.
                cur.execute(f"SELECT COUNT(*) c FROM {table} WHERE episode_id=%s AND extraction_model IN ('gpt-4o','claude-sonnet-4-5')", (eid,))
                p1_recent = cur.fetchone()["c"]
                cur.execute(f"SELECT COUNT(*) c FROM {table} WHERE episode_id=%s", (eid,))
                total = cur.fetchone()["c"]
                p0_actual = total - p1_recent
                delta_pct = ((p1_recent - p0_actual) / max(p0_actual, 1)) * 100 if p0_actual > 0 else float("inf")
                delta_str = f"+{delta_pct:.0f}%" if p0_actual > 0 else "new"
                add(f"| {label} | {p0_actual} | {p1_recent} | {delta_str} |")
            add("")

        # ── Speaker attribution coverage ──────────────────────────────────
        add("## Speaker Attribution Coverage")
        add("")
        cur.execute("""
            SELECT s.name, s.normalized_name,
                   COUNT(DISTINCT es.episode_id) AS episodes,
                   COALESCE(mv_c.c, 0) AS mv,
                   COALESCE(ti_c.c, 0) AS ti,
                   COALESCE(an_c.c, 0) AS an
            FROM podcast_speakers s
            LEFT JOIN podcast_episode_speakers es ON es.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM podcast_macro_views GROUP BY speaker_id) mv_c
                ON mv_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM podcast_trade_ideas GROUP BY speaker_id) ti_c
                ON ti_c.speaker_id = s.speaker_id
            LEFT JOIN (SELECT speaker_id, COUNT(*) c FROM podcast_analogs GROUP BY speaker_id) an_c
                ON an_c.speaker_id = s.speaker_id
            WHERE s.normalized_name NOT LIKE '\\_\\_unattributed%%'
              AND (COALESCE(mv_c.c, 0) + COALESCE(ti_c.c, 0) + COALESCE(an_c.c, 0)) > 0
            GROUP BY s.name, s.normalized_name, mv_c.c, ti_c.c, an_c.c
            ORDER BY mv DESC, ti DESC
            LIMIT 25
        """)
        add("| Speaker | Episodes | Macro Views | Trade Ideas | Analogs |")
        add("|---|---:|---:|---:|---:|")
        for row in cur.fetchall():
            add(f"| {row['name']} | {row['episodes']} | {row['mv']} | {row['ti']} | {row['an']} |")
        add("")

        cur.execute("""
            SELECT COUNT(DISTINCT s.speaker_id) AS unatt,
                   (SELECT COUNT(*) FROM podcast_macro_views mv
                    JOIN podcast_speakers ps ON ps.speaker_id=mv.speaker_id
                    WHERE ps.normalized_name LIKE '\\_\\_unattributed%%') AS unatt_mv
            FROM podcast_speakers s
            WHERE s.normalized_name LIKE '\\_\\_unattributed%%'
        """)
        u = cur.fetchone()
        add(f"**Unattributed fallback:** {u['unatt']} episode-scoped unattributed rows, "
            f"{u['unatt_mv']} macro views routed to them (vs being dropped).")
        add("")

        # ── Sample signals per episode ────────────────────────────────────
        add("## Sample Extracted Signals")
        add("")
        for ep in episodes:
            eid = ep["episode_id"]
            cur.execute("""
                SELECT mv.statement, mv.direction, mv.confidence_implied, mv.time_horizon,
                       mv.tickers, mv.asset_classes, s.name AS speaker
                FROM podcast_macro_views mv
                LEFT JOIN podcast_speakers s ON s.speaker_id = mv.speaker_id
                WHERE mv.episode_id=%s AND mv.extraction_model IN ('gpt-4o','claude-sonnet-4-5')
                ORDER BY mv.confidence_implied DESC LIMIT 4
            """, (eid,))
            mvs = cur.fetchall()
            if not mvs:
                continue
            add(f"### {ep['title']}")
            add("")
            add("**Top macro views:**")
            for mv in mvs:
                horizon = mv["time_horizon"] or "—"
                tick = ",".join(mv["tickers"]) if mv["tickers"] else ""
                asc = ",".join(mv["asset_classes"]) if mv["asset_classes"] else ""
                extras = " ".join(filter(None, [f"tickers={tick}" if tick else "", f"asset={asc}" if asc else ""]))
                add(f"- `{mv['direction']}` conf={mv['confidence_implied']} horizon={horizon} — **{mv['speaker'] or '?'}**")
                add(f"  > {mv['statement'][:240]}")
                if extras:
                    add(f"  · {extras}")
            add("")

            cur.execute("""
                SELECT an.referenced_period, an.referenced_year, an.rhyme_type,
                       an.reasoning, s.name AS speaker
                FROM podcast_analogs an
                LEFT JOIN podcast_speakers s ON s.speaker_id = an.speaker_id
                WHERE an.episode_id=%s AND an.extraction_model IN ('gpt-4o','claude-sonnet-4-5')
                ORDER BY an.created_at DESC LIMIT 4
            """, (eid,))
            ans = cur.fetchall()
            if ans:
                add("**History-rhymes / analogs:**")
                for a in ans:
                    add(f"- `{a['rhyme_type'] or '?'}` → **{a['referenced_period']}** ({a['speaker'] or '?'})")
                    add(f"  > {a['reasoning'][:240]}")
                add("")

            cur.execute("""
                SELECT narrative_label, conviction, novelty_score, narrative_type
                FROM podcast_narratives
                WHERE episode_id=%s AND extraction_model IN ('gpt-4o','claude-sonnet-4-5')
                ORDER BY conviction DESC LIMIT 5
            """, (eid,))
            ns = cur.fetchall()
            if ns:
                add("**Top narratives:**")
                for n in ns:
                    add(f"- `{n['narrative_type'] or '?'}` conv={n['conviction']} novelty={n['novelty_score']} — **{n['narrative_label']}**")
                add("")

            cur.execute("""
                SELECT authenticity_score, originality_score, manipulation_risk, analysis_notes
                FROM podcast_adversarial_scores WHERE episode_id=%s
            """, (eid,))
            adv = cur.fetchone()
            if adv:
                add(f"**Adversarial score:** authenticity={adv['authenticity_score']} "
                    f"originality={adv['originality_score']} "
                    f"manipulation_risk={adv['manipulation_risk']}")
                if adv["analysis_notes"]:
                    add(f"> {adv['analysis_notes'][:400]}")
                add("")

            # Pass 3 synthesis (stored in metadata.synthesis)
            cur.execute(
                "SELECT metadata FROM podcast_episodes WHERE episode_id=%s", (eid,)
            )
            meta_row = cur.fetchone()
            synth = (meta_row or {}).get("metadata", {}).get("synthesis") if meta_row else None
            if synth:
                add("**Episode synthesis (Pass 3):**")
                add("")
                if summary := synth.get("executive_summary"):
                    add(f"> {summary}")
                    add("")
                if dom := synth.get("dominant_narrative"):
                    add(f"- **Dominant narrative:** {dom}")
                for key, label in [
                    ("agreements", "Agreements"),
                    ("disagreements", "Disagreements"),
                    ("novel_insights", "Novel insights"),
                    ("crowded_takes", "Crowded takes"),
                    ("adversarial_red_flags", "Red flags"),
                ]:
                    items = synth.get(key) or []
                    if items:
                        add(f"- **{label}:**")
                        for item in items[:4]:
                            add(f"    - {item}")
                act = synth.get("single_most_actionable")
                if act and isinstance(act, dict) and act.get("thesis"):
                    add(f"- **Most actionable:** `{act.get('direction')}` "
                        f"{act.get('asset_or_ticker')} — "
                        f"conv={act.get('conviction')} horizon={act.get('time_horizon')}")
                    add(f"    > {act.get('thesis')}")
                    if risk := act.get("risk_to_thesis"):
                        add(f"    - risk: {risk}")
                add("")

    OUT_FILE.write_text("\n".join(lines))
    print(f"Wrote {OUT_FILE} ({len(lines)} lines)")


if __name__ == "__main__":
    main()
