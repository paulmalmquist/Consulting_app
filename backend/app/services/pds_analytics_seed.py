"""PDS Analytics synthetic data seeder.

Populates the 370-series analytics tables with statistically plausible
demo data matching the JLL PDS Americas report specifications.

Usage:
    from app.services.pds_analytics_seed import seed_pds_analytics
    result = seed_pds_analytics(env_id=..., business_id=...)
"""

from __future__ import annotations

import math
import random
import uuid
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import numpy as np

from app.db import get_cursor

# ─── Constants ───────────────────────────────────────────────────────

REGIONS = [
    "Northeast & Canada",
    "Mid-Atlantic",
    "Southeast",
    "Midwest",
    "South Central",
    "Southwest",
    "Mountain States & Pacific NW",
    "Northwest",
    "Latin America",
]
REGION_WEIGHTS = [0.18, 0.12, 0.14, 0.16, 0.10, 0.08, 0.08, 0.07, 0.07]

INDUSTRIES = [
    "Corporate",
    "Healthcare",
    "Life Sciences",
    "Financial Services",
    "Industrial",
    "Retail",
    "Hospitality",
    "Data Centers",
    "Education",
    "Sports & Entertainment",
]

PROJECT_TYPES = [
    "Project Management",
    "Development Management",
    "Construction Management",
    "Cost Management",
    "Design",
    "Multi-site Program",
    "Location Strategy",
    "Large Development Advisory",
    "Tétris",
]
PROJECT_TYPE_WEIGHTS = [0.30, 0.12, 0.15, 0.10, 0.05, 0.10, 0.06, 0.07, 0.05]

JLL_TOOLS = [
    "INGENIOUS.BUILD",
    "JLL Falcon",
    "JLL Azara",
    "Corrigo",
    "BIM 360",
    "Procore",
]

FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
    "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan",
    "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen", "Charles",
    "Lisa", "Daniel", "Nancy", "Matthew", "Betty", "Anthony", "Margaret",
    "Mark", "Sandra", "Steven", "Ashley", "Paul", "Kimberly", "Andrew",
    "Emily", "Joshua", "Donna", "Kenneth", "Michelle", "Kevin", "Carol",
    "Brian", "Amanda", "George", "Dorothy", "Timothy", "Melissa", "Ronald",
    "Deborah", "Jason", "Stephanie", "Jeffrey", "Rebecca", "Ryan", "Sharon",
    "Jacob", "Laura", "Gary", "Cynthia", "Nicholas", "Kathleen", "Eric",
    "Amy", "Jonathan", "Angela", "Stephen", "Shirley", "Larry", "Anna",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
    "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
    "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
    "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Chen", "Kim", "Patel", "Shah", "Kumar",
]

POSITIVE_COMMENTS = [
    "Great communication throughout the project lifecycle.",
    "Team was highly responsive to our changing needs.",
    "Budget management has been excellent this quarter.",
    "Safety record is exemplary across all active sites.",
    "Innovation in value engineering saved significant costs.",
]

IMPROVEMENT_COMMENTS = [
    "Would like more frequent status updates on milestones.",
    "Vendor coordination could be tightened on large projects.",
    "Schedule recovery plans need earlier escalation.",
    "More proactive risk identification would be helpful.",
    "Technology platform onboarding took longer than expected.",
]

NEUTRAL_COMMENTS = [
    "Generally satisfied with project delivery.",
    "Performance meets expectations across most dimensions.",
    "Adequate response times for typical requests.",
]

# Revenue seasonality multipliers by quarter
SEASONALITY = {1: 0.87, 2: 1.07, 3: 1.05, 4: 0.95}

# US holidays (month, day) to skip in timecard generation
US_HOLIDAYS = [
    (1, 1), (1, 20), (2, 17), (5, 26), (7, 4), (9, 1),
    (10, 13), (11, 11), (11, 27), (12, 25),
]

# Billing rate ranges by role level (min, max)
BILLING_RATES: dict[str, tuple[int, int]] = {
    "junior": (85, 120),
    "mid": (120, 175),
    "senior_manager": (175, 250),
    "director": (250, 350),
    "executive": (350, 500),
}

