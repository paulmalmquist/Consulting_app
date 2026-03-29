"""Resume environment service — career roles, skills, projects, and seeding."""
from __future__ import annotations

import json
from datetime import date
from uuid import UUID

import psycopg

from app.db import get_cursor
from app.services.resume_workspace import (
    build_resume_workspace_payload,
    generate_resume_assistant_response,
)


def _table_exists(table_name: str) -> bool:
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = %s
            LIMIT 1
            """,
            (table_name,),
        )
        return bool(cur.fetchone())


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
        "end_date": "2018-01-31",
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


_CAREER_PHASES = [
    {
        "phase_id": "phase-jll-2014-2018",
        "company": "JLL",
        "phase_name": "JLL (2014-2018)",
        "start_date": "2014-08-01",
        "end_date": "2018-01-31",
        "description": "Reporting foundation and BI scope expansion on the JPMC national account.",
        "band_color": "#1D4ED8",
        "overlay_only": False,
        "display_order": 1,
    },
    {
        "phase_id": "phase-kayne-2018-2025",
        "company": "Kayne Anderson",
        "phase_name": "Kayne Anderson (2018-2025)",
        "start_date": "2018-02-01",
        "end_date": "2025-03-31",
        "description": "Automation, warehouse, semantic layer, and waterfall modernization for a $4B+ AUM platform.",
        "band_color": "#D97706",
        "overlay_only": False,
        "display_order": 2,
    },
    {
        "phase_id": "phase-jll-2025-present",
        "company": "JLL",
        "phase_name": "JLL (2025-present)",
        "start_date": "2025-04-01",
        "end_date": None,
        "description": "AI-enabled analytics and governed data delivery across PDS Americas.",
        "band_color": "#7C3AED",
        "overlay_only": False,
        "display_order": 3,
    },
]

_CAPABILITY_LAYERS = [
    {
        "layer_id": "data_platform",
        "name": "Data Platform / Warehouse",
        "color": "#14B8A6",
        "description": "Lakehouse, warehouse, source integration, and durable operating data foundations.",
        "sort_order": 1,
        "is_visible": True,
    },
    {
        "layer_id": "bi_reporting",
        "name": "BI / Reporting Systems",
        "color": "#3B82F6",
        "description": "Dashboards, semantic models, and reusable reporting surfaces.",
        "sort_order": 2,
        "is_visible": True,
    },
    {
        "layer_id": "financial_modeling",
        "name": "Financial Modeling / Waterfalls",
        "color": "#6366F1",
        "description": "Waterfall distributions, scenario engines, and fund-model logic turned into software.",
        "sort_order": 3,
        "is_visible": True,
    },
    {
        "layer_id": "automation_workflow",
        "name": "Automation / Workflow",
        "color": "#22C55E",
        "description": "Manual analyst work converted into governed repeatable pipelines and workflows.",
        "sort_order": 4,
        "is_visible": True,
    },
    {
        "layer_id": "ai_agentic",
        "name": "AI / Agentic Systems",
        "color": "#A855F7",
        "description": "LLM interfaces, MCP tools, and conversational operating surfaces on governed data.",
        "sort_order": 5,
        "is_visible": True,
    },
    {
        "layer_id": "executive_decision_support",
        "name": "Executive Decision Support",
        "color": "#F97316",
        "description": "Systems designed to improve operating cadence, investor response, and executive clarity.",
        "sort_order": 6,
        "is_visible": True,
    },
]

_DELIVERY_INITIATIVES = [
    {
        "initiative_id": "initiative-jll-reporting-foundation",
        "phase_id": "phase-jll-2014-2018",
        "role_sort_order": 1,
        "title": "Reporting foundation and PMO operating rhythm",
        "summary": "Moved project reporting from manual coordination into consistent analytical operating cadence.",
        "team_context": "Embedded JPMC account delivery team.",
        "business_challenge": "Reporting was manual, inconsistent, and heavily analyst-dependent.",
        "measurable_outcome": "Created the operational foundation that made BI delivery possible.",
        "stakeholder_group": "Account leadership and delivery operators",
        "scale": "National account reporting workflow",
        "architecture": "Excel, SQL extracts, and repeatable reporting templates.",
        "start_date": "2014-08-01",
        "end_date": "2016-02-29",
        "category": "foundation",
        "impact_area": "decision_support",
        "impact_tag": "Reporting cadence standardized",
        "importance": 40,
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "technologies": ["Excel", "SQL", "PowerPivot"],
        "linked_modules": ["timeline", "bi"],
        "linked_architecture_node_ids": ["api_sources", "bi_dashboards"],
        "linked_bi_entity_ids": ["fund-jpmc-ops"],
        "linked_model_preset": None,
        "metrics_json": {"systems_replaced": 1, "stakeholders_served": 20},
    },
    {
        "initiative_id": "initiative-jll-bi-service-line",
        "phase_id": "phase-jll-2014-2018",
        "role_sort_order": 1,
        "title": "JLL BI service line buildout",
        "summary": "Built JLL’s first dedicated BI and data engineering service line for the JPMC national account.",
        "team_context": "Small leverage-focused analytics team.",
        "business_challenge": "No reusable analytics backbone or dedicated BI capability existed on the account.",
        "measurable_outcome": "Created repeatable dashboard delivery and executive-ready reporting systems.",
        "stakeholder_group": "National account leadership",
        "scale": "JPMC national account",
        "architecture": "Tableau, SQL validations, and optimized data extracts.",
        "start_date": "2016-03-01",
        "end_date": "2018-01-31",
        "category": "bi",
        "impact_area": "decision_support",
        "impact_tag": "BI capability established",
        "importance": 65,
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "technologies": ["Tableau", "SQL", "PowerPivot", "VBA"],
        "linked_modules": ["timeline", "bi", "architecture"],
        "linked_architecture_node_ids": ["api_sources", "semantic_models", "bi_dashboards"],
        "linked_bi_entity_ids": ["fund-jpmc-ops"],
        "linked_model_preset": None,
        "metrics_json": {"systems_replaced": 2, "stakeholders_served": 50},
    },
    {
        "initiative_id": "initiative-kayne-automation",
        "phase_id": "phase-kayne-2018-2025",
        "role_sort_order": 2,
        "title": "500+ property automation and ingestion",
        "summary": "Automated partner accounting ingestion and recurring analyst workflows across a 500+ property footprint.",
        "team_context": "FP&A, asset management, and engineering collaboration.",
        "business_challenge": "Manual uploads and spreadsheet stitching were consuming analyst bandwidth and creating errors.",
        "measurable_outcome": "Replaced manual intake with governed ingestion and validation.",
        "stakeholder_group": "FP&A and asset management",
        "scale": "500+ properties",
        "architecture": "Azure landing zone, Logic Apps, PySpark pipelines, Power BI outputs.",
        "start_date": "2018-02-01",
        "end_date": "2020-12-31",
        "category": "automation",
        "impact_area": "time_saved",
        "impact_tag": "160+ hours/month recaptured",
        "importance": 75,
        "capability_tags": ["automation_workflow", "data_platform", "executive_decision_support"],
        "technologies": ["Azure Logic Apps", "PySpark", "SQL", "Power BI", "VBA"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["yardi_mri", "azure_data_lake", "databricks_etl"],
        "linked_bi_entity_ids": ["fund-kayne-ops"],
        "linked_model_preset": None,
        "metrics_json": {"time_saved": 160, "volume_supported": 500, "systems_replaced": 2},
    },
    {
        "initiative_id": "initiative-kayne-warehouse",
        "phase_id": "phase-kayne-2018-2025",
        "role_sort_order": 3,
        "title": "Kayne warehouse and source-of-truth platform",
        "summary": "Architected the central REPE warehouse that unified investment, property, and operational data.",
        "team_context": "Internal finance stakeholders plus offshore engineering support.",
        "business_challenge": "DealCloud, MRI, Yardi, and Excel models were fragmented and slowed reporting.",
        "measurable_outcome": "Created the governed platform backbone for every downstream reporting and DDQ workflow.",
        "stakeholder_group": "Executive leadership, FP&A, investor relations",
        "scale": "$4B+ AUM platform",
        "architecture": "Databricks, Azure Data Lake, PySpark medallion architecture.",
        "start_date": "2021-02-01",
        "end_date": "2023-06-30",
        "category": "automation",
        "impact_area": "scale_integrated",
        "impact_tag": "6+ systems unified",
        "importance": 90,
        "capability_tags": ["data_platform", "executive_decision_support"],
        "technologies": ["Databricks", "Azure Data Lake", "PySpark", "DealCloud", "MRI", "Yardi"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["dealcloud", "yardi_mri", "azure_data_lake", "databricks_etl", "silver_tables", "gold_tables"],
        "linked_bi_entity_ids": ["fund-kayne-warehouse"],
        "linked_model_preset": None,
        "metrics_json": {"volume_supported": 500, "systems_replaced": 6, "stakeholders_served": 40},
    },
    {
        "initiative_id": "initiative-kayne-semantic-governance",
        "phase_id": "phase-kayne-2018-2025",
        "role_sort_order": 3,
        "title": "Semantic layer and governance standardization",
        "summary": "Standardized metrics and reporting logic so teams could self-serve trusted answers.",
        "team_context": "Finance, investor relations, and asset management consumers.",
        "business_challenge": "Analysts were recreating definitions and reports across teams.",
        "measurable_outcome": "Reduced ad hoc reporting and accelerated quarter-close delivery.",
        "stakeholder_group": "Portfolio leadership and analyst teams",
        "scale": "Six business verticals",
        "architecture": "Gold tables feeding semantic models and governed BI datasets.",
        "start_date": "2022-04-01",
        "end_date": "2024-09-30",
        "category": "governance",
        "impact_area": "reporting_acceleration",
        "impact_tag": "10-day reporting acceleration",
        "importance": 80,
        "capability_tags": ["bi_reporting", "data_platform", "executive_decision_support"],
        "technologies": ["Power BI", "DAX", "Semantic Layer", "SQL", "Tabular Editor"],
        "linked_modules": ["timeline", "bi", "architecture"],
        "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
        "linked_bi_entity_ids": ["fund-kayne-warehouse"],
        "linked_model_preset": None,
        "metrics_json": {"cycle_time_reduction": 10, "systems_replaced": 2, "stakeholders_served": 30},
    },
    {
        "initiative_id": "initiative-kayne-waterfall-engine",
        "phase_id": "phase-kayne-2018-2025",
        "role_sort_order": 3,
        "title": "Waterfall engine replacing Excel",
        "summary": "Replaced spreadsheet-driven waterfall scenarios with a deterministic software engine.",
        "team_context": "Finance and investment collaboration.",
        "business_challenge": "Excel scenarios were slow, fragile, and difficult to audit.",
        "measurable_outcome": "Created reliable LP/GP distribution analysis and faster investment iteration.",
        "stakeholder_group": "Investment committee and FP&A",
        "scale": "Fund-level distribution modeling",
        "architecture": "Python runtime using governed investment inputs and reusable allocation logic.",
        "start_date": "2023-01-01",
        "end_date": "2024-05-31",
        "category": "modeling",
        "impact_area": "decision_support",
        "impact_tag": "Excel process replaced by near-instant runs",
        "importance": 85,
        "capability_tags": ["financial_modeling", "automation_workflow", "executive_decision_support"],
        "technologies": ["Python", "SQL", "Excel"],
        "linked_modules": ["timeline", "modeling", "architecture", "bi"],
        "linked_architecture_node_ids": ["excel_ingestion", "gold_tables"],
        "linked_bi_entity_ids": ["investment-kayne-waterfall"],
        "linked_model_preset": "base_case",
        "metrics_json": {"systems_replaced": 1, "cycle_time_reduction": 5, "time_saved": 40},
    },
    {
        "initiative_id": "initiative-winston-overlay",
        "phase_id": None,
        "role_sort_order": 5,
        "title": "Winston / 83 MCP tools overlay",
        "summary": "Built the parallel AI execution layer that proves the transition from governed data to agentic operating systems.",
        "team_context": "Founder-led product architecture and delivery.",
        "business_challenge": "Generic AI tools could not execute domain-specific REPE workflows.",
        "measurable_outcome": "Created an AI tool surface with domain actions, auditability, and structured outputs.",
        "stakeholder_group": "Operators, executives, and product buyers",
        "scale": "Vertical AI platform",
        "architecture": "Next.js, FastAPI, PostgreSQL, MCP, streaming interfaces, model routing.",
        "start_date": "2024-01-01",
        "end_date": "2026-03-27",
        "category": "ai",
        "impact_area": "decision_support",
        "impact_tag": "83 MCP tools shipped",
        "importance": 95,
        "capability_tags": ["ai_agentic", "automation_workflow", "executive_decision_support"],
        "technologies": ["FastAPI", "Next.js 14", "PostgreSQL", "MCP", "OpenAI API", "Claude API"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["vector_db", "rag_pipelines", "winston_interface"],
        "linked_bi_entity_ids": ["fund-jll-pds"],
        "linked_model_preset": None,
        "metrics_json": {"systems_replaced": 3, "stakeholders_served": 15, "volume_supported": 83},
    },
    {
        "initiative_id": "initiative-jll-ai-analytics",
        "phase_id": "phase-jll-2025-present",
        "role_sort_order": 4,
        "title": "JLL AI analytics platform",
        "summary": "Merged governed data architecture with AI query patterns so business users could ask for insight directly.",
        "team_context": "BI leadership, engineering, and client-delivery stakeholders.",
        "business_challenge": "Reporting consistency and methodology standardization broke down across accounts.",
        "measurable_outcome": "Delivered a conversational analytics layer on top of governed project and financial data.",
        "stakeholder_group": "PDS leadership and client teams",
        "scale": "10+ client accounts",
        "architecture": "Databricks medallion foundation, semantic models, and AI query orchestration.",
        "start_date": "2025-04-01",
        "end_date": "2026-03-27",
        "category": "ai",
        "impact_area": "decision_support",
        "impact_tag": "Conversational BI for executive delivery",
        "importance": 88,
        "capability_tags": ["ai_agentic", "data_platform", "bi_reporting", "executive_decision_support"],
        "technologies": ["Databricks", "Delta Lake", "Unity Catalog", "OpenAI", "FastAPI", "Semantic Layer"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["databricks_etl", "gold_tables", "semantic_models", "rag_pipelines", "winston_interface"],
        "linked_bi_entity_ids": ["fund-jll-pds"],
        "linked_model_preset": None,
        "metrics_json": {"stakeholders_served": 25, "systems_replaced": 2, "volume_supported": 10},
    },
]

_CAREER_MILESTONES = [
    {
        "milestone_id": "milestone-joined-jll-2014",
        "phase_id": "phase-jll-2014-2018",
        "title": "Joined JLL / reporting foundation",
        "date": "2014-08-01",
        "type": "transition",
        "summary": "Entered the JLL/JPMC delivery environment and built the execution discipline that later became system design leverage.",
        "importance": 35,
        "play_order": 1,
        "capability_tags": ["executive_decision_support"],
        "linked_modules": ["timeline"],
        "linked_architecture_node_ids": ["api_sources"],
        "linked_bi_entity_ids": ["fund-jpmc-ops"],
        "linked_model_preset": None,
        "metrics_json": {"stakeholders_served": 10},
        "artifact_refs": [],
        "snapshot_spec": {},
    },
    {
        "milestone_id": "milestone-expanded-bi-scope",
        "phase_id": "phase-jll-2014-2018",
        "title": "Expanded BI scope / JLL BI service line",
        "date": "2017-03-01",
        "type": "build",
        "summary": "Shifted from reporting support into a repeatable BI delivery capability with live dashboard systems.",
        "importance": 65,
        "play_order": 2,
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "linked_modules": ["timeline", "bi", "architecture"],
        "linked_architecture_node_ids": ["semantic_models", "bi_dashboards"],
        "linked_bi_entity_ids": ["fund-jpmc-ops"],
        "linked_model_preset": None,
        "metrics_json": {"systems_replaced": 2, "stakeholders_served": 50},
        "artifact_refs": [],
        "snapshot_spec": {},
    },
    {
        "milestone_id": "milestone-500-property-automation",
        "phase_id": "phase-kayne-2018-2025",
        "title": "500+ property automation",
        "date": "2020-09-01",
        "type": "impact",
        "summary": "Scale became the forcing function for governed ingestion architecture and automated workflows.",
        "importance": 78,
        "play_order": 3,
        "capability_tags": ["automation_workflow", "data_platform", "executive_decision_support"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["yardi_mri", "azure_data_lake", "databricks_etl"],
        "linked_bi_entity_ids": ["fund-kayne-ops"],
        "linked_model_preset": None,
        "metrics_json": {"time_saved": 160, "volume_supported": 500, "systems_replaced": 2},
        "artifact_refs": [],
        "snapshot_spec": {},
    },
    {
        "milestone_id": "milestone-kayne-warehouse-semantic",
        "phase_id": "phase-kayne-2018-2025",
        "title": "Kayne warehouse + semantic layer",
        "date": "2023-07-01",
        "type": "architecture",
        "summary": "The governed warehouse and semantic layer changed reporting from fragmented requests into a trusted operating system.",
        "importance": 92,
        "play_order": 4,
        "capability_tags": ["data_platform", "bi_reporting", "executive_decision_support"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
        "linked_bi_entity_ids": ["fund-kayne-warehouse"],
        "linked_model_preset": None,
        "metrics_json": {"ddq_turnaround": 50, "reporting_cycle_reduction": 10, "systems_replaced": 6},
        "artifact_refs": [],
        "snapshot_spec": {
            "title": "Warehouse before and after",
            "before": {
                "label": "Before",
                "nodes": ["DealCloud", "MRI / Yardi", "Excel models", "Manual DDQs"],
            },
            "after": {
                "label": "After",
                "nodes": ["Databricks lakehouse", "Gold tables", "Semantic model", "Executive BI"],
            },
        },
    },
    {
        "milestone_id": "milestone-waterfall-engine",
        "phase_id": "phase-kayne-2018-2025",
        "title": "Waterfall engine replacing Excel",
        "date": "2024-02-01",
        "type": "build",
        "summary": "A fragile spreadsheet process became a reusable decision engine with faster scenario iteration and auditability.",
        "importance": 88,
        "play_order": 5,
        "capability_tags": ["financial_modeling", "automation_workflow", "executive_decision_support"],
        "linked_modules": ["timeline", "modeling", "architecture"],
        "linked_architecture_node_ids": ["excel_ingestion", "gold_tables"],
        "linked_bi_entity_ids": ["investment-kayne-waterfall"],
        "linked_model_preset": "base_case",
        "metrics_json": {"cycle_time_reduction": 5, "systems_replaced": 1},
        "artifact_refs": [],
        "snapshot_spec": {
            "title": "Waterfall logic before and after",
            "before": {
                "label": "Before",
                "nodes": ["Excel waterfall tabs", "Manual scenario edits", "Slow comparisons"],
            },
            "after": {
                "label": "After",
                "nodes": ["Python engine", "Governed inputs", "Instant LP/GP scenarios"],
            },
        },
    },
    {
        "milestone_id": "milestone-winston-overlay",
        "phase_id": None,
        "title": "Winston / 83 MCP tools overlay",
        "date": "2024-10-01",
        "type": "overlay",
        "summary": "The parallel founder build shows how governed systems thinking compounds into an agentic execution layer.",
        "importance": 95,
        "play_order": 6,
        "capability_tags": ["ai_agentic", "automation_workflow", "executive_decision_support"],
        "linked_modules": ["timeline", "architecture"],
        "linked_architecture_node_ids": ["vector_db", "rag_pipelines", "winston_interface"],
        "linked_bi_entity_ids": ["fund-jll-pds"],
        "linked_model_preset": None,
        "metrics_json": {"volume_supported": 83, "systems_replaced": 3},
        "artifact_refs": [],
        "snapshot_spec": {
            "title": "AI execution layer",
            "before": {
                "label": "Before",
                "nodes": ["Dashboards", "Manual requests", "Static workflow handoffs"],
            },
            "after": {
                "label": "After",
                "nodes": ["LLM router", "83 MCP tools", "Structured actions", "Audit trail"],
            },
        },
    },
    {
        "milestone_id": "milestone-rejoined-jll-2025",
        "phase_id": "phase-jll-2025-present",
        "title": "Rejoined JLL in 2025 / AI analytics platform",
        "date": "2025-04-01",
        "type": "transition",
        "summary": "Returned to JLL with the full data-platform and AI playbook, now aimed at national client delivery.",
        "importance": 82,
        "play_order": 7,
        "capability_tags": ["ai_agentic", "data_platform", "bi_reporting", "executive_decision_support"],
        "linked_modules": ["timeline", "architecture", "bi"],
        "linked_architecture_node_ids": ["databricks_etl", "gold_tables", "semantic_models", "winston_interface"],
        "linked_bi_entity_ids": ["fund-jll-pds"],
        "linked_model_preset": None,
        "metrics_json": {"volume_supported": 10, "stakeholders_served": 25},
        "artifact_refs": [],
        "snapshot_spec": {},
    },
]

_ACCOMPLISHMENT_CARDS = [
    {
        "card_id": "card-jll-phase-context",
        "phase_id": "phase-jll-2014-2018",
        "milestone_id": None,
        "metric_key": None,
        "title": "JLL first period",
        "card_type": "context",
        "company": "JLL",
        "date_start": "2014-08-01",
        "date_end": "2018-01-31",
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "short_narrative": "Built the foundation: operational reporting discipline first, BI leverage second.",
        "context": "JLL’s JPMC account had reporting needs but no dedicated BI service line.",
        "action": "Created repeatable reporting and dashboard delivery patterns.",
        "impact": "Set the pattern for later enterprise-scale data and AI work.",
        "stakeholders": "Account leadership and delivery operators",
        "artifact_refs": [],
        "metrics_json": {"stakeholders_served": 50},
        "snapshot_spec": {},
        "sort_order": 1,
    },
    {
        "card_id": "card-bi-service-line-action",
        "phase_id": "phase-jll-2014-2018",
        "milestone_id": "milestone-expanded-bi-scope",
        "metric_key": None,
        "title": "From reports to a service line",
        "card_type": "action",
        "company": "JLL",
        "date_start": "2016-03-01",
        "date_end": "2018-01-31",
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "short_narrative": "The important jump was not prettier dashboards. It was making analytics a repeatable operating capability.",
        "context": "Analytics work had been ad hoc and dependent on individual analysts.",
        "action": "Built a structured BI delivery motion using Tableau, SQL validations, and reusable extracts.",
        "impact": "Leadership could trust a consistent reporting interface instead of one-off output.",
        "stakeholders": "National account leadership",
        "artifact_refs": [],
        "metrics_json": {"systems_replaced": 2},
        "snapshot_spec": {},
        "sort_order": 2,
    },
    {
        "card_id": "card-500-properties-problem",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-500-property-automation",
        "metric_key": "properties_integrated",
        "title": "Manual intake broke at scale",
        "card_type": "problem",
        "company": "Kayne Anderson",
        "date_start": "2018-02-01",
        "date_end": "2020-12-31",
        "capability_tags": ["automation_workflow", "data_platform"],
        "short_narrative": "500+ properties turned spreadsheet workflow pain into a systems problem.",
        "context": "Partner accounting feeds and acquisitions data entry required repetitive manual work and reconciliation.",
        "action": "Automated ingestion and validation with Azure Logic Apps, PySpark, and governed outputs.",
        "impact": "Freed analyst capacity and created a stronger data platform base.",
        "stakeholders": "FP&A and asset management",
        "artifact_refs": [],
        "metrics_json": {"time_saved": 160, "volume_supported": 500},
        "snapshot_spec": {},
        "sort_order": 3,
    },
    {
        "card_id": "card-500-properties-impact",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-500-property-automation",
        "metric_key": "properties_integrated",
        "title": "500+ properties integrated",
        "card_type": "impact",
        "company": "Kayne Anderson",
        "date_start": "2020-09-01",
        "date_end": "2020-09-01",
        "capability_tags": ["automation_workflow", "data_platform"],
        "short_narrative": "This is where scale stops being a bullet point and becomes evidence of operating leverage.",
        "context": "The automation layer had to hold across hundreds of assets and partner feeds.",
        "action": "Standardized ingestion contracts and recurring validation.",
        "impact": "160+ hours/month recaptured and far fewer manual-entry errors.",
        "stakeholders": "Finance, operations, asset management",
        "artifact_refs": [],
        "metrics_json": {"time_saved": 160, "volume_supported": 500, "systems_replaced": 2},
        "snapshot_spec": {},
        "sort_order": 4,
    },
    {
        "card_id": "card-kayne-warehouse-system",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-kayne-warehouse-semantic",
        "metric_key": None,
        "title": "Warehouse as operating backbone",
        "card_type": "system",
        "company": "Kayne Anderson",
        "date_start": "2021-02-01",
        "date_end": "2024-09-30",
        "capability_tags": ["data_platform", "bi_reporting", "executive_decision_support"],
        "short_narrative": "The important thing wasn’t just centralization. It was turning fragmented reporting into one governed operating surface.",
        "context": "DealCloud, MRI, Yardi, and Excel lived in separate worlds.",
        "action": "Created Databricks/Azure medallion flows, gold tables, and semantic models.",
        "impact": "A single platform now powered DDQs, reporting, and downstream analytics.",
        "stakeholders": "Executive leadership, FP&A, investor relations",
        "artifact_refs": [],
        "metrics_json": {"systems_replaced": 6},
        "snapshot_spec": {
            "title": "Before vs after warehouse",
            "before": {"label": "Before", "nodes": ["CRM exports", "Property systems", "Excel reports"]},
            "after": {"label": "After", "nodes": ["Lakehouse", "Gold tables", "Semantic model", "Executive BI"]},
        },
        "sort_order": 5,
    },
    {
        "card_id": "card-kayne-warehouse-impact",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-kayne-warehouse-semantic",
        "metric_key": "ddq_turnaround",
        "title": "DDQ turnaround became a platform outcome",
        "card_type": "impact",
        "company": "Kayne Anderson",
        "date_start": "2023-07-01",
        "date_end": "2023-07-01",
        "capability_tags": ["data_platform", "bi_reporting", "executive_decision_support"],
        "short_narrative": "The warehouse mattered because it changed investor-facing speed, not because the architecture looked sophisticated.",
        "context": "Investor requests depended on fragmented manual sourcing.",
        "action": "Put governed data and shared definitions underneath the reporting process.",
        "impact": "DDQ turnaround dropped by 50% and reporting accelerated by 10 days.",
        "stakeholders": "Investor relations and executive stakeholders",
        "artifact_refs": [],
        "metrics_json": {"ddq_turnaround": 50, "reporting_cycle_reduction": 10},
        "snapshot_spec": {},
        "sort_order": 6,
    },
    {
        "card_id": "card-reporting-cycle-impact",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-kayne-warehouse-semantic",
        "metric_key": "reporting_cycle",
        "title": "Quarter-close reporting moved faster",
        "card_type": "impact",
        "company": "Kayne Anderson",
        "date_start": "2023-07-01",
        "date_end": "2023-07-01",
        "capability_tags": ["bi_reporting", "executive_decision_support"],
        "short_narrative": "The system changed how quickly leadership could move from raw data to a decision-ready packet.",
        "context": "Quarter-close reporting and executive delivery were slowed by fragmented reconciliation.",
        "action": "Standardized semantic definitions and gold-layer outputs.",
        "impact": "Quarterly reporting accelerated by 10 days.",
        "stakeholders": "Leadership, FP&A, investor relations",
        "artifact_refs": [],
        "metrics_json": {"reporting_cycle_reduction": 10},
        "snapshot_spec": {},
        "sort_order": 7,
    },
    {
        "card_id": "card-waterfall-snapshot",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-waterfall-engine",
        "metric_key": None,
        "title": "Waterfall engine snapshot",
        "card_type": "snapshot",
        "company": "Kayne Anderson",
        "date_start": "2024-02-01",
        "date_end": "2024-02-01",
        "capability_tags": ["financial_modeling", "automation_workflow"],
        "short_narrative": "This is the clearest before/after proof that modeling depth became software, not spreadsheet maintenance.",
        "context": "Waterfall distributions lived in Excel logic that was slow to inspect and compare.",
        "action": "Rebuilt the process as a Python-based engine using governed inputs.",
        "impact": "Near-instant scenarios and clearer LP/GP economics.",
        "stakeholders": "Investment committee and FP&A",
        "artifact_refs": [],
        "metrics_json": {"systems_replaced": 1, "cycle_time_reduction": 5},
        "snapshot_spec": {
            "title": "Waterfall engine",
            "before": {"label": "Before", "nodes": ["Excel model", "Manual edits", "Slow reruns"]},
            "after": {"label": "After", "nodes": ["Python engine", "Structured inputs", "Fast distributions"]},
        },
        "sort_order": 8,
    },
    {
        "card_id": "card-waterfall-anecdote",
        "phase_id": "phase-kayne-2018-2025",
        "milestone_id": "milestone-waterfall-engine",
        "metric_key": None,
        "title": "Why the waterfall mattered",
        "card_type": "anecdote",
        "company": "Kayne Anderson",
        "date_start": "2024-02-01",
        "date_end": "2024-02-01",
        "capability_tags": ["financial_modeling", "executive_decision_support"],
        "short_narrative": "It proved the work was not 'just BI' because the financial engine itself became a productized system.",
        "context": "This is the transition from reporting systems into domain-deep operating software.",
        "action": "Encoded waterfall logic into a reusable calculation layer.",
        "impact": "Faster scenario iteration and less spreadsheet risk.",
        "stakeholders": "Investment and finance teams",
        "artifact_refs": [],
        "metrics_json": {"cycle_time_reduction": 5},
        "snapshot_spec": {},
        "sort_order": 9,
    },
    {
        "card_id": "card-winston-system",
        "phase_id": None,
        "milestone_id": "milestone-winston-overlay",
        "metric_key": "ai_tool_surface",
        "title": "Winston as a parallel proof point",
        "card_type": "system",
        "company": "Novendor",
        "date_start": "2024-01-01",
        "date_end": None,
        "capability_tags": ["ai_agentic", "automation_workflow", "executive_decision_support"],
        "short_narrative": "Winston is not another employer phase here. It is proof that the same systems thinking compounds into an agentic execution layer.",
        "context": "Generic enterprise AI tools were horizontal and thin on domain-specific action.",
        "action": "Built a vertical AI execution platform with 83 MCP tools, structured outputs, and auditability.",
        "impact": "Makes the recent AI claim concrete and linkable to a real operating surface.",
        "stakeholders": "Operators, executives, and product buyers",
        "artifact_refs": [],
        "metrics_json": {"volume_supported": 83, "systems_replaced": 3},
        "snapshot_spec": {
            "title": "Winston execution layer",
            "before": {"label": "Before", "nodes": ["Chat wrappers", "Manual follow-up", "No domain actions"]},
            "after": {"label": "After", "nodes": ["LLM router", "83 MCP tools", "Execution workflows", "Audit layer"]},
        },
        "sort_order": 10,
    },
    {
        "card_id": "card-jll-2025-context",
        "phase_id": "phase-jll-2025-present",
        "milestone_id": "milestone-rejoined-jll-2025",
        "metric_key": None,
        "title": "JLL second period in 2025",
        "card_type": "context",
        "company": "JLL",
        "date_start": "2025-04-01",
        "date_end": None,
        "capability_tags": ["ai_agentic", "data_platform", "bi_reporting"],
        "short_narrative": "This phase should read as the return of a much stronger builder, not a continuation blur from the first JLL chapter.",
        "context": "Rejoined JLL on April 1, 2025 with the full warehouse, governance, and AI playbook already earned.",
        "action": "Applied the compounded data-platform and AI toolkit to client-delivery analytics.",
        "impact": "Moved beyond dashboards into governed conversational analytics.",
        "stakeholders": "PDS leadership and client teams",
        "artifact_refs": [],
        "metrics_json": {"volume_supported": 10},
        "snapshot_spec": {},
        "sort_order": 11,
    },
    {
        "card_id": "card-jll-2025-stakeholders",
        "phase_id": "phase-jll-2025-present",
        "milestone_id": "milestone-rejoined-jll-2025",
        "metric_key": "ai_tool_surface",
        "title": "Who the 2025 platform served",
        "card_type": "stakeholders",
        "company": "JLL",
        "date_start": "2025-04-01",
        "date_end": None,
        "capability_tags": ["ai_agentic", "executive_decision_support"],
        "short_narrative": "The JLL return matters because the AI layer was used for delivery and client-facing execution, not a lab-only prototype.",
        "context": "The platform had to serve both internal methodology and client-facing reporting needs.",
        "action": "Standardized analytics across 10+ accounts and exposed conversational access patterns.",
        "impact": "Turned reporting infrastructure into a live intelligence interface.",
        "stakeholders": "PDS leaders, delivery teams, and client account stakeholders",
        "artifact_refs": [],
        "metrics_json": {"stakeholders_served": 25, "volume_supported": 10},
        "snapshot_spec": {},
        "sort_order": 12,
    },
]

_METRIC_ANCHORS = [
    {
        "anchor_id": "anchor-properties-integrated",
        "hero_metric_key": "properties_integrated",
        "title": "500+ properties integrated",
        "default_view": "impact",
        "linked_phase_ids": ["phase-kayne-2018-2025"],
        "linked_milestone_ids": ["milestone-500-property-automation", "milestone-kayne-warehouse-semantic"],
        "linked_capability_layer_ids": ["automation_workflow", "data_platform"],
        "narrative_hint": "Scale became the forcing function for stronger ingestion, governance, and warehouse design.",
        "sort_order": 1,
    },
    {
        "anchor_id": "anchor-ddq-turnaround",
        "hero_metric_key": "ddq_turnaround",
        "title": "DDQ turnaround reduced by 50%",
        "default_view": "impact",
        "linked_phase_ids": ["phase-kayne-2018-2025"],
        "linked_milestone_ids": ["milestone-kayne-warehouse-semantic"],
        "linked_capability_layer_ids": ["data_platform", "bi_reporting", "executive_decision_support"],
        "narrative_hint": "The warehouse mattered because it changed investor-facing speed and trust.",
        "sort_order": 2,
    },
    {
        "anchor_id": "anchor-reporting-cycle",
        "hero_metric_key": "reporting_cycle",
        "title": "Reporting cycle accelerated by 10 days",
        "default_view": "impact",
        "linked_phase_ids": ["phase-kayne-2018-2025"],
        "linked_milestone_ids": ["milestone-kayne-warehouse-semantic"],
        "linked_capability_layer_ids": ["bi_reporting", "executive_decision_support"],
        "narrative_hint": "Governance and semantic definitions shortened the path from raw data to decision-ready reporting.",
        "sort_order": 3,
    },
    {
        "anchor_id": "anchor-ai-tool-surface",
        "hero_metric_key": "ai_tool_surface",
        "title": "83 MCP tools and AI execution layer",
        "default_view": "capability",
        "linked_phase_ids": ["phase-jll-2025-present"],
        "linked_milestone_ids": ["milestone-winston-overlay", "milestone-rejoined-jll-2025"],
        "linked_capability_layer_ids": ["ai_agentic", "executive_decision_support"],
        "narrative_hint": "The AI layer is shown as an overlay proof point plus its application in the 2025 JLL return.",
        "sort_order": 4,
    },
]


# ── New queries (system components, deployments, stats) ──────────

def list_system_components(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_system_components"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_system_components
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY sort_order
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_deployments(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_deployments"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT d.*, r.company, r.title, r.start_date, r.end_date, r.location
                FROM resume_deployments d
                LEFT JOIN resume_roles r ON r.role_id = d.role_id
                WHERE d.env_id = %s::uuid AND d.business_id = %s::uuid
                ORDER BY d.sort_order
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_career_phases(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_career_phases"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_career_phases
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY display_order
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_capability_layers(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_capability_layers"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_capability_layers
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY sort_order
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_delivery_initiatives(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_delivery_initiatives"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_delivery_initiatives
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY start_date ASC, importance DESC
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_career_milestones(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_career_milestones"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_career_milestones
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY date ASC, coalesce(play_order, 999)
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_accomplishment_cards(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_accomplishment_cards"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_accomplishment_cards
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY sort_order, coalesce(date_start, date_end, now()::date)
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def list_metric_anchors(*, env_id: UUID, business_id: UUID) -> list[dict]:
    if not _table_exists("resume_metric_anchors"):
        return []

    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT * FROM resume_metric_anchors
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY sort_order
                """,
                (str(env_id), str(business_id)),
            )
            return cur.fetchall()
    except psycopg.errors.UndefinedTable:
        return []


