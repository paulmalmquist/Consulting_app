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


# ── New queries (system components, deployments, stats) ──────────

def list_system_components(*, env_id: UUID, business_id: UUID) -> list[dict]:
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


def list_deployments(*, env_id: UUID, business_id: UUID) -> list[dict]:
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

    # Seed system components
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

    # Seed deployments (link to role_ids by sort_order)
    with get_cursor() as cur:
        for dep in _DEPLOYMENTS:
            # Match deployment to role by sort_order index
            dep_role_id = role_ids[dep["sort_order"] - 1] if dep["sort_order"] <= len(role_ids) else None
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

    # Seed RAG documents (best-effort — won't fail the seed if RAG is unavailable)
    rag_chunks = 0
    try:
        from app.services.resume_rag_seed import seed_resume_rag
        rag_chunks = seed_resume_rag(env_id=env_id, business_id=business_id)
    except Exception:
        pass

    return {"seeded": True, "role_ids": role_ids, "rag_chunks": rag_chunks}
