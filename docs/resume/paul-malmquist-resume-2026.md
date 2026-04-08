# PAUL MALMQUIST

**Lake Worth, FL** | paul@novendor.com | paulmalmquist.com | linkedin.com/in/paulmalmquist

---

## SUMMARY

AI platform architect and investment data engineering leader with 11+ years building production systems at the intersection of data infrastructure, LLM orchestration, and real estate investment management. Designed and shipped three enterprise-scale platforms — a vertical AI execution environment with 83 production tools, a $4B+ AUM investment data warehouse, and an AI-enabled analytics platform serving a national client portfolio. Deep domain fluency in REPE fund operations, waterfall distributions, and LP reporting. Led cross-functional and offshore engineering teams. Architecture-first builder: RAG pipelines, API-driven tool orchestration, streaming AI interfaces, governed data lakehouses.

---

## CORE SYSTEMS

**1. Winston AI Execution Platform** (Novendor, 2024-Present)
Full-stack vertical AI platform for REPE firms — not a chatbot wrapper, a production tool orchestration layer.

**2. Enterprise Investment Data Platform** (Kayne Anderson, 2018-2025)
Centralized data warehouse, semantic layer, and waterfall distribution engine for a $4B+ AUM REPE firm.

**3. AI-Enabled Analytics Platform** (JLL PDS Americas, 2025-Present)
AI analytics layer over enterprise project and financial data for a national real estate services division.

---

## TECHNICAL ARCHITECTURE

```
Sources                  Lakehouse                  AI Layer                    Interface
---------               ----------                 ----------                  ----------
DealCloud    -->   Bronze (raw ingestion)    -->   LLM Router (Claude/OpenAI)  -->  SSE Streaming Chat
MRI/Yardi    -->   Silver (cleaned/typed)    -->   RAG Pipeline (pgvector)     -->  Structured Blocks
Excel/VBA    -->   Gold (governed/semantic)  -->   83 MCP Tools (lane-scoped)  -->  Dashboard Composer
Azure Logic  -->   Delta Lake / Unity Cat.   -->   Intent Classifier           -->  API-first UI
Partner APIs -->   Semantic Layer (PBI)      -->   Citation Chain              -->  Natural Language Query

Infra: FastAPI + Next.js 14 + PostgreSQL | Databricks + Azure Data Lake | Railway + Vercel
Auth: Lane-based tool access control | Audit policy per MCP tool | Scope resolution per environment
```

---

## EXPERIENCE

### PDS Business Intelligence Lead — PDS Americas
**JLL (Jones Lang LaSalle)** | Apr 2025 - Present | Remote

PDS Americas had no unified data platform. Analysts manually assembled reports from fragmented project systems across 10+ client accounts. No programmatic access to financial or operational data.

- **Designed and delivered an AI-enabled analytics platform** integrating Databricks, Delta Lake, and OpenAI-based query interfaces — enabled natural language querying of enterprise project and financial data across a national client portfolio
- **Architected a governed Medallion lakehouse** (Bronze/Silver/Gold) in Databricks with Unity Catalog — established the first standardized data layer across PDS Americas
- **Standardized core business methodologies** across 10+ client accounts, replacing per-account manual reporting with a unified semantic model
- **Built and led a high-leverage data engineering team** delivering production pipelines, governance frameworks, and AI integration on an aggressive timeline

*Stack: Databricks, Delta Lake, Unity Catalog, OpenAI API, LangChain, Python, PySpark, SQL, Azure*

---

### Founder & CEO
**Novendor** | Jan 2024 - Present | Lake Worth, FL

REPE firms run on Excel, email, and fragmented SaaS tools. No platform connects fund data, LP reporting, deal pipeline, and waterfall modeling under a single AI-native interface.

- **Architected and built Winston from zero** — a vertical AI execution platform with 83 MCP tools covering the full REPE domain: fund portfolio management, waterfall distributions, deal radar, LP communications, document ingestion, and AI-driven dashboard generation
- **Designed the AI orchestration layer**: intent classification with fast-path routing, RAG pipeline with pgvector and citation chains, model dispatch between Claude and OpenAI based on task type, lane-based tool access control with audit policy
- **Built the SSE streaming chat workspace** with structured response blocks (charts, tables, KPIs, comparison matrices) — AI outputs are interactive data objects, not text walls
- **Engineered the multi-runtime architecture**: Next.js 14 App Router (frontend), FastAPI with psycopg3 (backend), Demo Lab environment system (repo-c) — all in a monorepo with shared type contracts
- **Developed AI-driven dashboard composition**: natural language input ("build me a monthly operating report") triggers section-based layout engine that generates 7-widget dashboard specs in ~1300ms via SSE stream
- **Built the waterfall distribution engine** as a Python-native calculation layer replacing Excel-based models — LP/GP allocations, promote waterfalls, catch-up provisions computed programmatically with full audit trail

*Stack: Python, FastAPI, TypeScript, Next.js 14, React, PostgreSQL, pgvector, Claude API, OpenAI API, SSE, MCP protocol, psycopg3, Pydantic, Railway, Vercel*

---

### Vice President, Data Platform Engineering & FP&A
**Kayne Anderson Real Estate** ($4B+ AUM) | Jan 2021 - Mar 2025 | Boca Raton, FL

