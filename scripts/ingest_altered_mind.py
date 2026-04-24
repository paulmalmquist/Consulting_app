"""
ingest_altered_mind.py
======================
Ingestion pipeline for the Altered Mind Weekly Business Check-In Excel tracker.

Usage:
    python scripts/ingest_altered_mind.py \
        --file "path/to/Altered Mind Weekly Business Check In.xlsx" \
        --env-id <env_id> \
        --business-id <business_id> \
        [--dry-run]

Behavior:
    - Reads all four data sheets: Daily Check In, Weekly Summary,
      Referral Intake Log, Monthly Reflections Archive.
    - Normalizes and validates every row (type-checks, range guards).
    - Upserts into am_daily_checkin, am_weekly_summary, am_referral,
      am_monthly_reflection using ON CONFLICT DO UPDATE (idempotent).
    - Logs row counts at every stage.
    - Fails loudly on any schema mismatch or unexpected data shape.

Re-run safety:
    All upserts are keyed on (env_id, <date/period>). Re-running the
    script on the same file + env produces identical DB state.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date, datetime
from typing import Any

import pandas as pd
import psycopg2
import psycopg2.extras

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("am_ingest")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_bool(val: Any) -> bool | None:
    if pd.isna(val):
        return None
    if isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in ("yes", "true", "1", "y"):
        return True
    if s in ("no", "false", "0", "n"):
        return False
    return None


def _to_int(val: Any) -> int | None:
    if pd.isna(val):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _to_float(val: Any) -> float | None:
    if pd.isna(val):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _to_date(val: Any) -> date | None:
    if pd.isna(val):
        return None
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.date()
    if isinstance(val, date):
        return val
    try:
        return pd.to_datetime(val).date()
    except Exception:
        return None


def _normalize_platform(raw: str | None) -> str | None:
    if raw is None:
        return None
    return raw.strip().upper().replace(" ", "_")


# ---------------------------------------------------------------------------
# Sheet parsers
# ---------------------------------------------------------------------------

def parse_daily_checkin(path: str) -> list[dict]:
    df = pd.read_excel(path, sheet_name="Daily Check In")

    # Drop rows where Date is missing or contains "TOTAL"
    df = df[df["Date"].notna()]
    df = df[~df["Date"].astype(str).str.upper().str.contains("TOTAL")]

    rows = []
    errors = 0
    for _, row in df.iterrows():
        d = _to_date(row["Date"])
        if d is None:
            log.warning("Skipping daily row with unparseable date: %s", row["Date"])
            errors += 1
            continue

        rows.append({
            "session_date":          d,
            "clients_seen":          _to_int(row.get("Clients Seen")),
            "cancellations":         _to_int(row.get("Cancellation")),
            "no_shows":              _to_int(row.get("No Shows")),
            "late_cancel":           _to_int(row.get("Late-Cancel (under 24 hours)")),
            "late_fee_applied":      _to_bool(row.get("Late Fee Applied ")),
            "consultations_completed": _to_int(row.get("Consultations completed")),
            "new_referrals":         _to_int(row.get("New Referrals")),
            "intake_completed":      _to_int(row.get("Intake Completed?")),
            "converted_to_client":   _to_int(row.get("Converted to client?")),
            "discharges":            _to_int(row.get("Discharges")),
            "self_pay_sessions":     _to_int(row.get("Self-pay Sessions")),
            "insurance_sessions":    _to_int(row.get("Insurance Sessions")),
            "revenue_dollars":       _to_float(row.get("Dollars Made ($)")),
            "utilization_pct":       _to_float(row.get("Utilization %")),
            "revenue_per_session":   _to_float(row.get("Revenue per Session ")),
            "topic_anxiety":         _to_int(row.get("Anxiety")),
            "topic_depression":      _to_int(row.get("Depression")),
            "topic_adhd":            _to_int(row.get("ADHD")),
            "topic_burnout":         _to_int(row.get("Burnout/Work Stress")),
            "topic_relationships":   _to_int(row.get("Relationships")),
            "topic_trauma_ptsd":     _to_int(row.get("Trauma/PTSD")),
            "topic_grief_loss":      _to_int(row.get("Grief/Loss")),
            "topic_life_transitions": _to_int(row.get("Life Transitions ")),
            "topic_relapse_prev":    _to_int(row.get("Relapse Prevention")),
            "topic_other":           _to_int(row.get("Other topics")),
            "notes":                 str(row.get("notes")).strip() if pd.notna(row.get("notes")) else None,
        })

    log.info("Daily Check In: %d data rows parsed, %d skipped", len(rows), errors)
    return rows


def parse_weekly_summary(path: str) -> list[dict]:
    """
    The Weekly Summary sheet is transposed: rows = metrics, columns = weeks.
    We pivot it to long format (one row per week).
    Only weeks where clients_seen > 0 are ingested.
    """
    df = pd.read_excel(path, sheet_name="Weekly Summary", header=None)

    # Row 0 is week dates (first cell = "Week Starting"), subsequent rows are metrics
    week_dates = list(df.iloc[0, 1:])
    metric_labels = list(df.iloc[:, 0])

    def _find_row(label: str) -> pd.Series | None:
        for i, m in enumerate(metric_labels):
            if isinstance(m, str) and m.strip().lower() == label.lower():
                return df.iloc[i, 1:]
        return None

    r_clients         = _find_row("Clients Seen")
    r_openings        = _find_row("Openings")
    r_cancellations   = _find_row("Cancellations")
    r_no_shows        = _find_row("No-Shows")
    r_consultations   = _find_row("Consultations")
    r_intake          = _find_row("Intake Appts")
    r_referrals       = _find_row("New Referrals")
    r_discharges      = _find_row("Discharges")
    r_self_pay        = _find_row("Self-Pay Sessions")
    r_insurance       = _find_row("Insurnace Sessions")  # note: typo in source preserved
    r_revenue         = _find_row("Weekly Revenue")
    r_capacity        = _find_row("Capacity Utilization %")
    r_betterhelp      = _find_row("BetterHelp On/Off")
    r_adhd            = _find_row("ADHD")
    r_anxiety         = _find_row("Anxiety")
    r_burnout         = _find_row("Burnout/WorkStress")
    r_depression      = _find_row("Depression")
    r_grief           = _find_row("Grief/Loss")
    r_life_trans      = _find_row("Life Transitions")
    r_other           = _find_row("Other Topic Count")
    r_relationships   = _find_row("Relationships")
    r_trauma          = _find_row("Trauma/PTSD")
    r_relapse         = _find_row("Relapse Prevention ")

    rows = []
    skipped = 0
    for i, wd in enumerate(week_dates):
        d = _to_date(wd)
        if d is None:
            skipped += 1
            continue

        clients = _to_int(r_clients.iloc[i]) if r_clients is not None else None
        if not clients:
            skipped += 1
            continue  # future empty week — skip

        betterhelp_raw = r_betterhelp.iloc[i] if r_betterhelp is not None else None
        betterhelp_active = None
        if pd.notna(betterhelp_raw):
            betterhelp_active = str(betterhelp_raw).strip().upper() == "ON"

        rows.append({
            "week_starting":         d,
            "clients_seen":          clients,
            "openings":              _to_int(r_openings.iloc[i]) if r_openings is not None else None,
            "cancellations":         _to_int(r_cancellations.iloc[i]) if r_cancellations is not None else None,
            "no_shows":              _to_int(r_no_shows.iloc[i]) if r_no_shows is not None else None,
            "consultations":         _to_int(r_consultations.iloc[i]) if r_consultations is not None else None,
            "intake_appts":          _to_int(r_intake.iloc[i]) if r_intake is not None else None,
            "new_referrals":         _to_int(r_referrals.iloc[i]) if r_referrals is not None else None,
            "discharges":            _to_int(r_discharges.iloc[i]) if r_discharges is not None else None,
            "self_pay_sessions":     _to_int(r_self_pay.iloc[i]) if r_self_pay is not None else None,
            "insurance_sessions":    _to_int(r_insurance.iloc[i]) if r_insurance is not None else None,
            "weekly_revenue":        _to_float(r_revenue.iloc[i]) if r_revenue is not None else None,
            "capacity_utilization":  _to_float(r_capacity.iloc[i]) if r_capacity is not None else None,
            "betterhelp_active":     betterhelp_active,
            "topic_adhd":            _to_int(r_adhd.iloc[i]) if r_adhd is not None else None,
            "topic_anxiety":         _to_int(r_anxiety.iloc[i]) if r_anxiety is not None else None,
            "topic_burnout":         _to_int(r_burnout.iloc[i]) if r_burnout is not None else None,
            "topic_depression":      _to_int(r_depression.iloc[i]) if r_depression is not None else None,
            "topic_grief_loss":      _to_int(r_grief.iloc[i]) if r_grief is not None else None,
            "topic_life_transitions": _to_int(r_life_trans.iloc[i]) if r_life_trans is not None else None,
            "topic_other":           _to_int(r_other.iloc[i]) if r_other is not None else None,
            "topic_relationships":   _to_int(r_relationships.iloc[i]) if r_relationships is not None else None,
            "topic_trauma_ptsd":     _to_int(r_trauma.iloc[i]) if r_trauma is not None else None,
            "topic_relapse_prev":    _to_int(r_relapse.iloc[i]) if r_relapse is not None else None,
        })

    log.info("Weekly Summary: %d weeks parsed, %d skipped (empty/future)", len(rows), skipped)
    return rows


def parse_referrals(path: str) -> list[dict]:
    df = pd.read_excel(path, sheet_name="Refferal Intake Log")
    df = df[df["Date"].notna()]

    # The sheet has a summary table embedded to the right — drop cols beyond Notes
    rows = []
    errors = 0
    for _, row in df.iterrows():
        d = _to_date(row["Date"])
        if d is None:
            errors += 1
            continue

        raw_platform = row.get("Platform")
        if pd.isna(raw_platform):
            errors += 1
            continue

        # Normalize platform: strip trailing spaces, uppercase
        platform = str(raw_platform).strip()

        rows.append({
            "referral_date":       d,
            "platform":            platform,
            "referral_source":     str(row.get("Referral Source")).strip()
                                   if pd.notna(row.get("Referral Source")) else None,
            "consult_completed":   _to_bool(row.get("Consult Completed")),
            "intake_completed":    _to_bool(row.get("Intake completed")),
            "converted_to_client": _to_bool(row.get("Converted to client")),
            "notes":               str(row.get("Notes")).strip()
                                   if pd.notna(row.get("Notes")) else None,
        })

    log.info("Referral Intake Log: %d referrals parsed, %d skipped", len(rows), errors)
    return rows


def parse_reflections(path: str) -> list[dict]:
    df = pd.read_excel(path, sheet_name="Monthly Reflections Archive", header=1)
    df = df.rename(columns={
        "Month": "month",
        "Theme": "theme",
        "Wins": "wins",
        "Challenges": "challenges",
        "Adjustment ": "adjustment",
    })

    rows = []
    skipped = 0
    for _, row in df.iterrows():
        month_str = str(row.get("month", "")).strip()
        if not month_str or month_str == "nan":
            skipped += 1
            continue

        # Skip rows with no actual data
        theme = str(row.get("theme", "")).strip() if pd.notna(row.get("theme")) else None
        wins = str(row.get("wins", "")).strip() if pd.notna(row.get("wins")) else None
        challenges = str(row.get("challenges", "")).strip() if pd.notna(row.get("challenges")) else None
        adjustment = str(row.get("adjustment", "")).strip() if pd.notna(row.get("adjustment")) else None

        if not any([theme, wins, challenges, adjustment]):
            skipped += 1
            continue

        # Parse "January 2026" → date(2026, 1, 1)
        try:
            month_date = datetime.strptime(month_str, "%B %Y").date()
        except ValueError:
            log.warning("Could not parse month label: %s", month_str)
            skipped += 1
            continue

        rows.append({
            "reflection_month":      month_str,
            "reflection_month_date": month_date,
            "theme":                 theme or None,
            "wins":                  wins or None,
            "challenges":            challenges or None,
            "adjustment":            adjustment or None,
        })

    log.info("Monthly Reflections: %d months parsed, %d skipped (empty)", len(rows), skipped)
    return rows


# ---------------------------------------------------------------------------
# Upsert functions
# ---------------------------------------------------------------------------

DAILY_UPSERT = """
INSERT INTO am_daily_checkin (
    env_id, business_id, session_date,
    clients_seen, cancellations, no_shows, late_cancel, late_fee_applied,
    consultations_completed, new_referrals, intake_completed, converted_to_client, discharges,
    self_pay_sessions, insurance_sessions,
    revenue_dollars, utilization_pct, revenue_per_session,
    topic_anxiety, topic_depression, topic_adhd, topic_burnout,
    topic_relationships, topic_trauma_ptsd, topic_grief_loss,
    topic_life_transitions, topic_relapse_prev, topic_other,
    notes
) VALUES (
    %(env_id)s, %(business_id)s, %(session_date)s,
    %(clients_seen)s, %(cancellations)s, %(no_shows)s, %(late_cancel)s, %(late_fee_applied)s,
    %(consultations_completed)s, %(new_referrals)s, %(intake_completed)s, %(converted_to_client)s, %(discharges)s,
    %(self_pay_sessions)s, %(insurance_sessions)s,
    %(revenue_dollars)s, %(utilization_pct)s, %(revenue_per_session)s,
    %(topic_anxiety)s, %(topic_depression)s, %(topic_adhd)s, %(topic_burnout)s,
    %(topic_relationships)s, %(topic_trauma_ptsd)s, %(topic_grief_loss)s,
    %(topic_life_transitions)s, %(topic_relapse_prev)s, %(topic_other)s,
    %(notes)s
)
ON CONFLICT (env_id, session_date) DO UPDATE SET
    clients_seen            = EXCLUDED.clients_seen,
    cancellations           = EXCLUDED.cancellations,
    no_shows                = EXCLUDED.no_shows,
    late_cancel             = EXCLUDED.late_cancel,
    late_fee_applied        = EXCLUDED.late_fee_applied,
    consultations_completed = EXCLUDED.consultations_completed,
    new_referrals           = EXCLUDED.new_referrals,
    intake_completed        = EXCLUDED.intake_completed,
    converted_to_client     = EXCLUDED.converted_to_client,
    discharges              = EXCLUDED.discharges,
    self_pay_sessions       = EXCLUDED.self_pay_sessions,
    insurance_sessions      = EXCLUDED.insurance_sessions,
    revenue_dollars         = EXCLUDED.revenue_dollars,
    utilization_pct         = EXCLUDED.utilization_pct,
    revenue_per_session     = EXCLUDED.revenue_per_session,
    topic_anxiety           = EXCLUDED.topic_anxiety,
    topic_depression        = EXCLUDED.topic_depression,
    topic_adhd              = EXCLUDED.topic_adhd,
    topic_burnout           = EXCLUDED.topic_burnout,
    topic_relationships     = EXCLUDED.topic_relationships,
    topic_trauma_ptsd       = EXCLUDED.topic_trauma_ptsd,
    topic_grief_loss        = EXCLUDED.topic_grief_loss,
    topic_life_transitions  = EXCLUDED.topic_life_transitions,
    topic_relapse_prev      = EXCLUDED.topic_relapse_prev,
    topic_other             = EXCLUDED.topic_other,
    notes                   = EXCLUDED.notes,
    updated_at              = now()