def get_system_stats(*, env_id: UUID, business_id: UUID) -> dict:
    """Compute live system metrics from resume data."""
    roles = list_roles(env_id=env_id, business_id=business_id)
    projects = list_projects(env_id=env_id, business_id=business_id)

    # Count active systems
    active_count = sum(1 for p in projects if p["status"] == "active")

    return {
        "properties_managed": 500,
        "pipelines_built": 12,
        "hours_saved_monthly": 240,
        "performance_gain_pct": 100,
        "mcp_tools": 83,
        "active_systems": active_count,
        "total_roles": len(roles),
        "total_projects": len(projects),
        "system_status": "active",
    }


def get_workspace_payload(*, env_id: UUID, business_id: UUID) -> dict:
    summary = get_career_summary(env_id=env_id, business_id=business_id)
    stats = get_system_stats(env_id=env_id, business_id=business_id)
    roles = list_roles(env_id=env_id, business_id=business_id)
    projects = list_projects(env_id=env_id, business_id=business_id)
    components = list_system_components(env_id=env_id, business_id=business_id)
    deployments = list_deployments(env_id=env_id, business_id=business_id)
    phases = list_career_phases(env_id=env_id, business_id=business_id)
    capability_layers = list_capability_layers(env_id=env_id, business_id=business_id)
    initiatives = list_delivery_initiatives(env_id=env_id, business_id=business_id)
    milestones = list_career_milestones(env_id=env_id, business_id=business_id)
    accomplishment_cards = list_accomplishment_cards(env_id=env_id, business_id=business_id)
    metric_anchors = list_metric_anchors(env_id=env_id, business_id=business_id)
    return build_resume_workspace_payload(
        summary=summary,
        stats=stats,
        roles=roles,
        projects=projects,
        components=components,
        deployments=deployments,
        phases=phases,
        capability_layers=capability_layers,
        initiatives=initiatives,
        milestones=milestones,
        accomplishment_cards=accomplishment_cards,
        metric_anchors=metric_anchors,
    )


