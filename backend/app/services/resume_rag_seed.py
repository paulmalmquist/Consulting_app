"""Seed narrative resume documents into the RAG pipeline for the Visual Resume environment."""
from __future__ import annotations

import uuid
from uuid import UUID

_CAREER_OVERVIEW = """
PAUL MALMQUIST — CAREER OVERVIEW

Paul Malmquist is a data and AI engineering leader with 11+ years designing enterprise-scale data platforms for investment management and financial services organizations. He is currently the PDS Business Intelligence Lead for JLL's Project & Development Services (PDS) Americas division, and the Founder & CEO of Novendor.

Paul built the data architecture behind real estate investment decision-making at Kayne Anderson Real Estate ($4B+ AUM) — including the REPE data warehouse, ETL pipelines, and waterfall distribution engines. He bridges investment domain expertise with modern data engineering: Databricks Lakehouse architecture, Azure, Python, PySpark, and LLM-integrated analytics.

He holds a B.A. from Brown University and is based in Lake Worth, FL.

Career progression:
- Aug 2014 – Feb 2018: Senior Analyst / Business Analyst — PMO at JLL (JPMC Account), Boca Raton, FL
- Feb 2018 – Jan 2021: Senior Associate, Data Engineering & BI at Kayne Anderson Real Estate, Boca Raton, FL
- Jan 2021 – Mar 2025: Vice President, Data Platform Engineering & FP&A at Kayne Anderson Real Estate, Boca Raton, FL
- Jan 2024 – Present: Founder & CEO at Novendor (side project), Lake Worth, FL
- Apr 2025 – Present: PDS Business Intelligence Lead — PDS Americas at JLL, Remote
"""

_KAYNE_ANDERSON_DETAIL = """
KAYNE ANDERSON REAL ESTATE — DETAILED EXPERIENCE

Paul spent nearly 7 years at Kayne Anderson Real Estate, a $4B+ AUM real estate private equity firm in Boca Raton, FL, progressing from Senior Associate to Vice President.

As VP, Data Platform Engineering & FP&A (2021–2025):
- Architected and delivered a centralized REPE Investment Data Warehouse on Databricks and Azure
- Integrated DealCloud, MRI, Yardi, Excel workflows, and Azure Logic Apps across 500+ properties
- Reduced investor-relations DDQ response time by 50%% and accelerated quarterly reporting by 10 days
- Designed a governed semantic layer unifying data across six business verticals in Power BI (Tabular Editor) — achieved 50%% reduction in ad hoc reporting requests
- Built a Python-based waterfall distribution engine replacing Excel-based models — reduced run times from 5 minutes to near-instant
- Designed automated SQL-driven data governance framework — cut manual reconciliation by 75%%
- Led offshore data engineering team across multiple critical ETL and BI delivery cycles

As Senior Associate (2018–2021):
- Automated data ingestion from partner accounting systems for 500+ properties using Azure Logic Apps and PySpark — replaced ~160 hours/month of manual entry
- Implemented VBA-driven acquisition pipeline workflows capturing 40+ acquisitions/week — eliminated 80 hours/month of manual input, reduced errors by 95%%
- Developed high-performance Power BI dashboards for executives and asset management teams

Technologies: Databricks, Azure Data Lake, PySpark, Python, SQL, Power BI, Tabular Editor, DAX, DealCloud, MRI, Yardi, VBA, Azure Logic Apps
"""

_JLL_DETAIL = """
JLL (JONES LANG LASALLE) — DETAILED EXPERIENCE

Paul has worked at JLL in two separate stints spanning over 7 years total.

Current Role — PDS Business Intelligence Lead, PDS Americas (Apr 2025 – Present):
- Designed and delivered an AI-enabled analytics platform for JLL's Project & Development Services division
- Integrated Databricks, Delta Lake, Databricks Genie, and GenAI-based conversational wrappers
- Enabled natural language querying of enterprise project and financial data across a national client portfolio
- Established a governed Medallion architecture (Bronze/Silver/Gold) in Databricks
- Built and led a high-leverage data engineering team
- Standardized core business methodologies across 10+ client accounts

Earlier Role — Senior Analyst / Business Analyst — PMO, JPMC Account (Aug 2014 – Feb 2018):
- Built JLL's first dedicated BI and data engineering service line for the JPMC national account
- Defined standards for data ingestion, governance, and visualization
- Engineered Tableau dashboards with optimized data extracts for predictive analysis
- Built SQL stored procedures for automated data validations
- Recognized with Best Innovation of the Quarter for interactive PowerPivot dashboards

Technologies: Databricks, Delta Lake, Unity Catalog, GenAI API, LangChain, Python, PySpark, SQL, Azure, Tableau, PowerPivot
"""