ROLE_DISTRIBUTION = {
    "junior": 0.40,
    "mid": 0.25,
    "senior_manager": 0.20,
    "director": 0.10,
    "executive": 0.05,
}


# ─── Helpers ─────────────────────────────────────────────────────────

def _uid() -> str:
    return str(uuid.uuid4())


def _name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _email(name: str) -> str:
    parts = name.lower().split()
    return f"{parts[0]}.{parts[1]}@jll-demo.com"


def _pick(choices: list[str], weights: list[float] | None = None) -> str:
    if weights:
        return random.choices(choices, weights=weights, k=1)[0]
    return random.choice(choices)


def _is_holiday(d: date) -> bool:
    return (d.month, d.day) in US_HOLIDAYS


def _is_workday(d: date) -> bool:
    return d.weekday() < 5 and not _is_holiday(d)


def _month_range(start: date, end: date):
    """Yield first-of-month dates from start to end inclusive."""
    cur = date(start.year, start.month, 1)
    while cur <= end:
        yield cur
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)


# ─── Seeder ──────────────────────────────────────────────────────────

def seed_pds_analytics(
    *,
    env_id: UUID,
    business_id: UUID,
    actor: str = "system",
    num_accounts: int = 65,
    num_employees: int = 250,
) -> dict[str, Any]:
    """Seed all PDS analytics tables with synthetic data.

    Returns dict with counts of created entities.
    """
    rng = np.random.default_rng(42)
    random.seed(42)

    env_str = str(env_id)
    biz_str = str(business_id)

    today = date.today()
    seed_start = date(today.year - 1, today.month, 1)  # 18 months back
    if today.month <= 6:
        seed_start = date(today.year - 2, today.month + 6, 1)

    counts: dict[str, int] = {}

    with get_cursor() as cur:
        # ── 1. Accounts ─────────────────────────────────────
        accounts = _seed_accounts(cur, env_str, biz_str, rng, num_accounts)
        counts["accounts"] = len(accounts)

        # ── 2. Employees ────────────────────────────────────
        employees = _seed_employees(cur, env_str, biz_str, rng, num_employees)
        counts["employees"] = len(employees)

        # ── 3. Projects ─────────────────────────────────────
        projects = _seed_projects(cur, env_str, biz_str, rng, accounts, seed_start, today)
        counts["projects"] = len(projects)

        # ── 4. Assignments ──────────────────────────────────
        assignments = _seed_assignments(cur, env_str, biz_str, rng, employees, projects)
        counts["assignments"] = len(assignments)

        # ── 5. Timecards ────────────────────────────────────
        tc_count = _seed_timecards(cur, env_str, biz_str, rng, employees, assignments, seed_start, today)
        counts["timecards"] = tc_count

        # ── 6. Revenue entries ──────────────────────────────
        rev_count = _seed_revenue(cur, env_str, biz_str, rng, projects, seed_start, today)
        counts["revenue_entries"] = rev_count

        # ── 7. NPS survey responses ─────────────────────────
        nps_count = _seed_nps(cur, env_str, biz_str, rng, accounts, projects, seed_start, today)
        counts["nps_responses"] = nps_count

        # ── 8. Technology adoption ──────────────────────────
        tech_count = _seed_technology(cur, env_str, biz_str, rng, accounts, seed_start, today)
        counts["technology_adoption"] = tech_count

    return counts


# ─── 1. Accounts ─────────────────────────────────────────────────────

