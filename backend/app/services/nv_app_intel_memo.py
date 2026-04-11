from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from app.db import get_cursor
from app.services import nv_app_intel


def _current_week_window(today: date | None = None) -> tuple[date, date]:
    anchor = today or date.today()
    period_start = anchor - timedelta(days=anchor.weekday())
    period_end = period_start + timedelta(days=6)
    return period_start, period_end


def _recommended_kind(pattern: dict) -> str:
    if pattern.get("consulting_offer_opportunity"):
        return "consulting_offer"
    if pattern.get("demo_idea"):
        return "demo_brief"
    if pattern.get("winston_module_opportunity"):
        return "winston_backlog"
    return "outreach_angle"


def _pattern_priority_rank(pattern: dict) -> int:
    priority = (pattern.get("priority") or "med").lower()
    if priority == "high":
        return 0
    if priority == "med":
        return 1
    return 2


def _render_summary_markdown(period_start: date, period_end: date, memo_payload: dict) -> str:
    lines = [
        f"# App Intelligence Weekly Memo ({period_start.isoformat()} to {period_end.isoformat()})",
        "",
        "## Top 3 patterns to act on",
    ]
    for item in memo_payload["top_3_patterns_to_act_on"]:
        lines.append(f"- {item['pattern_name']} ({item['recommended_kind']}): {item['why_now']}")
    lines.extend([
        "",
        "## Outreach angles to send",
    ])
    for item in memo_payload["outreach_angles_to_send"]:
        lines.append(f"- {item['target_persona']}: {item['hook']} — {item['pain_statement']}")
    demo = memo_payload["demo_to_build_this_week"]
    lines.extend([
        "",
        "## Demo to build this week",
        f"- {demo['title']}: {demo['narrative']}",
    ])
    for step in demo["build_steps"]:
        lines.append(f"  - {step}")
    lines.extend([
        "",
        f"Unconverted patterns: {memo_payload['unconverted_patterns_count']}",
        f"Prime unsent opportunities: {memo_payload['prime_opportunities_unsent_count']}",
    ])
    return "\n".join(lines)


def generate_weekly_memo(
    *,
    env_id: str,
    business_id: UUID,
    generated_by: str | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict:
    if period_start is None or period_end is None:
        period_start, period_end = _current_week_window(period_start)

    patterns = [
        pattern
        for pattern in nv_app_intel.list_patterns(env_id=env_id, business_id=business_id)
        if pattern.get("status") != "archived"
    ]
    if len(patterns) < 3:
        raise nv_app_intel.AppIntelMemoMaterialError(
            "patterns",
            f"need 3 viable patterns, only {len(patterns)} found — process more apps",
        )

    patterns.sort(
        key=lambda pattern: (
            _pattern_priority_rank(pattern),
            -float(pattern.get("confidence") or 0),
            -int(pattern.get("evidence_count") or 0),
            str(pattern.get("pattern_name") or "").lower(),
        )
    )

    opportunities = nv_app_intel.list_opportunities(env_id=env_id, business_id=business_id)["rows"]
    outreach_candidates = [
        item
        for item in opportunities
        if item.get("kind") == "outreach_angle" and item.get("status") in {"draft", "ready"}
    ]
    if len(outreach_candidates) < 3:
        raise nv_app_intel.AppIntelMemoMaterialError(
            "outreach_angles",
            f"need 3 viable outreach angles, only {len(outreach_candidates)} found — convert more patterns",
        )

    demo_candidates = [
        item
        for item in opportunities
        if item.get("kind") == "demo_brief" and item.get("status") in {"draft", "ready", "exported", "sent"}
    ]
    if not demo_candidates:
        raise nv_app_intel.AppIntelMemoMaterialError(
            "demo_candidate",
            "need 1 demo brief to build this week — create a demo brief from a prime opportunity",
        )

    scoreboard = nv_app_intel.get_scoreboard(env_id=env_id, business_id=business_id)

    top_patterns = []
    for pattern in patterns[:3]:
        why_now = (
            pattern.get("recurring_pain")
            or pattern.get("bad_implementation_pattern")
            or pattern.get("workflow_shape")
            or "Evidence is stacking across multiple captured apps."
        )
        top_patterns.append(
            {
                "pattern_id": str(pattern["id"]),
                "pattern_name": pattern["pattern_name"],
                "why_now": why_now,
                "recommended_kind": _recommended_kind(pattern),
            }
        )

    outreach_payload = []
    for opportunity in outreach_candidates[:3]:
        payload = dict(opportunity.get("payload") or {})
        outreach_payload.append(
            {
                "opportunity_id": str(opportunity["id"]),
                "target_persona": payload.get("target_persona") or "[set persona]",
                "pain_statement": payload.get("pain_statement") or "[set pain statement]",
                "hook": payload.get("hook") or "[set hook]",
            }
        )

    demo = demo_candidates[0]
    demo_payload = dict(demo.get("payload") or {})
    memo_payload = {
        "top_3_patterns_to_act_on": top_patterns,
        "outreach_angles_to_send": outreach_payload,
        "demo_to_build_this_week": {
            "opportunity_id": str(demo["id"]),
            "title": demo["title"],
            "narrative": demo_payload.get("narrative") or "[set narrative]",
            "build_steps": list(demo_payload.get("ui_flow") or ["Build the mocked UI flow", "Record the walkthrough", "Schedule the demo"]),
        },
        "unconverted_patterns_count": int(scoreboard.get("unconverted_patterns") or 0),
        "prime_opportunities_unsent_count": int(scoreboard.get("prime_unsent") or 0),
    }
    summary_markdown = _render_summary_markdown(period_start, period_end, memo_payload)

    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO cro_app_weekly_memo (
                env_id, business_id, period_start, period_end,
                summary_markdown, memo_payload, generated_by
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (business_id, period_start)
            DO UPDATE SET
                period_end = EXCLUDED.period_end,
                summary_markdown = EXCLUDED.summary_markdown,
                memo_payload = EXCLUDED.memo_payload,
                generated_at = now(),
                generated_by = EXCLUDED.generated_by
            RETURNING *
            """,
            (
                env_id,
                str(business_id),
                period_start,
                period_end,
                summary_markdown,
                memo_payload,
                generated_by,
            ),
        )
        row = cur.fetchone()
    return nv_app_intel._memo_payload(row)