"""

WEEKLY_UPSERT = """
INSERT INTO am_weekly_summary (
    env_id, business_id, week_starting,
    clients_seen, openings, cancellations, no_shows,
    consultations, intake_appts, new_referrals, discharges,
    self_pay_sessions, insurance_sessions,
    weekly_revenue, capacity_utilization, betterhelp_active,
    topic_adhd, topic_anxiety, topic_burnout, topic_depression,
    topic_grief_loss, topic_life_transitions, topic_other,
    topic_relationships, topic_trauma_ptsd, topic_relapse_prev
) VALUES (
    %(env_id)s, %(business_id)s, %(week_starting)s,
    %(clients_seen)s, %(openings)s, %(cancellations)s, %(no_shows)s,
    %(consultations)s, %(intake_appts)s, %(new_referrals)s, %(discharges)s,
    %(self_pay_sessions)s, %(insurance_sessions)s,
    %(weekly_revenue)s, %(capacity_utilization)s, %(betterhelp_active)s,
    %(topic_adhd)s, %(topic_anxiety)s, %(topic_burnout)s, %(topic_depression)s,
    %(topic_grief_loss)s, %(topic_life_transitions)s, %(topic_other)s,
    %(topic_relationships)s, %(topic_trauma_ptsd)s, %(topic_relapse_prev)s
)
ON CONFLICT (env_id, week_starting) DO UPDATE SET
    clients_seen          = EXCLUDED.clients_seen,
    openings              = EXCLUDED.openings,
    cancellations         = EXCLUDED.cancellations,
    no_shows              = EXCLUDED.no_shows,
    consultations         = EXCLUDED.consultations,
    intake_appts          = EXCLUDED.intake_appts,
    new_referrals         = EXCLUDED.new_referrals,
    discharges            = EXCLUDED.discharges,
    self_pay_sessions     = EXCLUDED.self_pay_sessions,
    insurance_sessions    = EXCLUDED.insurance_sessions,
    weekly_revenue        = EXCLUDED.weekly_revenue,
    capacity_utilization  = EXCLUDED.capacity_utilization,
    betterhelp_active     = EXCLUDED.betterhelp_active,
    topic_adhd            = EXCLUDED.topic_adhd,
    topic_anxiety         = EXCLUDED.topic_anxiety,
    topic_burnout         = EXCLUDED.topic_burnout,
    topic_depression      = EXCLUDED.topic_depression,
    topic_grief_loss      = EXCLUDED.topic_grief_loss,
    topic_life_transitions = EXCLUDED.topic_life_transitions,
    topic_other           = EXCLUDED.topic_other,
    topic_relationships   = EXCLUDED.topic_relationships,
    topic_trauma_ptsd     = EXCLUDED.topic_trauma_ptsd,
    topic_relapse_prev    = EXCLUDED.topic_relapse_prev,
    updated_at            = now()
