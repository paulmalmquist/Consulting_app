"""Resume environment service — career roles, skills, projects, and seeding."""
from __future__ import annotations

import json
from datetime import date
from uuid import UUID

from app.db import get_cursor


# ── Queries ───────────────────────────────────────────────────────────

def list_roles(*, env_id: UUID, business_id: UUID) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM resume_roles
            WHERE env_id = %s::uuid AND business_id = %s::uuid
            ORDER BY start_date ASC
            """,
            (str(env_id), str(business_id)),
        )
        return cur.fetchall()


def get_role(*, env_id: UUID, business_id: UUID, role_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM resume_roles
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND role_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(role_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Resume role not found")
        return row


def list_skills(*, env_id: UUID, business_id: UUID, category: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        sql = "SELECT * FROM resume_skills WHERE env_id = %s::uuid AND business_id = %s::uuid"
        params: list = [str(env_id), str(business_id)]
        if category:
            sql += " AND category = %s"
            params.append(category)
        sql += " ORDER BY category, proficiency DESC, name"
        cur.execute(sql, params)
        return cur.fetchall()


def list_projects(*, env_id: UUID, business_id: UUID, status: str | None = None) -> list[dict]:
    with get_cursor() as cur:
        sql = "SELECT * FROM resume_projects WHERE env_id = %s::uuid AND business_id = %s::uuid"
        params: list = [str(env_id), str(business_id)]
        if status:
            sql += " AND status = %s"
            params.append(status)
        sql += " ORDER BY sort_order, created_at DESC"
        cur.execute(sql, params)
        return cur.fetchall()


def get_project(*, env_id: UUID, business_id: UUID, project_id: UUID) -> dict:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM resume_projects
            WHERE env_id = %s::uuid AND business_id = %s::uuid AND project_id = %s::uuid
            """,
            (str(env_id), str(business_id), str(project_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError("Resume project not found")
        return row


def get_career_summary(*, env_id: UUID, business_id: UUID) -> dict:
    roles = list_roles(env_id=env_id, business_id=business_id)
    skills = list_skills(env_id=env_id, business_id=business_id)
    projects = list_projects(env_id=env_id, business_id=business_id)

    companies = set()
    earliest_start = None
    current_title = ""
    current_company = ""

    for r in roles:
        companies.add(r["company"])
        sd = r["start_date"]
        if isinstance(sd, str):
            sd = date.fromisoformat(sd)
        if earliest_start is None or sd < earliest_start:
            earliest_start = sd
        if r["end_date"] is None:
            current_title = r["title"]
            current_company = r["company"]

    total_years = 0.0
    if earliest_start:
        delta = date.today() - earliest_start
        total_years = round(delta.days / 365.25, 1)

    return {
        "total_years": total_years,
        "total_roles": len(roles),
        "total_companies": len(companies),
        "total_skills": len(skills),
        "total_projects": len(projects),
        "education": "B.A., Brown University",
        "location": "Lake Worth, FL",
        "current_title": current_title,
        "current_company": current_company,
    }


def get_skill_matrix(*, env_id: UUID, business_id: UUID) -> list[dict]:
    """Return skills grouped by category with average proficiency for radar chart."""
    skills = list_skills(env_id=env_id, business_id=business_id)
    categories: dict[str, list[int]] = {}
    for s in skills:
        cat = s["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(s["proficiency"])
    return [
        {
            "category": cat,
            "avg_proficiency": round(sum(vals) / len(vals), 1),
            "skill_count": len(vals),
            "max_proficiency": max(vals),
        }
        for cat, vals in sorted(categories.items())
    ]


# ── Seed ──────────────────────────────────────────────────────────────

_ROLES = [
    {
        "company": "JLL",
        "division": "JPMC Account",
        "title": "Senior Analyst, Data Engineering & Analytics / Business Analyst — PMO",
        "location": "Boca Raton, FL",
        "start_date": "2014-08-01",
        "end_date": "2018-02-01",
        "role_type": "engineering",
        "industry": "Financial Services / CRE",
        "summary": "Built JLL's first dedicated BI and data engineering service line for the JPMC national account. Defined standards for data ingestion, governance, and visualization.",
        "highlights": json.dumps([
            "Built JLL's first dedicated BI and data engineering service line for JPMC national account",
            "Engineered Tableau dashboards with optimized data extracts for predictive analysis on financial, milestone, and benchmarking data",
            "Built SQL stored procedures for automated data validations; increased data accuracy account-wide",
            "Recognized with Best Innovation of the Quarter for interactive PowerPivot dashboards",
        ]),
        "technologies": json.dumps(["SQL", "Tableau", "PowerPivot", "VBA", "Excel"]),
        "sort_order": 1,
    },
    {
        "company": "Kayne Anderson Real Estate",
        "division": None,
        "title": "Senior Associate, Data Engineering & Business Intelligence",
        "location": "Boca Raton, FL",
        "start_date": "2018-02-01",
        "end_date": "2021-01-01",
        "role_type": "engineering",
        "industry": "Real Estate Private Equity",
        "summary": "Automated data ingestion from partner accounting systems for 500+ properties. Developed high-performance Power BI dashboards for executives and asset management teams.",
        "highlights": json.dumps([
            "Automated data ingestion from partner accounting systems for 500+ properties using Azure Logic Apps and PySpark — replaced ~160 hours/month of manual entry",
            "Implemented VBA-driven acquisition pipeline workflows capturing 40+ acquisitions/week — eliminated 80 hours/month of manual input, reduced errors by 95%%",
            "Developed high-performance Power BI dashboards using optimized data models and DAX calculations",
        ]),
        "technologies": json.dumps(["Python", "PySpark", "Azure Logic Apps", "Power BI", "DAX", "SQL", "VBA"]),
        "sort_order": 2,
    },
    {
        "company": "Kayne Anderson Real Estate",
        "division": None,
        "title": "Vice President, Data Platform Engineering & FP&A",
        "location": "Boca Raton, FL",
        "start_date": "2021-01-01",
        "end_date": "2025-03-01",
        "role_type": "leadership",
        "industry": "Real Estate Private Equity",
        "summary": "Architected and delivered a centralized REPE Investment Data Warehouse on Databricks and Azure for a $4B+ AUM firm. Led offshore data engineering team.",
        "highlights": json.dumps([
            "Architected centralized REPE Investment Data Warehouse on Databricks and Azure — integrated DealCloud, MRI, Yardi, Excel, and Logic Apps across 500+ properties",
            "Reduced investor-relations DDQ response time by 50%% and accelerated quarterly reporting by 10 days",
            "Designed governed semantic layer unifying data across six business verticals in Power BI — achieved 50%% reduction in ad hoc reporting requests",
            "Built Python-based waterfall distribution engine replacing Excel-based models — reduced run times from five minutes to near-instant",
            "Designed automated SQL-driven data governance framework — cut manual reconciliation by 75%%",
            "Led offshore data engineering team across multiple critical ETL and BI delivery cycles",
        ]),
        "technologies": json.dumps(["Databricks", "Azure Data Lake", "PySpark", "Python", "SQL", "Power BI", "Tabular Editor", "DAX", "DealCloud", "MRI", "Yardi"]),
        "sort_order": 3,
    },
    {
        "company": "JLL",
        "division": "PDS Americas",
        "title": "Director, AI Data Platform & Analytics",
        "location": "Remote — National Client Delivery",
        "start_date": "2025-04-01",
        "end_date": None,
        "role_type": "leadership",
        "industry": "Professional Services / CRE",
        "summary": "Designed and delivered an AI-enabled analytics platform for JLL's Project & Development Services division integrating Databricks, Delta Lake, Genie, and OpenAI-based conversational wrappers.",
        "highlights": json.dumps([
            "Designed AI-enabled analytics platform integrating Databricks, Delta Lake, Genie, and OpenAI conversational wrappers for national client portfolio",
            "Established governed Medallion architecture (Bronze/Silver/Gold) codifying project, labor, financial, and performance methodologies",
            "Built and led high-leverage data engineering team; shifted analytics from analyst-dependent workflows to automated pipelines",
            "Standardized core business methodologies across 10+ client accounts, reducing downstream rework and accelerating reporting",
        ]),
        "technologies": json.dumps(["Databricks", "Delta Lake", "Unity Catalog", "OpenAI API", "LangChain", "Python", "PySpark", "SQL", "Azure"]),
        "sort_order": 4,
    },
    {
        "company": "Novendor",
        "division": None,
        "title": "Founder & CEO",
        "location": "Lake Worth, FL",
        "start_date": "2024-01-01",
        "end_date": None,
        "role_type": "founder",
        "industry": "Enterprise Software / AI",
        "summary": "Founded Novendor to build AI execution environments for investment management firms. Built Winston — a vertical AI platform for REPE firms with 83 MCP tools.",
        "highlights": json.dumps([
            "Built Winston from scratch: 83 MCP tools, SSE streaming, full REPE domain coverage",
            "Architected multi-runtime monorepo (Next.js 14 + FastAPI + Demo Lab)",
            "Full-stack AI platform: fund reporting, LP communications, waterfall modeling, deal pipeline, document processing",
            "Live demo environments at paulmalmquist.com",
        ]),
        "technologies": json.dumps(["Python", "FastAPI", "TypeScript", "Next.js 14", "React", "PostgreSQL", "Claude API", "OpenAI API", "SSE", "MCP"]),
        "sort_order": 5,
    },
]

_SKILLS = [
    # data_platform
    ("Databricks", "data_platform", 9, 5, "Delta Lake, Unity Catalog, Delta Live Tables, Genie, Medallion Architecture"),
    ("Azure Data Lake", "data_platform", 8, 5, "ADLS Gen2, Logic Apps, Azure DevOps"),
    ("Snowflake", "data_platform", 6, 2, "Data warehouse, external stages"),
    ("PostgreSQL", "data_platform", 9, 3, "psycopg3, pgvector, advanced SQL"),
    ("DealCloud", "data_platform", 8, 4, "CRM integration, ETL pipelines"),
    ("MRI / Yardi", "data_platform", 7, 4, "Property management system integration"),
    # ai_ml
    ("OpenAI API", "ai_ml", 9, 2, "GPT-4/5, embeddings, function calling, RAG"),
    ("Claude API", "ai_ml", 9, 2, "MCP tools, SSE streaming, structured output"),
    ("LangChain", "ai_ml", 7, 1, "RAG pipelines, conversational wrappers"),
    ("RAG Architecture", "ai_ml", 9, 2, "pgvector, chunking, semantic search, hybrid retrieval"),
    ("MCP Tool Framework", "ai_ml", 10, 2, "83 tools, audit policy, lane-based access control"),
    # languages
    ("Python", "languages", 10, 11, "FastAPI, PySpark, psycopg3, Pydantic, data engineering"),
    ("SQL", "languages", 10, 11, "Postgres, Databricks SQL, stored procedures, ETL"),
    ("TypeScript", "languages", 8, 3, "Next.js 14, React, full-stack"),
    ("PySpark", "languages", 9, 5, "ETL pipelines, Delta Lake, data transformations"),
    ("DAX", "languages", 8, 5, "Power BI semantic models, Tabular Editor"),
    ("VBA", "languages", 7, 4, "Excel automation, acquisition pipelines"),
    # cloud
    ("Azure", "cloud", 9, 7, "Data Lake, Logic Apps, DevOps, Functions"),
    ("Railway", "cloud", 7, 2, "FastAPI deployment, CI/CD"),
    ("Vercel", "cloud", 7, 2, "Next.js deployment, edge functions"),
    # visualization
    ("Power BI", "visualization", 9, 7, "Tabular Editor, DAX, semantic layer design, self-service analytics"),
    ("Tableau", "visualization", 7, 4, "Dashboard design, optimized data extracts"),
    ("Recharts / React Charts", "visualization", 7, 2, "Custom chart components, responsive design"),
    # domain
    ("Real Estate Private Equity", "domain", 9, 7, "Waterfall modeling, fund reporting, LP communications, deal pipeline"),
    ("Investment Data Warehousing", "domain", 9, 7, "DealCloud, MRI, Yardi integration, DDQ automation"),
    ("ETL Pipeline Design", "domain", 10, 11, "PySpark, SQL, dbt, CI/CD, data governance"),
    ("Financial Modeling", "domain", 8, 7, "Waterfall distributions, scenario analysis, IRR/TVPI"),
    # leadership
    ("Team Leadership", "leadership", 8, 5, "Offshore teams, delivery standards, review processes"),
    ("Product Architecture", "leadership", 9, 3, "Multi-runtime monorepo, platform design"),
    ("Enterprise Sales", "leadership", 7, 2, "Demo environments, client delivery, positioning"),
]

_PROJECTS = [
    {
        "name": "Winston AI Platform",
        "client": "Novendor (internal product)",
        "status": "active",
        "summary": "Full-stack AI platform for REPE firms. 83 MCP tools, streaming chat workspace, fund portfolio management, waterfall engine, deal radar, document processing.",
        "impact": "Live at paulmalmquist.com with demo environments. Proves AI execution environment model for investment management.",
        "technologies": json.dumps(["FastAPI", "Next.js 14", "PostgreSQL", "Claude API", "OpenAI API", "SSE", "MCP", "pgvector"]),
        "metrics": json.dumps([
            {"label": "MCP Tools", "value": "83"},
            {"label": "Demo Assets", "value": "33"},
            {"label": "Demo Funds", "value": "5"},
            {"label": "AUM in Demo", "value": "$2B+"},
        ]),
        "url": "https://paulmalmquist.com",
        "sort_order": 1,
    },
    {
        "name": "REPE Investment Data Warehouse",
        "client": "Kayne Anderson Real Estate",
        "status": "completed",
        "summary": "Centralized investment data warehouse on Databricks and Azure integrating DealCloud, MRI, Yardi, and Excel workflows across 500+ properties for a $4B+ AUM firm.",
        "impact": "Reduced DDQ response time by 50%, accelerated quarterly reporting by 10 days, cut manual reconciliation by 75%.",
        "technologies": json.dumps(["Databricks", "Azure Data Lake", "PySpark", "SQL", "Power BI", "DealCloud", "MRI", "Yardi"]),
        "metrics": json.dumps([
            {"label": "Properties", "value": "500+"},
            {"label": "AUM", "value": "$4B+"},
            {"label": "DDQ Time Reduction", "value": "50%"},
            {"label": "Reporting Acceleration", "value": "10 days"},
        ]),
        "sort_order": 2,
    },
    {
        "name": "Waterfall Distribution Engine",
        "client": "Kayne Anderson Real Estate",
        "status": "completed",
        "summary": "Python-based waterfall distribution engine replacing Excel-based investment scenario models for fund distributions and LP/GP allocations.",
        "impact": "Reduced fund distribution scenario run times from five minutes to near-instant, directly accelerating investment decision cycles.",
        "technologies": json.dumps(["Python", "SQL", "Excel"]),
        "metrics": json.dumps([
            {"label": "Speed Improvement", "value": "~100x"},
            {"label": "Previous Runtime", "value": "5 min"},
            {"label": "New Runtime", "value": "< 3 sec"},
        ]),
        "sort_order": 3,
    },
    {
        "name": "JLL PDS AI Analytics Platform",
        "client": "JLL — PDS Americas",
        "status": "active",
        "summary": "AI-enabled analytics platform for JLL's Project & Development Services division integrating Databricks, Delta Lake, Genie, and OpenAI conversational wrappers.",
        "impact": "Materially reduced manual reporting overhead for executive and client-facing deliverables. Standardized methodologies across 10+ client accounts.",
        "technologies": json.dumps(["Databricks", "Delta Lake", "Unity Catalog", "OpenAI API", "LangChain", "Python", "PySpark"]),
        "metrics": json.dumps([
            {"label": "Client Accounts", "value": "10+"},
            {"label": "Architecture", "value": "Medallion (B/S/G)"},
        ]),
        "sort_order": 4,
    },
    {
        "name": "JPMC BI Service Line",
        "client": "JLL — JPMC Account",
        "status": "completed",
        "summary": "Built JLL's first dedicated BI and data engineering service line for the JPMC national account. Defined repeatable client delivery model for data ingestion, governance, and visualization.",
        "impact": "Established repeatable delivery model adopted across the account. Recognized with Best Innovation of the Quarter.",
        "technologies": json.dumps(["Tableau", "SQL", "PowerPivot", "VBA"]),
        "metrics": json.dumps([
            {"label": "Recognition", "value": "Best Innovation of Quarter"},
            {"label": "Scope", "value": "National Account"},
        ]),
        "sort_order": 5,
    },
]


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    """Idempotent seed of Paul Malmquist's resume data."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT role_id FROM resume_roles WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        if cur.fetchone():
            return {"seeded": False, "reason": "already_seeded"}

    role_ids = []
    with get_cursor() as cur:
        for r in _ROLES:
            cur.execute(
                """
                INSERT INTO resume_roles
                (env_id, business_id, company, division, title, location,
                 start_date, end_date, role_type, industry, summary, highlights, technologies, sort_order)
                VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
                RETURNING role_id
                """,
                (
                    str(env_id), str(business_id),
                    r["company"], r["division"], r["title"], r["location"],
                    r["start_date"], r["end_date"], r["role_type"], r["industry"],
                    r["summary"], r["highlights"], r["technologies"], r["sort_order"],
                ),
            )
            role_ids.append(str(cur.fetchone()["role_id"]))

        for name, category, proficiency, years_used, context in _SKILLS:
            cur.execute(
                """
                INSERT INTO resume_skills (env_id, business_id, name, category, proficiency, years_used, context)
                VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s)
                ON CONFLICT (env_id, name) DO NOTHING
                """,
                (str(env_id), str(business_id), name, category, proficiency, years_used, context),
            )

        for p in _PROJECTS:
            cur.execute(
                """
                INSERT INTO resume_projects
                (env_id, business_id, name, client, status, summary, impact, technologies, metrics, url, sort_order)
                VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
                """,
                (
                    str(env_id), str(business_id),
                    p["name"], p["client"], p["status"], p["summary"], p["impact"],
                    p["technologies"], p["metrics"], p.get("url"), p["sort_order"],
                ),
            )

    # Seed RAG documents (best-effort — won't fail the seed if RAG is unavailable)
    rag_chunks = 0
    try:
        from app.services.resume_rag_seed import seed_resume_rag
        rag_chunks = seed_resume_rag(env_id=env_id, business_id=business_id)
    except Exception:
        pass

    return {"seeded": True, "role_ids": role_ids, "rag_chunks": rag_chunks}