def get_assistant_response(*, env_id: UUID, business_id: UUID, query: str, context: dict) -> dict:
    workspace = get_workspace_payload(env_id=env_id, business_id=business_id)
    return generate_resume_assistant_response(
        workspace=workspace,
        query=query,
        context=context,
    )


# ── Seed data: system components ─────────────────────────────────

_SYSTEM_COMPONENTS = [
    # Data Platform layer
    {
        "layer": "data_platform",
        "name": "Databricks Lakehouse",
        "description": "Unified analytics platform with Delta Lake for ACID transactions, Unity Catalog for governance, and Medallion architecture (Bronze/Silver/Gold).",
        "tools": json.dumps(["Databricks", "Delta Lake", "Unity Catalog", "PySpark"]),
        "outcomes": json.dumps(["500+ properties integrated", "75% reduction in manual reconciliation", "10-day reporting acceleration"]),
        "connections": json.dumps([{"target_layer": "investment_engine", "label": "feeds"}, {"target_layer": "ai_layer", "label": "embeddings"}]),
        "icon_key": "database",
        "sort_order": 1,
    },
    {
        "layer": "data_platform",
        "name": "Azure Data Lake",
        "description": "Cloud-scale data storage with ADLS Gen2, Logic Apps for orchestration, and DevOps CI/CD pipelines.",
        "tools": json.dumps(["Azure Data Lake", "Logic Apps", "Azure DevOps", "Azure Functions"]),
        "outcomes": json.dumps(["Automated ingestion from 6+ source systems", "Zero-downtime deployments"]),
        "connections": json.dumps([{"target_layer": "investment_engine", "label": "stores"}]),
        "icon_key": "cloud",
        "sort_order": 2,
    },
    {
        "layer": "data_platform",
        "name": "PostgreSQL + pgvector",
        "description": "Production database with vector search for RAG, advanced SQL, and psycopg3 async driver.",
        "tools": json.dumps(["PostgreSQL", "pgvector", "psycopg3"]),
        "outcomes": json.dumps(["83 MCP tool operations", "Sub-second vector similarity search"]),
        "connections": json.dumps([{"target_layer": "ai_layer", "label": "vector store"}]),
        "icon_key": "server",
        "sort_order": 3,
    },
    # AI Layer
    {
        "layer": "ai_layer",
        "name": "LLM Gateway",
        "description": "Multi-model AI gateway routing between Claude, GPT-4, and specialized models with intent classification and prompt policy.",
        "tools": json.dumps(["Claude API", "OpenAI API", "FastAPI", "SSE Streaming"]),
        "outcomes": json.dumps(["Dynamic model selection per query type", "Real-time streaming responses"]),
        "connections": json.dumps([{"target_layer": "bi_layer", "label": "generates"}]),
        "icon_key": "brain",
        "sort_order": 4,
    },
    {
        "layer": "ai_layer",
        "name": "RAG Pipeline",
        "description": "Retrieval-augmented generation with pgvector embeddings, hybrid semantic/keyword search, and domain-scoped retrieval.",
        "tools": json.dumps(["pgvector", "OpenAI Embeddings", "Hybrid Retrieval"]),
        "outcomes": json.dumps(["Grounded responses from structured data", "Domain-scoped context windows"]),
        "connections": json.dumps([{"target_layer": "governance", "label": "audit trail"}]),
        "icon_key": "search",
        "sort_order": 5,
    },
    {
        "layer": "ai_layer",
        "name": "MCP Tool Framework",
        "description": "83 model-context-protocol tools with lane-based access control, audit policy, and structured output schemas.",
        "tools": json.dumps(["MCP Protocol", "Pydantic Schemas", "Lane Access Control"]),
        "outcomes": json.dumps(["83 production tools", "Full audit trail on every invocation"]),
        "connections": json.dumps([{"target_layer": "governance", "label": "policy enforcement"}]),
        "icon_key": "tool",
        "sort_order": 6,
    },
    # Investment Engine
    {
        "layer": "investment_engine",
        "name": "Waterfall Distribution Engine",
        "description": "Python-based waterfall calculation engine replacing Excel models for LP/GP fund distributions and scenario analysis.",
        "tools": json.dumps(["Python", "SQL", "Scenario Analysis"]),
        "outcomes": json.dumps(["~100x performance improvement", "Near-instant fund distribution scenarios"]),
        "connections": json.dumps([{"target_layer": "bi_layer", "label": "outputs"}]),
        "icon_key": "calculator",
        "sort_order": 7,
    },
    {
        "layer": "investment_engine",
        "name": "Fund Portfolio Analytics",
        "description": "Real-time fund performance tracking with IRR/TVPI/DPI calculations, LP communications, and DDQ automation.",
        "tools": json.dumps(["Python", "SQL", "Power BI", "DAX"]),
        "outcomes": json.dumps(["50% DDQ response time reduction", "$4B+ AUM coverage"]),
        "connections": json.dumps([{"target_layer": "bi_layer", "label": "metrics"}]),
        "icon_key": "chart",
        "sort_order": 8,
    },
    {
        "layer": "investment_engine",
        "name": "Deal Pipeline Intelligence",
        "description": "Geographic deal radar with tract-level analysis, acquisition scoring, and pipeline workflow automation.",
        "tools": json.dumps(["PostGIS", "Leaflet", "Python", "SQL"]),
        "outcomes": json.dumps(["13 geographic analysis layers", "Automated pipeline workflows"]),
        "connections": json.dumps([{"target_layer": "bi_layer", "label": "visualizes"}]),
        "icon_key": "map",
        "sort_order": 9,
    },
    # BI Layer
    {
        "layer": "bi_layer",
        "name": "Power BI Semantic Layer",
        "description": "Governed semantic models in Tabular Editor with DAX calculations, self-service analytics, and automated data refreshes.",
        "tools": json.dumps(["Power BI", "Tabular Editor", "DAX", "XMLA"]),
        "outcomes": json.dumps(["50% reduction in ad-hoc reporting requests", "Self-service analytics for 6 business verticals"]),
        "connections": json.dumps([{"target_layer": "governance", "label": "governed by"}]),
        "icon_key": "bar-chart",
        "sort_order": 10,
    },
    {
        "layer": "bi_layer",
        "name": "AI Dashboard Composer",
        "description": "Natural-language dashboard generation: user describes a report, system composes widget specs and renders interactive dashboards.",
        "tools": json.dumps(["Recharts", "React", "Intent Classification", "SSE"]),
        "outcomes": json.dumps(["7-widget dashboards generated in <2 seconds", "Natural language to dashboard"]),
        "connections": json.dumps([]),
        "icon_key": "layout",
        "sort_order": 11,
    },
    # Governance Layer
    {
        "layer": "governance",
        "name": "Data Governance Framework",
        "description": "Automated SQL-driven data governance with reconciliation checks, lineage tracking, and quality monitoring.",
        "tools": json.dumps(["SQL", "Unity Catalog", "dbt", "Custom Validators"]),
        "outcomes": json.dumps(["75% reduction in manual reconciliation", "Automated data quality monitoring"]),
        "connections": json.dumps([]),
        "icon_key": "shield",
        "sort_order": 12,
    },
    {
        "layer": "governance",
        "name": "Audit & Access Control",
        "description": "Lane-based access control for MCP tools, full audit trails, and environment-scoped permissions.",
        "tools": json.dumps(["MCP Audit Policy", "Environment Scoping", "RBAC"]),
        "outcomes": json.dumps(["Every AI tool invocation logged", "Environment-isolated data access"]),
        "connections": json.dumps([]),
        "icon_key": "lock",
        "sort_order": 13,
    },
]