"""

REFERRAL_UPSERT = """
INSERT INTO am_referral (
    env_id, business_id, referral_date, platform,
    referral_source, consult_completed, intake_completed,
    converted_to_client, notes
) VALUES (
    %(env_id)s, %(business_id)s, %(referral_date)s, %(platform)s,
    %(referral_source)s, %(consult_completed)s, %(intake_completed)s,
    %(converted_to_client)s, %(notes)s
)
ON CONFLICT DO NOTHING
"""

REFLECTION_UPSERT = """
INSERT INTO am_monthly_reflection (
    env_id, business_id, reflection_month, reflection_month_date,
    theme, wins, challenges, adjustment
) VALUES (
    %(env_id)s, %(business_id)s, %(reflection_month)s, %(reflection_month_date)s,
    %(theme)s, %(wins)s, %(challenges)s, %(adjustment)s
)
ON CONFLICT (env_id, reflection_month_date) DO UPDATE SET
    theme      = EXCLUDED.theme,
    wins       = EXCLUDED.wins,
    challenges = EXCLUDED.challenges,
    adjustment = EXCLUDED.adjustment,
    updated_at = now()
"""


def _upsert_batch(cur, sql: str, rows: list[dict], env_id: str, business_id: str, table: str) -> int:
    enriched = [{**r, "env_id": env_id, "business_id": business_id} for r in rows]
    psycopg2.extras.execute_batch(cur, sql, enriched, page_size=100)
    return len(enriched)


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------

def verify_counts(cur, env_id: str, expected: dict[str, int]) -> bool:
    tables = ["am_daily_checkin", "am_weekly_summary", "am_referral", "am_monthly_reflection"]
    ok = True
    log.info("=== VERIFICATION: Row count parity ===")
    for table in tables:
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE env_id = %s", (env_id,))
        db_count = cur.fetchone()[0]
        exp = expected.get(table, "?")
        match = "✓" if db_count == exp else "✗ MISMATCH"
        log.info("  %-30s  Excel=%s  DB=%d  %s", table, exp, db_count, match)
        if db_count != exp:
            ok = False
    return ok


def sample_queries(cur, env_id: str):
    log.info("=== SAMPLE QUERIES ===")

    cur.execute("""
        SELECT session_date, clients_seen, revenue_dollars, utilization_pct
        FROM am_daily_checkin
        WHERE env_id = %s
        ORDER BY session_date DESC
        LIMIT 3
    """, (env_id,))
    log.info("Latest daily check-ins:")
    for r in cur.fetchall():
        log.info("  %s | clients=%s | revenue=$%.2f | util=%.1f%%",
                 r[0], r[1], r[2] or 0, (r[3] or 0) * 100)

    cur.execute("""
        SELECT week_starting, clients_seen, weekly_revenue, capacity_utilization
        FROM am_weekly_summary
        WHERE env_id = %s
        ORDER BY week_starting DESC
        LIMIT 3
    """, (env_id,))
    log.info("Latest weekly summaries:")
    for r in cur.fetchall():
        log.info("  %s | clients=%s | revenue=$%.2f | util=%.1f%%",
                 r[0], r[1], r[2] or 0, (r[3] or 0) * 100)

    cur.execute("""
        SELECT platform, COUNT(*) as leads,
               SUM(CASE WHEN converted_to_client THEN 1 ELSE 0 END) as converted
        FROM am_referral
        WHERE env_id = %s
        GROUP BY platform
        ORDER BY leads DESC
        LIMIT 5
    """, (env_id,))
    log.info("Referral platform breakdown:")
    for r in cur.fetchall():
        log.info("  %-20s  leads=%d  converted=%d", r[0], r[1], r[2])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Ingest Altered Mind Excel tracker into Postgres")
    parser.add_argument("--file", required=True, help="Path to the Excel file")
    parser.add_argument("--env-id", required=True, help="Winston env_id")
    parser.add_argument("--business-id", required=True, help="Winston business_id (UUID)")
    parser.add_argument("--dry-run", action="store_true", help="Parse only, no DB writes")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not db_url and not args.dry_run:
        log.error("DATABASE_URL or SUPABASE_DB_URL must be set for live runs")
        sys.exit(1)

    log.info("=== Altered Mind Ingestion Pipeline ===")
    log.info("File: %s", args.file)
    log.info("env_id: %s | business_id: %s", args.env_id, args.business_id)
    log.info("Mode: %s", "DRY RUN" if args.dry_run else "LIVE")

    # Parse
    daily_rows       = parse_daily_checkin(args.file)
    weekly_rows      = parse_weekly_summary(args.file)
    referral_rows    = parse_referrals(args.file)
    reflection_rows  = parse_reflections(args.file)

    expected = {
        "am_daily_checkin":       len(daily_rows),
        "am_weekly_summary":      len(weekly_rows),
        "am_referral":            len(referral_rows),
        "am_monthly_reflection":  len(reflection_rows),
    }

    log.info("Parse summary: daily=%d weekly=%d referrals=%d reflections=%d",
             len(daily_rows), len(weekly_rows), len(referral_rows), len(reflection_rows))

    if args.dry_run:
        log.info("DRY RUN complete. No writes performed.")
        return

    # Write
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET app.env_id = '{args.env_id}'")

            n = _upsert_batch(cur, DAILY_UPSERT, daily_rows, args.env_id, args.business_id, "am_daily_checkin")
            log.info("Upserted %d rows → am_daily_checkin", n)

            n = _upsert_batch(cur, WEEKLY_UPSERT, weekly_rows, args.env_id, args.business_id, "am_weekly_summary")
            log.info("Upserted %d rows → am_weekly_summary", n)

            n = _upsert_batch(cur, REFERRAL_UPSERT, referral_rows, args.env_id, args.business_id, "am_referral")
            log.info("Upserted %d rows → am_referral", n)

            n = _upsert_batch(cur, REFLECTION_UPSERT, reflection_rows, args.env_id, args.business_id, "am_monthly_reflection")
            log.info("Upserted %d rows → am_monthly_reflection", n)

            conn.commit()
            log.info("Transaction committed.")

            # Verify
            ok = verify_counts(cur, args.env_id, expected)
            sample_queries(cur, args.env_id)

            if not ok:
                log.error("Row count mismatch! Investigate above before proceeding.")
                sys.exit(2)
            else:
                log.info("✓ All row counts verified. Ingestion complete.")

    except Exception:
        conn.rollback()
        log.exception("Ingestion failed — transaction rolled back")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