def _seed_accounts(cur, env_str: str, biz_str: str, rng, n: int) -> list[dict]:
    accounts = []
    tier_choices = random.choices(
        ["Enterprise", "Mid-Market", "SMB"],
        weights=[0.15, 0.35, 0.50],
        k=n,
    )
    for i in range(n):
        tier = tier_choices[i]
        gov = random.choice(["variable", "dedicated"]) if random.random() < 0.40 else "variable"
        if tier == "Enterprise":
            gov = "dedicated"  # Enterprise accounts are always dedicated

        # Log-normal contract values by tier
        acv_median = {"Enterprise": 700_000, "Mid-Market": 160_000, "SMB": 50_000}[tier]
        acv = float(rng.lognormal(math.log(acv_median), 0.4))
        acv = round(max(10_000, min(acv, 5_000_000)), 2)

        region = _pick(REGIONS, REGION_WEIGHTS)
        industry = _pick(INDUSTRIES)
        name = f"{random.choice(LAST_NAMES)} {industry[:4]} {tier[:3]}-{i+1:03d}"

        account_id = _uid()
        cur.execute(
            """INSERT INTO pds_accounts
               (account_id, env_id, business_id, account_code, account_name,
                tier, industry, governance_track, annual_contract_value,
                contract_start_date, contract_end_date, region, status, metadata_json)
               VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                       %s, %s, %s, %s,
                       %s, %s, %s, 'active', '{}')
               ON CONFLICT (env_id, business_id, account_code) DO UPDATE
               SET tier = EXCLUDED.tier,
                   industry = EXCLUDED.industry,
                   governance_track = EXCLUDED.governance_track,
                   annual_contract_value = EXCLUDED.annual_contract_value,
                   contract_start_date = EXCLUDED.contract_start_date,
                   contract_end_date = EXCLUDED.contract_end_date,
                   region = EXCLUDED.region
            """,
            (
                account_id, env_str, biz_str,
                f"PDS-A-{i+1:04d}", name,
                tier, industry, gov, acv,
                date.today() - timedelta(days=random.randint(180, 730)),
                date.today() + timedelta(days=random.randint(180, 730)),
                region,
            ),
        )
        accounts.append({
            "account_id": account_id,
            "tier": tier,
            "governance_track": gov,
            "acv": acv,
            "region": region,
            "industry": industry,
        })

    # Set ~10% as subsidiaries
    for acc in accounts[: max(1, len(accounts) // 10)]:
        parent = random.choice(accounts[len(accounts) // 10:])
        cur.execute(
            "UPDATE pds_accounts SET parent_account_id = %s WHERE account_id = %s",
            (parent["account_id"], acc["account_id"]),
        )

    return accounts


# ─── 2. Employees ────────────────────────────────────────────────────

def _seed_employees(cur, env_str: str, biz_str: str, rng, n: int) -> list[dict]:
    employees = []
    roles = []
    for role, pct in ROLE_DISTRIBUTION.items():
        roles.extend([role] * int(n * pct))
    while len(roles) < n:
        roles.append("junior")
    random.shuffle(roles)

    for i in range(n):
        name = _name()
        emp_id = _uid()
        role = roles[i]
        region = _pick(REGIONS, REGION_WEIGHTS)

        cur.execute(
            """INSERT INTO pds_analytics_employees
               (employee_id, env_id, business_id, full_name, email,
                role_level, department, region, standard_hours_per_week,
                is_active, hire_date, metadata_json)
               VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                       %s, %s, %s, 40,
                       true, %s, '{}')
            """,
            (
                emp_id, env_str, biz_str, name, _email(name),
                role, "PDS Americas", region,
                date.today() - timedelta(days=random.randint(90, 2500)),
            ),
        )
        employees.append({
            "employee_id": emp_id,
            "role_level": role,
            "region": region,
            "name": name,
        })

    return employees


# ─── 3. Projects ─────────────────────────────────────────────────────

def _seed_projects(cur, env_str: str, biz_str: str, rng, accounts: list[dict], seed_start: date, today: date) -> list[dict]:
    projects = []

    for acc in accounts:
        # Enterprise: 4-8 projects, Mid-Market: 2-5, SMB: 1-3
        n_proj = {
            "Enterprise": random.randint(4, 8),
            "Mid-Market": random.randint(2, 5),
            "SMB": random.randint(1, 3),
        }[acc["tier"]]

        for j in range(n_proj):
            proj_id = _uid()
            proj_type = _pick(PROJECT_TYPES, PROJECT_TYPE_WEIGHTS)
            status = random.choices(
                ["active", "completed", "on_hold", "cancelled"],
                weights=[0.60, 0.25, 0.10, 0.05],
                k=1,
            )[0]

            fee_type = random.choices(
                ["percentage_of_construction", "fixed_fee", "time_and_materials", "retainer"],
                weights=[0.50, 0.25, 0.15, 0.10],
                k=1,
            )[0]

            budget = float(rng.lognormal(math.log(acc["acv"] / max(1, n_proj)), 0.5))
            budget = round(max(25_000, min(budget, 10_000_000)), 2)

            fee_pct = round(random.uniform(0.03, 0.15), 4) if fee_type == "percentage_of_construction" else None
            fee_amt = round(budget * (fee_pct or random.uniform(0.05, 0.12)), 2)

            start = seed_start + timedelta(days=random.randint(0, 180))
            duration = random.randint(90, 540)
            planned_end = start + timedelta(days=duration)
            actual_end = planned_end + timedelta(days=random.randint(-30, 60)) if status == "completed" else None

            pct_complete = 100.0 if status == "completed" else round(random.uniform(5, 95), 2) if status == "active" else round(random.uniform(10, 60), 2)

            cur.execute(
                """INSERT INTO pds_analytics_projects
                   (project_id, env_id, business_id, account_id,
                    project_name, project_type, service_line_key, market,
                    status, governance_track, total_budget,
                    fee_type, fee_percentage, fee_amount,
                    start_date, planned_end_date, actual_end_date,
                    percent_complete, metadata_json)
                   VALUES (%s, %s::uuid, %s::uuid, %s,
                           %s, %s, %s, %s,
                           %s, %s, %s,
                           %s, %s, %s,
                           %s, %s, %s,
                           %s, '{}')
                """,
                (
                    proj_id, env_str, biz_str, acc["account_id"],
                    f"{proj_type} — {acc['industry'][:8]} #{j+1}",
                    proj_type,
                    proj_type.lower().replace(" ", "_")[:20],
                    acc["region"],
                    status, acc["governance_track"], budget,
                    fee_type, fee_pct, fee_amt,
                    start, planned_end, actual_end,
                    pct_complete,
                ),
            )
            projects.append({
                "project_id": proj_id,
                "account_id": acc["account_id"],
                "governance_track": acc["governance_track"],
                "fee_amount": fee_amt,
                "start_date": start,
                "planned_end_date": planned_end,
                "status": status,
                "percent_complete": pct_complete,
                "budget": budget,
                "region": acc["region"],
            })

    return projects


# ─── 4. Assignments ──────────────────────────────────────────────────

def _seed_assignments(cur, env_str: str, biz_str: str, rng, employees: list[dict], projects: list[dict]) -> list[dict]:
    assignments = []
    active_projects = [p for p in projects if p["status"] in ("active", "completed")]
    if not active_projects:
        return assignments

    for emp in employees:
        n_assign = random.choices([2, 3, 4], weights=[0.35, 0.45, 0.20], k=1)[0]
        assigned_projects = random.sample(active_projects, min(n_assign, len(active_projects)))

        remaining_pct = 100.0
        for idx, proj in enumerate(assigned_projects):
            if idx == len(assigned_projects) - 1:
                alloc = round(remaining_pct, 2)
            else:
                alloc = round(random.uniform(15, min(70, remaining_pct - 10 * (len(assigned_projects) - idx - 1))), 2)
                alloc = max(5, alloc)
            remaining_pct -= alloc

            rate_min, rate_max = BILLING_RATES[emp["role_level"]]
            rate = round(random.uniform(rate_min, rate_max), 2)

            assign_id = _uid()
            cur.execute(
                """INSERT INTO pds_analytics_assignments
                   (assignment_id, env_id, business_id, employee_id, project_id,
                    role_level, allocation_pct, start_date, end_date,
                    billing_rate, metadata_json)
                   VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                           %s, %s, %s, %s,
                           %s, '{}')
                """,
                (
                    assign_id, env_str, biz_str, emp["employee_id"], proj["project_id"],
                    emp["role_level"], alloc, proj["start_date"], proj["planned_end_date"],
                    rate,
                ),
            )
            assignments.append({
                "assignment_id": assign_id,
                "employee_id": emp["employee_id"],
                "project_id": proj["project_id"],
                "allocation_pct": alloc,
                "billing_rate": rate,
            })

    return assignments


# ─── 5. Timecards ────────────────────────────────────────────────────

def _seed_timecards(
    cur, env_str: str, biz_str: str, rng,
    employees: list[dict], assignments: list[dict], seed_start: date, today: date,
) -> int:
    # Build employee → assignments lookup
    emp_assigns: dict[str, list[dict]] = {}
    for a in assignments:
        emp_assigns.setdefault(a["employee_id"], []).append(a)

    count = 0
    batch: list[tuple] = []

    for emp in employees:
        my_assigns = emp_assigns.get(emp["employee_id"], [])
        if not my_assigns:
            continue

        total_alloc = sum(a["allocation_pct"] for a in my_assigns)

        d = seed_start
        while d <= today:
            if not _is_workday(d):
                d += timedelta(days=1)
                continue

            # December reduction, July/August reduction
            month_adj = 1.0
            if d.month == 12:
                month_adj = random.uniform(0.80, 0.85)
            elif d.month in (7, 8):
                month_adj = random.uniform(0.90, 0.95)

            # Base daily hours: normal(8.0, 0.75), clipped
            base_hours = float(np.clip(rng.normal(8.0, 0.75), 4.0, 12.0))
            base_hours *= month_adj

            # Overtime cluster (~12% chance)
            if random.random() < 0.12:
                base_hours = float(np.clip(rng.normal(10.0, 0.8), 9.0, 12.0))

            for a in my_assigns:
                frac = a["allocation_pct"] / max(total_alloc, 1)
                hours = round(base_hours * frac, 2)
                if hours < 0.25:
                    continue

                is_billable = random.random() > 0.25  # ~75% billable

                batch.append((
                    _uid(), env_str, biz_str,
                    emp["employee_id"], a["project_id"], a["assignment_id"],
                    d, hours, is_billable, None, a["billing_rate"],
                ))
                count += 1

                if len(batch) >= 2000:
                    _flush_timecards(cur, batch)
                    batch.clear()

            d += timedelta(days=1)

    if batch:
        _flush_timecards(cur, batch)

    return count


def _flush_timecards(cur, batch: list[tuple]):
    cur.executemany(
        """INSERT INTO pds_analytics_timecards
           (timecard_id, env_id, business_id, employee_id, project_id,
            assignment_id, work_date, hours, is_billable, task_code,
            billing_rate, metadata_json)
           VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                   %s, %s, %s, %s, %s,
                   %s, '{}')
           ON CONFLICT DO NOTHING
        """,
        batch,
    )


# ─── 6. Revenue entries ──────────────────────────────────────────────

def _seed_revenue(
    cur, env_str: str, biz_str: str, rng,
    projects: list[dict], seed_start: date, today: date,
) -> int:
    count = 0

    for proj in projects:
        fee = proj["fee_amount"]
        duration_months = max(
            1,
            (proj["planned_end_date"].year - proj["start_date"].year) * 12
            + proj["planned_end_date"].month - proj["start_date"].month,
        )
        monthly_fee = fee / duration_months

        # Budget: 3-8% optimism bias
        budget_bias = 1.0 + random.uniform(0.03, 0.08)

        for period in _month_range(seed_start, today):
            q = (period.month - 1) // 3 + 1
            seasonal = SEASONALITY[q]
            noise = float(rng.normal(0, 0.07))

            # Actual revenue (past months only)
            if period <= today.replace(day=1):
                actual_rev = round(monthly_fee * seasonal * (1 + noise), 2)
                actual_cost = round(actual_rev * random.uniform(0.58, 0.72), 2)
                actual_margin = round(1 - (actual_cost / max(actual_rev, 1)), 4)
                billed = round(actual_rev * random.uniform(0.85, 1.0), 2)
                unbilled = round(actual_rev - billed, 2)

                cur.execute(
                    """INSERT INTO pds_revenue_entries
                       (entry_id, env_id, business_id, project_id, account_id,
                        period, service_line, version,
                        recognized_revenue, billed_revenue, unbilled_revenue,
                        deferred_revenue, backlog, cost, margin_pct, metadata_json)
                       VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                               %s, %s, 'actual',
                               %s, %s, %s,
                               %s, %s, %s, %s, '{}')
                       ON CONFLICT DO NOTHING
                    """,
                    (
                        _uid(), env_str, biz_str, proj["project_id"], proj["account_id"],
                        period, None,
                        actual_rev, billed, unbilled,
                        round(random.uniform(0, unbilled * 0.3), 2),
                        round(max(0, fee - actual_rev * duration_months * 0.5), 2),
                        actual_cost, actual_margin,
                    ),
                )
                count += 1

            # Budget version (all months)
            budget_rev = round(monthly_fee * budget_bias, 2)
            cur.execute(
                """INSERT INTO pds_revenue_entries
                   (entry_id, env_id, business_id, project_id, account_id,
                    period, service_line, version,
                    recognized_revenue, billed_revenue, unbilled_revenue,
                    deferred_revenue, backlog, cost, margin_pct, metadata_json)
                   VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                           %s, %s, 'budget',
                           %s, %s, %s,
                           0, 0, %s, %s, '{}')
                   ON CONFLICT DO NOTHING
                """,
                (
                    _uid(), env_str, biz_str, proj["project_id"], proj["account_id"],
                    period, None,
                    budget_rev, budget_rev, 0,
                    round(budget_rev * 0.65, 2),
                    round(0.35, 4),
                ),
            )
            count += 1

            # Forecast 6+6 (for months in H2)
            if period.month >= 7:
                forecast_rev = round(monthly_fee * seasonal * (1 + random.uniform(-0.03, 0.05)), 2)
                cur.execute(
                    """INSERT INTO pds_revenue_entries
                       (entry_id, env_id, business_id, project_id, account_id,
                        period, service_line, version,
                        recognized_revenue, billed_revenue, unbilled_revenue,
                        deferred_revenue, backlog, cost, margin_pct, metadata_json)
                       VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                               %s, %s, 'forecast_6_6',
                               %s, %s, 0,
                               0, 0, %s, %s, '{}')
                       ON CONFLICT DO NOTHING
                    """,
                    (
                        _uid(), env_str, biz_str, proj["project_id"], proj["account_id"],
                        period, None,
                        forecast_rev, forecast_rev,
                        round(forecast_rev * 0.63, 2),
                        round(0.37, 4),
                    ),
                )
                count += 1

    return count


# ─── 7. NPS survey responses ─────────────────────────────────────────

def _seed_nps(
    cur, env_str: str, biz_str: str, rng,
    accounts: list[dict], projects: list[dict], seed_start: date, today: date,
) -> int:
    count = 0
    # Build account → projects lookup
    acct_projects: dict[str, list[dict]] = {}
    for p in projects:
        acct_projects.setdefault(p["account_id"], []).append(p)

    for period in _month_range(seed_start, today):
        # Quarterly surveys only (end of quarter months)
        if period.month not in (3, 6, 9, 12):
            continue

        for acc in accounts:
            n_responses = random.randint(1, 3)
            acc_proj_list = acct_projects.get(acc["account_id"], [])

            for _ in range(n_responses):
                # NPS mixture model: 51% Promoter, 26% Passive, 23% Detractor
                band = random.choices(
                    ["promoter", "passive", "detractor"],
                    weights=[0.51, 0.26, 0.23],
                    k=1,
                )[0]

                if band == "promoter":
                    nps = random.choices([9, 10], weights=[0.4, 0.6], k=1)[0]
                elif band == "passive":
                    nps = random.choices([7, 8], weights=[0.5, 0.5], k=1)[0]
                else:
                    nps = random.choices([0, 1, 2, 3, 4, 5, 6], weights=[0.02, 0.02, 0.03, 0.05, 0.08, 0.30, 0.50], k=1)[0]

                # Correlated overall satisfaction (r ≈ 0.75)
                if nps >= 9:
                    overall = random.choices([4, 5], weights=[0.3, 0.7], k=1)[0]
                elif nps >= 7:
                    overall = random.choices([3, 4], weights=[0.4, 0.6], k=1)[0]
                else:
                    overall = random.choices([1, 2, 3], weights=[0.2, 0.5, 0.3], k=1)[0]

                # Dimension scores correlated with overall (r ≈ 0.5-0.7)
                def _dim_score():
                    base = overall + random.choices([-1, 0, 1], weights=[0.2, 0.5, 0.3], k=1)[0]
                    return max(1, min(5, base))

                # Pick a project if available
                proj_id = random.choice(acc_proj_list)["project_id"] if acc_proj_list else None

                # Comments based on NPS band
                pos_comment = random.choice(POSITIVE_COMMENTS) if band == "promoter" else (random.choice(NEUTRAL_COMMENTS) if band == "passive" else None)
                imp_comment = random.choice(IMPROVEMENT_COMMENTS) if band == "detractor" else (random.choice(IMPROVEMENT_COMMENTS) if band == "passive" and random.random() < 0.5 else None)

                survey_date = period + timedelta(days=random.randint(0, 28))
                if survey_date > today:
                    survey_date = today

                cur.execute(
                    """INSERT INTO pds_nps_responses
                       (response_id, env_id, business_id, account_id, project_id,
                        survey_date, nps_score, overall_satisfaction,
                        schedule_adherence, budget_management, communication_quality,
                        team_responsiveness, problem_resolution, vendor_management,
                        safety_performance, innovation_value_engineering,
                        open_comment_positive, open_comment_improvement,
                        respondent_role, respondent_name, metadata_json)
                       VALUES (%s, %s::uuid, %s::uuid, %s, %s,
                               %s, %s, %s,
                               %s, %s, %s,
                               %s, %s, %s,
                               %s, %s,
                               %s, %s,
                               %s, %s, '{}')
                    """,
                    (
                        _uid(), env_str, biz_str, acc["account_id"], proj_id,
                        survey_date, nps, overall,
                        _dim_score(), _dim_score(), _dim_score(),
                        _dim_score(), _dim_score(), _dim_score(),
                        _dim_score(), _dim_score(),
                        pos_comment, imp_comment,
                        random.choice(["Facilities Director", "VP Operations", "Project Sponsor", "CFO"]),
                        _name(),
                    ),
                )
                count += 1

    return count


# ─── 8. Technology adoption ──────────────────────────────────────────

def _seed_technology(
    cur, env_str: str, biz_str: str, rng,
    accounts: list[dict], seed_start: date, today: date,
) -> int:
    count = 0

    # Only dedicated accounts get tech adoption tracking
    dedicated = [a for a in accounts if a["governance_track"] == "dedicated"]
    tech_accounts = random.sample(dedicated, min(15, len(dedicated))) if len(dedicated) > 15 else dedicated

    for acc in tech_accounts:
        # 4-6 tools per account
        n_tools = random.randint(4, min(6, len(JLL_TOOLS)))
        tools = random.sample(JLL_TOOLS, n_tools)

        for tool in tools:
            licensed = random.randint(20, 200)
            base_adoption = random.uniform(0.55, 0.90)
            base_dau_mau = random.uniform(0.15, 0.40)
            features_avail = random.randint(15, 50)
            base_feature_adopt = random.uniform(0.30, 0.80)
            base_onboarding = random.uniform(0.60, 0.95)

            month_idx = 0
            for period in _month_range(seed_start, today):
                # Gradual improvement with occasional dips
                trend = 1.0 + month_idx * 0.005
                dip = 0.92 if random.random() < 0.08 else 1.0

                active = max(1, int(licensed * base_adoption * trend * dip))
                active = min(active, licensed)
                mau = active
                dau = max(1, int(mau * base_dau_mau * trend * dip))
                features_adopted = max(1, int(features_avail * base_feature_adopt * trend * dip))
                features_adopted = min(features_adopted, features_avail)
                onboarding = min(100, round(base_onboarding * trend * dip * 100, 2))

                cur.execute(
                    """INSERT INTO pds_technology_adoption
                       (adoption_id, env_id, business_id, account_id,
                        tool_name, period,
                        licensed_users, active_users, dau, mau,
                        avg_session_duration_min, features_available, features_adopted,
                        onboarding_completion_pct, time_to_value_days, metadata_json)
                       VALUES (%s, %s::uuid, %s::uuid, %s,
                               %s, %s,
                               %s, %s, %s, %s,
                               %s, %s, %s,
                               %s, %s, '{}')
                    """,
                    (
                        _uid(), env_str, biz_str, acc["account_id"],
                        tool, period,
                        licensed, active, dau, mau,
                        round(random.uniform(5, 35), 2),
                        features_avail, features_adopted,
                        onboarding,
                        random.randint(7, 60),
                    ),
                )
                count += 1
                month_idx += 1

    return count