_DEPLOYMENTS = [
    {
        "sort_order": 1,
        "deployment_name": "JPMC BI Service Line Deployment",
        "system_type": "bi_service_line",
        "problem": "No dedicated BI or data engineering capability on the JPMC national account — ad-hoc Excel and manual reporting only.",
        "architecture": "Tableau + SQL Server + PowerPivot + VBA automation",
        "before_state": json.dumps({"reporting": "Manual Excel", "data_accuracy": "Unvalidated", "delivery": "Ad-hoc analyst work"}),
        "after_state": json.dumps({"reporting": "Automated Tableau dashboards", "data_accuracy": "SQL-validated pipelines", "delivery": "Repeatable BI service line"}),
        "status": "completed",
    },
    {
        "sort_order": 2,
        "deployment_name": "Real Estate Data Automation Platform",
        "system_type": "data_warehouse",
        "problem": "160+ hours/month of manual data entry from partner accounting systems across 500+ properties.",
        "architecture": "Azure Logic Apps + PySpark + Power BI + VBA pipelines",
        "before_state": json.dumps({"manual_hours": "160+ hrs/month", "error_rate": "High manual errors", "pipeline_coverage": "None automated"}),
        "after_state": json.dumps({"manual_hours": "Near zero", "error_rate": "95% error reduction", "pipeline_coverage": "Full automation"}),
        "status": "completed",
    },
    {
        "sort_order": 3,
        "deployment_name": "REPE Investment Data Warehouse",
        "system_type": "data_warehouse",
        "problem": "No centralized data warehouse across DealCloud, MRI, Yardi, and Excel — fragmented reporting for a $4B+ AUM firm.",
        "architecture": "Databricks + Azure Data Lake + PySpark + Power BI semantic layer",
        "before_state": json.dumps({"ddq_response": "2+ weeks", "reporting_cycle": "Manual, delayed 10+ days", "reconciliation": "Fully manual", "data_sources": "Siloed across 6+ systems"}),
        "after_state": json.dumps({"ddq_response": "1 week (-50%)", "reporting_cycle": "Accelerated 10 days", "reconciliation": "75% automated", "data_sources": "Unified warehouse"}),
        "status": "completed",
    },
    {
        "sort_order": 4,
        "deployment_name": "PDS AI Analytics Platform",
        "system_type": "ai_platform",
        "problem": "Analyst-dependent reporting workflows across 10+ client accounts with no standardized methodologies.",
        "architecture": "Databricks + Delta Lake + Unity Catalog + OpenAI + LangChain",
        "before_state": json.dumps({"methodology": "Per-analyst, inconsistent", "reporting": "Manual build per client", "ai_capability": "None"}),
        "after_state": json.dumps({"methodology": "Standardized across 10+ accounts", "reporting": "Automated pipelines", "ai_capability": "Conversational AI wrappers"}),
        "status": "active",
    },
    {
        "sort_order": 5,
        "deployment_name": "Winston AI Execution Platform",
        "system_type": "full_stack_platform",
        "problem": "No AI execution environment purpose-built for REPE investment management workflows.",
        "architecture": "Next.js 14 + FastAPI + PostgreSQL + Claude/OpenAI + MCP + SSE",
        "before_state": json.dumps({"ai_tools": "None purpose-built", "demo_environments": "None", "domain_coverage": "Generic tools only"}),
        "after_state": json.dumps({"ai_tools": "83 MCP tools", "demo_environments": "33 live environments", "domain_coverage": "Full REPE vertical"}),
        "status": "active",
    },
]