_NOVENDOR_DETAIL = """
NOVENDOR / WINSTON AI PLATFORM — DETAILED EXPERIENCE

Paul founded Novendor in 2024 to build AI execution environments for investment management firms. He created Winston, a vertical AI platform for REPE firms.

Winston Platform Capabilities:
- 83 MCP tools covering the full REPE domain
- SSE streaming chat workspace with structured response blocks (charts, tables, KPIs)
- Fund portfolio management with full waterfall engine
- Deal radar and pipeline intelligence
- LP communications and reporting
- Document ingestion and RAG-based search
- AI-driven dashboard generation from natural language

Architecture:
- Multi-runtime monorepo: Next.js 14 (frontend), FastAPI (backend), Demo Lab (repo-c)
- PostgreSQL with pgvector for semantic search
- Claude API and GenAI API for model routing
- Lane-based tool access control and audit policy
- Live demo environments at paulmalmquist.com

Technologies: Python, FastAPI, TypeScript, Next.js 14, React, PostgreSQL, Claude API, GenAI API, SSE, MCP, pgvector, psycopg3, Pydantic
"""

_TECHNICAL_PHILOSOPHY = """
PAUL MALMQUIST — TECHNICAL PHILOSOPHY & APPROACH

Core belief: Data platforms should eliminate manual work, not just visualize it. Every hour an analyst spends copying data between systems is an hour not spent on insight.

Approach to data engineering:
- Start with the business question, not the technology. Build what matters.
- Medallion architecture (Bronze/Silver/Gold) for governed, reproducible data pipelines
- Semantic layers that business users can self-serve without SQL knowledge
- Automated validation and governance — don't trust humans to catch data errors manually
- ETL that replaces manual processes should be measured by hours saved, not rows moved

Approach to AI/ML engineering:
- Tools over chat. 83 MCP tools are more useful than a chatbot that guesses.
- Structured responses (charts, tables, KPIs) over walls of text
- Domain-specific RAG with citation chains — no hallucination without source
- Lane-based access control: the AI should only see tools relevant to its current task
- SSE streaming for real-time feedback — users shouldn't wait for a spinner

Leadership style:
- Lead by building. Code contributions alongside team management.
- Define clear delivery standards and review processes for offshore teams
- QA-first: validation scripts run before stakeholders see the data
- Bridge the gap between technical and business stakeholders with visualization and clear metrics
"""


_SYSTEM_ARCHITECTURE = """
PAUL MALMQUIST — SYSTEM ARCHITECTURE OVERVIEW

Paul's systems follow a 5-layer architecture pattern, refined across multiple enterprise deployments:

1. DATA PLATFORM LAYER
   - Databricks Lakehouse with Delta Lake, Unity Catalog, and Medallion architecture
   - Azure Data Lake (ADLS Gen2) with Logic Apps orchestration
   - PostgreSQL + pgvector for production AI workloads
   - Key outcome: 500+ properties integrated, 75% reconciliation reduction

2. AI LAYER
   - Multi-model LLM gateway routing between Claude and GPT-4
   - RAG pipeline with pgvector embeddings and hybrid retrieval
   - 83 MCP tools with lane-based access control and full audit trail
   - Key outcome: Domain-specific AI tools, not generic chatbots

3. INVESTMENT ENGINE
   - Python waterfall distribution engine (~100x faster than Excel)
   - Fund portfolio analytics with IRR/TVPI/DPI calculations
   - Deal pipeline intelligence with geographic tract-level analysis
   - Key outcome: 50% DDQ response time reduction, $4B+ AUM coverage

4. BI LAYER
   - Power BI semantic layer with Tabular Editor and DAX
   - AI dashboard composer: natural language to interactive dashboards
   - Recharts-based React visualizations for web delivery
   - Key outcome: 50% reduction in ad-hoc reporting requests

5. GOVERNANCE LAYER
   - Automated SQL-driven data governance framework
   - Lane-based access control for AI tool invocations
   - Full audit trail on every MCP tool call
   - Key outcome: Environment-isolated data access, compliance-ready
"""