The firm's investment data was scattered across DealCloud, MRI, Yardi, and hundreds of Excel files. Quarterly reporting took weeks. Waterfall distributions ran in fragile spreadsheets. No governed analytics layer existed.

- **Architected and delivered a centralized REPE Investment Data Warehouse** on Databricks and Azure Data Lake — integrated DealCloud, MRI, Yardi, Excel workflows, and Azure Logic Apps across 500+ properties into a single governed platform
- **Designed a semantic layer unifying six business verticals** in Power BI via Tabular Editor — achieved 50% reduction in ad hoc reporting requests by enabling self-service analytics for investment and asset management teams
- **Built a Python-based waterfall distribution engine** replacing Excel-based models — reduced run times from 5 minutes to near-instant, eliminated manual calculation errors, created full audit trail
- **Designed an automated SQL-driven data governance framework** — cut manual reconciliation by 75%, established validation gates that catch data errors before they reach stakeholders
- **Accelerated quarterly LP reporting by 10 days** and reduced DDQ response time by 50% through pipeline automation and governed data access
- **Led an offshore data engineering team** across critical ETL and BI delivery cycles — defined delivery standards, review processes, and QA gates

*Stack: Databricks, Azure Data Lake, PySpark, Python, SQL, Power BI, Tabular Editor, DAX, DealCloud, MRI, Yardi, Azure Logic Apps*

---

### Senior Associate, Data Engineering & BI
**Kayne Anderson Real Estate** | Feb 2018 - Jan 2021 | Boca Raton, FL

Acquisitions data entry was manual. Partner accounting feeds arrived as flat files requiring hours of manual reconciliation. No automated ingestion pipeline existed.

- **Automated data ingestion from partner accounting systems** for 500+ properties using Azure Logic Apps and PySpark — replaced ~160 hours/month of manual entry with governed pipelines
- **Engineered VBA-driven acquisition pipeline workflows** capturing 40+ acquisitions/week — eliminated 80 hours/month of manual input, reduced data entry errors by 95%
- **Developed high-performance Power BI dashboards** for executive and asset management teams — the first programmatic reporting layer the firm had

*Stack: Azure Logic Apps, PySpark, Python, SQL, Power BI, VBA, Excel*

---

### Senior Analyst / Business Analyst — PMO (JPMC Account)
**JLL (Jones Lang LaSalle)** | Aug 2014 - Feb 2018 | Boca Raton, FL

JLL's JPMC national account had no dedicated BI or data engineering capability. Reporting was manual, ad hoc, and inconsistent across regions.

- **Built JLL's first dedicated BI and data engineering service line** for the JPMC national account — defined standards for data ingestion, governance, and visualization from scratch
- **Engineered Tableau dashboards with optimized data extracts** for predictive analysis across the national portfolio
- **Recognized with Best Innovation of the Quarter** for interactive PowerPivot dashboards that replaced static reporting

*Stack: Tableau, SQL, PowerPivot, Excel*

---

## EDUCATION

**Brown University** — B.A.
- Recruited athlete: 400m track & field, varsity
- Founding member of Soul Cypher (music production student group)

**Chaminade High School** — Mineola, NY
- Varsity track: MVP, captain senior year; 600-yard champion, Stanner Games 2001
- Varsity baseball
- Connie Mack summer travel baseball: league MVP at age 16 (leadoff hitter, pitcher — threw a no-hitter)

---

## PERSONAL

**Athletics (Post-College)**
Played baseball for the Brisbane Bulldogs in Australia (PRO-AM league) after graduating from Brown. Traveled with a friend who was teaching baseball to kids around the world and playing in local leagues.

**Music Production**
Professional music producer with placements on ESPN, MTV, BET, and Fashion One. Founding member of Soul Cypher at Brown University. Production was a professional pursuit — Paul built a real catalog before transitioning fully into data and technology.

---

## TECHNICAL DEPTH

| Domain | Specifics |
|---|---|
| **AI/LLM Engineering** | RAG pipelines (pgvector), LLM orchestration (Claude + OpenAI), intent classification, MCP tool protocol, SSE streaming, citation chains, prompt engineering, model routing |
| **Data Platform** | Databricks Lakehouse, Delta Lake, Unity Catalog, Medallion architecture, ETL/ELT, PySpark, semantic layers |
| **Backend** | Python, FastAPI, psycopg3, Pydantic, REST APIs, SSE, async Python |
| **Frontend** | TypeScript, Next.js 14 App Router, React, Recharts, Tailwind CSS |
| **Database** | PostgreSQL, pgvector, SQL optimization, schema design, migrations |
| **Cloud/Infra** | Azure (Data Lake, Logic Apps, DevOps), Railway, Vercel, Docker |
| **Investment Domain** | REPE fund operations, waterfall distributions (LP/GP/promote), TVPI/IRR/DSCR, LP reporting, deal pipeline, DDQ, quarterly reporting, 500+ property portfolios |
| **BI/Analytics** | Power BI, Tabular Editor, DAX, Tableau, governed self-service analytics |
| **Leadership** | Offshore team management, delivery standards, architectural authority, enterprise sales, client advisory |