def seed_demo_workspace(*, env_id: UUID, business_id: UUID, actor: str = "system") -> dict:
    """Idempotent seed of Paul Malmquist's resume data."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT role_id FROM resume_roles WHERE env_id = %s::uuid AND business_id = %s::uuid LIMIT 1",
            (str(env_id), str(business_id)),
        )
        roles_already_seeded = bool(cur.fetchone())

    role_ids = []
    role_ids_by_sort: dict[int, str] = {}
    with get_cursor() as cur:
        if not roles_already_seeded:
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
                role_id = str(cur.fetchone()["role_id"])
                role_ids.append(role_id)
                role_ids_by_sort[r["sort_order"]] = role_id

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
        else:
            cur.execute(
                """
                SELECT role_id, sort_order
                FROM resume_roles
                WHERE env_id = %s::uuid AND business_id = %s::uuid
                ORDER BY sort_order
                """,
                (str(env_id), str(business_id)),
            )
            for row in cur.fetchall():
                role_id = str(row["role_id"])
                role_ids.append(role_id)
                role_ids_by_sort[int(row["sort_order"])] = role_id

    # Seed system components only when the extended resume tables exist.
    if _table_exists("resume_system_components") and not roles_already_seeded:
        with get_cursor() as cur:
            for sc in _SYSTEM_COMPONENTS:
                cur.execute(
                    """
                    INSERT INTO resume_system_components
                    (env_id, business_id, layer, name, description, tools, outcomes, connections, icon_key, sort_order)
                    VALUES (%s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                    """,
                    (
                        str(env_id), str(business_id),
                        sc["layer"], sc["name"], sc["description"],
                        sc["tools"], sc["outcomes"], sc["connections"],
                        sc["icon_key"], sc["sort_order"],
                    ),
                )

    # Seed deployments (link to role_ids by sort_order) only when the table exists.
    if _table_exists("resume_deployments") and not roles_already_seeded:
        with get_cursor() as cur:
            for dep in _DEPLOYMENTS:
                # Match deployment to role by sort_order index
                dep_role_id = role_ids_by_sort.get(dep["sort_order"])
                cur.execute(
                    """
                    INSERT INTO resume_deployments
                    (env_id, business_id, role_id, deployment_name, system_type,
                     problem, architecture, before_state, after_state, status, sort_order)
                    VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
                    """,
                    (
                        str(env_id), str(business_id), dep_role_id,
                        dep["deployment_name"], dep["system_type"],
                        dep["problem"], dep["architecture"],
                        dep["before_state"], dep["after_state"],
                        dep["status"], dep["sort_order"],
                    ),
                )

    if _table_exists("resume_career_phases"):
        with get_cursor() as cur:
            for phase in _CAREER_PHASES:
                cur.execute(
                    """
                    INSERT INTO resume_career_phases
                    (phase_id, env_id, business_id, company, phase_name, start_date, end_date, description, band_color, overlay_only, display_order)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (phase_id) DO NOTHING
                    """,
                    (
                        phase["phase_id"],
                        str(env_id),
                        str(business_id),
                        phase["company"],
                        phase["phase_name"],
                        phase["start_date"],
                        phase["end_date"],
                        phase["description"],
                        phase["band_color"],
                        phase["overlay_only"],
                        phase["display_order"],
                    ),
                )

    if _table_exists("resume_capability_layers"):
        with get_cursor() as cur:
            for layer in _CAPABILITY_LAYERS:
                cur.execute(
                    """
                    INSERT INTO resume_capability_layers
                    (layer_id, env_id, business_id, name, color, description, sort_order, is_visible)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s)
                    ON CONFLICT (layer_id) DO NOTHING
                    """,
                    (
                        layer["layer_id"],
                        str(env_id),
                        str(business_id),
                        layer["name"],
                        layer["color"],
                        layer["description"],
                        layer["sort_order"],
                        layer["is_visible"],
                    ),
                )

    if _table_exists("resume_delivery_initiatives"):
        with get_cursor() as cur:
            for initiative in _DELIVERY_INITIATIVES:
                cur.execute(
                    """
                    INSERT INTO resume_delivery_initiatives
                    (initiative_id, env_id, business_id, phase_id, role_id, title, summary, team_context, business_challenge,
                     measurable_outcome, stakeholder_group, scale, architecture, start_date, end_date, category, impact_area,
                     impact_tag, importance, capability_tags, technologies, linked_modules, linked_architecture_node_ids,
                     linked_bi_entity_ids, linked_model_preset, metrics_json)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s::jsonb)
                    ON CONFLICT (initiative_id) DO NOTHING
                    """,
                    (
                        initiative["initiative_id"],
                        str(env_id),
                        str(business_id),
                        initiative["phase_id"],
                        role_ids_by_sort.get(initiative["role_sort_order"]),
                        initiative["title"],
                        initiative["summary"],
                        initiative["team_context"],
                        initiative["business_challenge"],
                        initiative["measurable_outcome"],
                        initiative["stakeholder_group"],
                        initiative["scale"],
                        initiative["architecture"],
                        initiative["start_date"],
                        initiative["end_date"],
                        initiative["category"],
                        initiative["impact_area"],
                        initiative["impact_tag"],
                        initiative["importance"],
                        json.dumps(initiative["capability_tags"]),
                        json.dumps(initiative["technologies"]),
                        json.dumps(initiative["linked_modules"]),
                        json.dumps(initiative["linked_architecture_node_ids"]),
                        json.dumps(initiative["linked_bi_entity_ids"]),
                        initiative["linked_model_preset"],
                        json.dumps(initiative["metrics_json"]),
                    ),
                )

    if _table_exists("resume_career_milestones"):
        with get_cursor() as cur:
            for milestone in _CAREER_MILESTONES:
                cur.execute(
                    """
                    INSERT INTO resume_career_milestones
                    (milestone_id, env_id, business_id, phase_id, title, date, type, summary, importance, play_order,
                     capability_tags, linked_modules, linked_architecture_node_ids, linked_bi_entity_ids, linked_model_preset,
                     metrics_json, artifact_refs, snapshot_spec)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb,
                            %s, %s::jsonb, %s::jsonb, %s::jsonb)
                    ON CONFLICT (milestone_id) DO NOTHING
                    """,
                    (
                        milestone["milestone_id"],
                        str(env_id),
                        str(business_id),
                        milestone["phase_id"],
                        milestone["title"],
                        milestone["date"],
                        milestone["type"],
                        milestone["summary"],
                        milestone["importance"],
                        milestone["play_order"],
                        json.dumps(milestone["capability_tags"]),
                        json.dumps(milestone["linked_modules"]),
                        json.dumps(milestone["linked_architecture_node_ids"]),
                        json.dumps(milestone["linked_bi_entity_ids"]),
                        milestone["linked_model_preset"],
                        json.dumps(milestone["metrics_json"]),
                        json.dumps(milestone["artifact_refs"]),
                        json.dumps(milestone["snapshot_spec"]),
                    ),
                )

    if _table_exists("resume_accomplishment_cards"):
        with get_cursor() as cur:
            for card in _ACCOMPLISHMENT_CARDS:
                cur.execute(
                    """
                    INSERT INTO resume_accomplishment_cards
                    (card_id, env_id, business_id, phase_id, milestone_id, metric_key, title, card_type, company, date_start,
                     date_end, capability_tags, short_narrative, context, action, impact, stakeholders, artifact_refs,
                     metrics_json, snapshot_spec, sort_order)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s,
                            %s::jsonb, %s::jsonb, %s::jsonb, %s)
                    ON CONFLICT (card_id) DO NOTHING
                    """,
                    (
                        card["card_id"],
                        str(env_id),
                        str(business_id),
                        card["phase_id"],
                        card["milestone_id"],
                        card["metric_key"],
                        card["title"],
                        card["card_type"],
                        card["company"],
                        card["date_start"],
                        card["date_end"],
                        json.dumps(card["capability_tags"]),
                        card["short_narrative"],
                        card["context"],
                        card["action"],
                        card["impact"],
                        card["stakeholders"],
                        json.dumps(card["artifact_refs"]),
                        json.dumps(card["metrics_json"]),
                        json.dumps(card["snapshot_spec"]),
                        card["sort_order"],
                    ),
                )

    if _table_exists("resume_metric_anchors"):
        with get_cursor() as cur:
            for anchor in _METRIC_ANCHORS:
                cur.execute(
                    """
                    INSERT INTO resume_metric_anchors
                    (anchor_id, env_id, business_id, hero_metric_key, title, default_view, linked_phase_ids,
                     linked_milestone_ids, linked_capability_layer_ids, narrative_hint, sort_order)
                    VALUES (%s, %s::uuid, %s::uuid, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                    ON CONFLICT (anchor_id) DO NOTHING
                    """,
                    (
                        anchor["anchor_id"],
                        str(env_id),
                        str(business_id),
                        anchor["hero_metric_key"],
                        anchor["title"],
                        anchor["default_view"],
                        json.dumps(anchor["linked_phase_ids"]),
                        json.dumps(anchor["linked_milestone_ids"]),
                        json.dumps(anchor["linked_capability_layer_ids"]),
                        anchor["narrative_hint"],
                        anchor["sort_order"],
                    ),
                )

    # Seed RAG documents (best-effort — won't fail the seed if RAG is unavailable)
    rag_chunks = 0
    try:
        from app.services.resume_rag_seed import seed_resume_rag
        rag_chunks = seed_resume_rag(env_id=env_id, business_id=business_id)
    except Exception:
        pass

    return {"seeded": not roles_already_seeded, "role_ids": role_ids, "rag_chunks": rag_chunks}