_DEPLOYMENT_HISTORY = """
PAUL MALMQUIST — DEPLOYMENT HISTORY

Each role in Paul's career represents a system deployment with measurable before/after transformation:

DEPLOYMENT 1: JPMC BI Service Line (JLL, 2014-2018)
- Problem: No dedicated BI capability on the national account
- Architecture: Tableau + SQL Server + PowerPivot + VBA
- Before: Manual Excel, unvalidated data, ad-hoc analyst work
- After: Automated dashboards, SQL-validated pipelines, repeatable service line
- Recognition: Best Innovation of the Quarter

DEPLOYMENT 2: Real Estate Data Automation (Kayne Anderson, 2018-2021)
- Problem: 160+ hours/month manual data entry across 500+ properties
- Architecture: Azure Logic Apps + PySpark + Power BI + VBA pipelines
- Before: 160+ hrs/month manual, high errors, no automation
- After: Near-zero manual hours, 95% error reduction, full automation

DEPLOYMENT 3: REPE Investment Data Warehouse (Kayne Anderson, 2021-2025)
- Problem: Fragmented reporting across 6+ systems for $4B+ AUM firm
- Architecture: Databricks + Azure Data Lake + PySpark + Power BI semantic layer
- Before: 2+ week DDQ response, 10+ day delayed reporting, fully manual reconciliation
- After: 1-week DDQ (-50%), 10-day reporting acceleration, 75% automated reconciliation

DEPLOYMENT 4: PDS AI Analytics Platform (JLL, 2025-Present)
- Problem: Analyst-dependent workflows across 10+ client accounts
- Architecture: Databricks + Delta Lake + Unity Catalog + GenAI + LangChain
- Before: Per-analyst methodology, manual reporting per client, no AI
- After: Standardized across 10+ accounts, automated pipelines, conversational AI

DEPLOYMENT 5: Winston AI Execution Platform (Novendor, 2024-Present)
- Problem: No purpose-built AI environment for REPE workflows
- Architecture: Next.js 14 + FastAPI + PostgreSQL + Claude/GenAI + MCP + SSE
- Before: No purpose-built tools, no demo environments, generic AI only
- After: 83 MCP tools, 33 live demo environments, full REPE vertical coverage
"""

_PERSONAL_BACKGROUND = """\
Paul Malmquist — Personal Background, Athletics, and Music

Education:
- B.A. from Brown University. Recruited to run the 400m, ran varsity track.
- Founding member of Soul Cypher, a student group at Brown focused on music production.
- Chaminade High School (Mineola, NY): varsity baseball (team MVP, captain senior year), varsity track (600-yard champion at Stanner Games 2001).
- Connie Mack league MVP at age 16 as a leadoff hitter and stolen base threat who also pitched — threw a no-hitter.

Post-College Athletics:
- Played baseball in Australia for the Brisbane Bulldogs in a PRO-AM league after graduating from Brown.
- Traveled with a friend who was teaching baseball to kids around the world and playing in local leagues.

Music Production:
- Professional music producer with placements on ESPN, MTV, BET, and Fashion One.
- Founding member of Soul Cypher at Brown University.
- Music production was a serious professional pursuit, not a hobby — Paul built a real catalog before transitioning fully into data and technology.
- The creative discipline carries over: Paul approaches system design with the same attention to composition, structure, and polish that music production demands.
"""

RESUME_RAG_DOCUMENTS = [
    {
        "name": "Paul Malmquist — Career Overview",
        "text": _CAREER_OVERVIEW,
        "entity_type": "resume",
        "content_type_hint": "career_overview",
    },
    {
        "name": "Kayne Anderson Real Estate — Detailed Experience",
        "text": _KAYNE_ANDERSON_DETAIL,
        "entity_type": "resume",
        "content_type_hint": "role_detail",
    },
    {
        "name": "JLL — Detailed Experience",
        "text": _JLL_DETAIL,
        "entity_type": "resume",
        "content_type_hint": "role_detail",
    },
    {
        "name": "Novendor / Winston AI Platform — Detailed Experience",
        "text": _NOVENDOR_DETAIL,
        "entity_type": "resume",
        "content_type_hint": "project_detail",
    },
    {
        "name": "Technical Philosophy & Approach",
        "text": _TECHNICAL_PHILOSOPHY,
        "entity_type": "resume",
        "content_type_hint": "philosophy",
    },
    {
        "name": "System Architecture Overview",
        "text": _SYSTEM_ARCHITECTURE,
        "entity_type": "resume",
        "content_type_hint": "architecture",
    },
    {
        "name": "Deployment History",
        "text": _DEPLOYMENT_HISTORY,
        "entity_type": "resume",
        "content_type_hint": "deployment_history",
    },
    {
        "name": "Paul Malmquist — Personal Background, Athletics & Music",
        "text": _PERSONAL_BACKGROUND,
        "entity_type": "resume",
        "content_type_hint": "personal",
    },
]


def seed_resume_rag(*, env_id: UUID, business_id: UUID) -> int:
    """Index resume narrative documents into the RAG pipeline. Returns chunk count."""
    try:
        from app.services.rag_indexer import index_document
    except Exception:
        return 0

    total_chunks = 0
    for doc in RESUME_RAG_DOCUMENTS:
        doc_id = uuid.uuid4()
        version_id = uuid.uuid4()
        try:
            chunk_count = index_document(
                document_id=doc_id,
                version_id=version_id,
                business_id=business_id,
                text=doc["text"],
                env_id=env_id,
                entity_type=doc["entity_type"],
                source_filename=doc["name"],
                content_type_hint=doc["content_type_hint"],
            )
            total_chunks += chunk_count
        except Exception:
            pass
    return total_chunks
