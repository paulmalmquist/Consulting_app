from __future__ import annotations

from datetime import date
from typing import Any


TIMELINE_VIEWS = ["career", "delivery", "capability", "impact"]


def build_resume_workspace_payload(
    *,
    summary: dict[str, Any],
    stats: dict[str, Any],
    roles: list[dict[str, Any]],
    projects: list[dict[str, Any]],
    components: list[dict[str, Any]],
    deployments: list[dict[str, Any]],
) -> dict[str, Any]:
    timeline = _build_timeline()
    architecture = _build_architecture(components)
    modeling = _build_modeling()
    bi = _build_bi()
    return {
        "identity": {
            "name": "Paul Malmquist",
            "title": "AI & Data Systems Architect",
            "tagline": "Systems that turn institutional reporting into live decision infrastructure",
            "location": summary.get("location") or "Lake Worth, FL",
            "summary": (
                "Paul builds governed data platforms, financial engines, and AI execution layers "
                "that replace manual reporting with real-time operating systems."
            ),
            "badges": [
                "Databricks + Azure delivery",
                "Power BI semantic models",
                "Waterfall engine modernization",
                "Winston AI platform",
            ],
            "metrics": [
                {"label": "Properties Integrated", "value": "500+", "detail": "Kayne Anderson warehouse + automation programs"},
                {"label": "DDQ Turnaround", "value": "-50%", "detail": "Investor relations response acceleration"},
                {"label": "Reporting Cycle", "value": "-10 days", "detail": "Quarter-close and executive reporting"},
                {"label": "AI Tool Surface", "value": "83 MCP tools", "detail": "Winston domain actions and auditability"},
            ],
        },
        "timeline": timeline,
        "architecture": architecture,
        "modeling": modeling,
        "bi": bi,
        "stories": _build_stories(stats=stats, roles=roles, projects=projects, deployments=deployments),
    }


def generate_resume_assistant_response(
    *,
    workspace: dict[str, Any],
    query: str,
    context: dict[str, Any],
) -> dict[str, Any]:
    q = query.lower().strip()
    active_module = (context.get("active_module") or "timeline").lower()
    selected_timeline = _find_timeline_item(workspace["timeline"], context.get("selected_timeline_id"))
    selected_node = _find_by_id(workspace["architecture"]["nodes"], "node_id", context.get("selected_architecture_node_id"))
    selected_bi = _find_by_id(workspace["bi"]["entities"], "entity_id", context.get("selected_bi_entity_id"))

    if any(token in q for token in ["waterfall", "irr", "equity multiple", "tvpi"]):
        return {
            "blocks": _modeling_blocks(context),
            "suggested_questions": [
                "Explain the LP vs GP split",
                "What input most changes IRR?",
                "How does this connect to Kayne Anderson?",
            ],
        }

    if any(token in q for token in ["top performing", "asset", "portfolio", "noi", "occupancy"]) or active_module == "bi":
        return {
            "blocks": _bi_blocks(selected_bi=selected_bi, context=context),
            "suggested_questions": [
                "Drill into the highest NOI asset",
                "What drove the occupancy trend?",
                "How does this map back to the warehouse?",
            ],
        }

    if any(token in q for token in ["architecture", "system", "rag", "vector", "semantic", "databricks"]) or active_module == "architecture":
        return {
            "blocks": _architecture_blocks(selected_node=selected_node, context=context),
            "suggested_questions": [
                "Show the business impact view",
                "Which nodes map to the Kayne warehouse?",
                "How did this evolve into Winston?",
            ],
        }

    if any(token in q for token in ["timeline", "journey", "career", "progression", "spent"]) or active_module == "timeline":
        return {
            "blocks": _timeline_blocks(selected_timeline=selected_timeline, query=query),
            "suggested_questions": [
                "What changed at the VP stage?",
                "Which build replaced Excel?",
                "How does this timeline connect to the architecture?",
            ],
        }

    return {
        "blocks": [
            _markdown_block(
                "resume-summary",
                "This workspace is organized around Paul’s execution arc: timeline, architecture, modeling, and BI. Ask about the screen you’re on and I’ll answer from that context."
            ),
            _kpi_block(
                "resume-kpis",
                "Current Screen Signals",
                [
                    {"label": "Active Module", "value": context.get("active_module", "timeline")},
                    {"label": "Timeline Focus", "value": context.get("selected_timeline_id") or "None"},
                    {"label": "Architecture Focus", "value": context.get("selected_architecture_node_id") or "None"},
                ],
            ),
        ],
        "suggested_questions": [
            "Explain this build journey",
            "What drives IRR here?",
            "Show me top performing assets",
        ],
    }


def _build_timeline() -> dict[str, Any]:
    roles = [
        {
            "timeline_role_id": "jll-project-coordinator",
            "company": "JLL",
            "title": "Project Coordinator",
            "lane": "JLL",
            "start_date": date(2013, 9, 1),
            "end_date": date(2014, 7, 31),
            "summary": "Operational entry point into project controls, reporting cadence, and stakeholder delivery.",
            "scope": "Built the habits around execution discipline, reporting hygiene, and cross-team coordination.",
            "technologies": ["Excel", "PowerPoint", "Project Controls"],
            "outcomes": ["Foundation in delivery governance", "Built reporting intuition close to operators"],
            "initiatives": [],
            "milestones": [],
        },
        {
            "timeline_role_id": "jll-pmo",
            "company": "JLL",
            "title": "Business Analyst / PMO",
            "lane": "JLL",
            "start_date": date(2014, 8, 1),
            "end_date": date(2015, 12, 31),
            "summary": "Shifted from coordination into operational analysis and repeatable PMO reporting systems.",
            "scope": "Turned manual project reporting into standardized operating rhythm.",
            "technologies": ["Excel", "SQL", "PowerPivot"],
            "outcomes": ["Moved from reporting support to analytical ownership"],
            "initiatives": [],
            "milestones": [],
        },
        {
            "timeline_role_id": "jll-bi-analytics",
            "company": "JLL",
            "title": "Sr. Analyst, BI and Analytics",
            "lane": "JLL",
            "start_date": date(2016, 1, 1),
            "end_date": date(2018, 1, 31),
            "summary": "Built dashboard systems and created JLL’s first dedicated BI delivery motion for the JPMC account.",
            "scope": "From analyst output to service-line architecture.",
            "technologies": ["Tableau", "SQL", "PowerPivot", "VBA"],
            "outcomes": ["First dedicated BI service line", "Interactive dashboard systems at national-account scale"],
            "initiatives": [],
            "milestones": [],
        },
        {
            "timeline_role_id": "kayne-sr-associate",
            "company": "Kayne Anderson",
            "title": "Senior Associate FP&A",
            "lane": "Kayne Anderson",
            "start_date": date(2018, 2, 1),
            "end_date": date(2020, 12, 31),
            "summary": "Moved into real estate private equity operations and replaced manual property data handling with automation.",
            "scope": "Automation first: reduce manual input, increase data quality, scale analyst throughput.",
            "technologies": ["Azure", "PySpark", "Power BI", "VBA", "SQL"],
            "outcomes": ["500+ property integration automation", "95% reduction in manual-entry errors"],
            "initiatives": [],
            "milestones": [],
        },
        {
            "timeline_role_id": "kayne-vp",
            "company": "Kayne Anderson",
            "title": "Vice President FP&A / Lead Data Engineering & BI",
            "lane": "Kayne Anderson",
            "start_date": date(2021, 1, 1),
            "end_date": date(2025, 3, 31),
            "summary": "Architected the governed REPE warehouse, semantic layer, automation framework, and waterfall engine.",
            "scope": "Expanded from automation to institutional data platform ownership.",
            "technologies": ["Databricks", "Azure Data Lake", "PySpark", "Power BI", "Python", "SQL"],
            "outcomes": ["DDQ response time reduced by 50%", "Warehouse unified fragmented operating data"],
            "initiatives": [],
            "milestones": [],
        },
        {
            "timeline_role_id": "jll-director-pds",
            "company": "JLL",
            "title": "Director, BI Lead – PDS Americas",
            "lane": "JLL",
            "start_date": date(2025, 4, 1),
            "end_date": None,
            "summary": "Scaled the playbook into AI analytics, conversational BI, and governed delivery architecture across client accounts.",
            "scope": "From warehouse owner to AI operating-system architect.",
            "technologies": ["Databricks", "Delta Lake", "OpenAI", "Semantic Layer", "Governance"],
            "outcomes": ["10+ client accounts standardized", "Conversational analytics for executive delivery"],
            "initiatives": [],
            "milestones": [],
        },
    ]

    initiatives = [
        _initiative(
            "initiative-tableau-dashboards",
            "jll-bi-analytics",
            "Tableau / PowerPivot dashboard development",
            date(2015, 4, 1),
            date(2017, 2, 1),
            "bi",
            "BI / Semantic Models",
            "decision_support",
            ["Tableau", "SQL", "PowerPivot"],
            "Interactive dashboard delivery",
            ["timeline", "bi", "architecture"],
            ["semantic_models", "bi_dashboards"],
            ["fund-jpmc-ops"],
            None,
            "Built the first wave of interactive reporting systems that translated raw operating data into executive-ready decision support.",
            "Small embedded BI function on a national account.",
            "Reporting was manual, slow, and inconsistent across stakeholders.",
            "Created reusable dashboards and extract patterns that shifted reporting from static exports to live analysis.",
            "Account leadership",
            "National JPMC account",
            "SQL extract layer feeding Tableau and PowerPivot delivery assets.",
        ),
        _initiative(
            "initiative-jpmc-service-line",
            "jll-bi-analytics",
            "JPMC BI service line buildout",
            date(2016, 3, 1),
            date(2018, 1, 31),
            "bi",
            "BI / Semantic Models",
            "reporting_acceleration",
            ["Tableau", "SQL", "VBA"],
            "Created first dedicated BI service line",
            ["timeline", "bi", "architecture"],
            ["api_sources", "semantic_models", "bi_dashboards"],
            ["fund-jpmc-ops"],
            None,
            "Moved from isolated reporting projects to a repeatable BI operating model.",
            "Small but leverage-focused delivery team.",
            "The account had no dedicated analytics service line or reusable reporting backbone.",
            "Established the delivery pattern that later scaled into larger platform programs.",
            "National account leadership",
            "Multi-team reporting program",
            "Service-line architecture around SQL validations, extracts, and dashboard delivery.",
        ),
        _initiative(
            "initiative-azure-databricks-automation",
            "kayne-sr-associate",
            "Azure / Databricks ETL automation",
            date(2018, 5, 1),
            date(2020, 12, 31),
            "automation",
            "Automation",
            "time_saved",
            ["Azure", "PySpark", "SQL", "Power BI"],
            "160+ hours/month removed from manual workflows",
            ["timeline", "architecture", "bi"],
            ["yardi_mri", "excel_ingestion", "azure_data_lake", "databricks_etl", "silver_tables"],
            ["fund-kayne-ops"],
            None,
            "Automated partner-system ingestion and recurring analyst workflows across a 500+ property footprint.",
            "FP&A, asset management, and data engineering collaboration.",
            "Manual uploads and spreadsheet stitching were constraining analyst bandwidth and increasing errors.",
            "Replaced repetitive intake work with governed ETL pipelines and validation steps.",
            "FP&A and asset management",
            "500+ properties",
            "Azure landing + Databricks/PySpark ETL + reporting outputs.",
        ),
        _initiative(
            "initiative-kayne-warehouse",
            "kayne-vp",
            "Real estate data warehouse architecture",
            date(2021, 2, 1),
            date(2023, 6, 30),
            "automation",
            "Data Engineering",
            "scale_integrated",
            ["Databricks", "Azure Data Lake", "PySpark", "DealCloud", "MRI", "Yardi"],
            "Unified investment data across 6+ systems",
            ["timeline", "architecture", "bi"],
            ["dealcloud", "yardi_mri", "excel_ingestion", "azure_data_lake", "databricks_etl", "silver_tables", "gold_tables"],
            ["fund-kayne-warehouse"],
            None,
            "Architected the central REPE warehouse that became the source of truth for investment reporting.",
            "Led offshore data engineering and internal finance stakeholders.",
            "DealCloud, property systems, and Excel models were fragmented, delaying reporting and DDQs.",
            "Created the governed warehouse backbone that all downstream analytics and automation could rely on.",
            "Executive leadership, FP&A, investor relations",
            "$4B+ AUM platform",
            "Medallion-style warehouse design over Databricks and Azure landing zones.",
        ),
        _initiative(
            "initiative-semantic-layer",
            "kayne-vp",
            "Semantic layer / BI model standardization",
            date(2022, 4, 1),
            date(2024, 1, 31),
            "bi",
            "BI / Semantic Models",
            "reporting_acceleration",
            ["Power BI", "DAX", "Semantic Layer", "SQL"],
            "50% fewer ad hoc reporting requests",
            ["timeline", "bi", "architecture"],
            ["gold_tables", "semantic_models", "bi_dashboards"],
            ["fund-kayne-warehouse"],
            None,
            "Built governed business definitions into the analytics layer so portfolio teams could self-serve trusted numbers.",
            "Finance, investor relations, and asset management consumers.",
            "Analysts were spending too much time rebuilding definitions across teams and reports.",
            "Standardized metrics, reduced rework, and improved confidence in reporting outputs.",
            "Portfolio leadership and analyst teams",
            "Six business verticals",
            "Gold tables feeding governed semantic models and Power BI datasets.",
        ),
        _initiative(
            "initiative-governance-automation",
            "kayne-vp",
            "Governance and data quality automation",
            date(2022, 8, 1),
            date(2024, 9, 30),
            "governance",
            "Governance",
            "data_quality",
            ["SQL", "Governance", "Validation Framework"],
            "75% reduction in manual reconciliation",
            ["timeline", "architecture"],
            ["silver_tables", "gold_tables", "semantic_models"],
            ["fund-kayne-warehouse"],
            None,
            "Codified data quality checks and operating controls directly into the platform instead of relying on analyst memory.",
            "Finance and data engineering control loop.",
            "Manual reconciliations were slow, brittle, and hard to audit.",
            "Made governance visible, repeatable, and scalable alongside the warehouse.",
            "Finance, audit, operations",
            "Cross-fund data governance",
            "Validation and lineage controls integrated through the transformation stack.",
        ),
        _initiative(
            "initiative-waterfall-engine",
            "kayne-vp",
            "Waterfall engine development",
            date(2023, 1, 1),
            date(2024, 5, 31),
            "modeling",
            "Financial Modeling",
            "decision_support",
            ["Python", "SQL", "Excel"],
            "Excel process replaced by near-instant scenario runs",
            ["timeline", "modeling", "architecture", "bi"],
            ["gold_tables", "semantic_models", "bi_dashboards"],
            ["investment-kayne-waterfall"],
            "base_case",
            "Replaced spreadsheet-driven waterfall scenarios with a deterministic engine that could support faster decision-making.",
            "Finance + investment team collaboration.",
            "Excel scenarios were slow, fragile, and hard to compare across cases.",
            "Created a reliable engine for IRR, equity multiple, and LP/GP distribution analysis.",
            "Investment committee and FP&A",
            "Fund-level distribution modeling",
            "Python runtime using governed investment inputs and reusable allocation logic.",
        ),
        _initiative(
            "initiative-ai-analytics-platform",
            "jll-director-pds",
            "AI analytics platform / conversational BI / Winston-style systems",
            date(2025, 4, 1),
            date(2026, 3, 27),
            "ai",
            "AI Systems",
            "decision_support",
            ["Databricks", "Delta Lake", "OpenAI", "FastAPI", "Semantic Layer"],
            "Analytics shifted from analyst bottleneck to conversational operating surface",
            ["timeline", "architecture", "bi"],
            ["databricks_etl", "gold_tables", "semantic_models", "embeddings", "vector_db", "rag_pipelines", "winston_interface"],
            ["fund-jll-pds"],
            None,
            "Merged governed data architecture with AI query patterns so business users could ask for insight instead of waiting for analysts.",
            "BI lead plus engineering and client-delivery stakeholders.",
            "Reporting consistency and methodology standardization broke down across accounts.",
            "Delivered a conversational analytics layer on top of a governed foundation.",
            "PDS leadership and client teams",
            "10+ client accounts",
            "Databricks medallion foundation + semantic models + AI query orchestration.",
        ),
    ]

    milestones = [
        _milestone(
            "milestone-first-interactive-dashboards",
            "First interactive dashboard systems",
            date(2016, 6, 1),
            "The first clear shift from manual reporting to live executive-facing dashboards.",
            ["timeline", "bi"],
            ["semantic_models", "bi_dashboards"],
            ["fund-jpmc-ops"],
            None,
        ),
        _milestone(
            "milestone-bi-service-line",
            "JLL’s first dedicated BI service line",
            date(2017, 3, 1),
            "Analytics became an intentional service capability, not a side activity.",
            ["timeline", "architecture", "bi"],
            ["api_sources", "semantic_models"],
            ["fund-jpmc-ops"],
            None,
        ),
        _milestone(
            "milestone-500-property-automation",
            "500+ property integration automation",
            date(2020, 9, 1),
            "Scale became the forcing function for stronger ingestion architecture and controls.",
            ["timeline", "architecture", "bi"],
            ["yardi_mri", "excel_ingestion", "azure_data_lake", "databricks_etl"],
            ["fund-kayne-ops"],
            None,
        ),
        _milestone(
            "milestone-ddq-acceleration",
            "DDQ response acceleration",
            date(2023, 7, 1),
            "The warehouse directly changed investor-facing delivery speed.",
            ["timeline", "bi"],
            ["gold_tables", "semantic_models"],
            ["fund-kayne-warehouse"],
            None,
        ),
        _milestone(
            "milestone-waterfall-replaced-excel",
            "Waterfall engine replacing Excel process",
            date(2024, 2, 1),
            "A manual financial process became governed and repeatable software.",
            ["timeline", "modeling"],
            ["gold_tables"],
            ["investment-kayne-waterfall"],
            "base_case",
        ),
        _milestone(
            "milestone-governed-foundation",
            "Gold-layer governed analytics foundation",
            date(2024, 9, 1),
            "Governance stopped being an afterthought and became part of the architecture.",
            ["timeline", "architecture", "bi"],
            ["gold_tables", "semantic_models"],
            ["fund-kayne-warehouse", "fund-jll-pds"],
            None,
        ),
        _milestone(
            "milestone-ai-analytics-platform",
            "AI / conversational analytics platform delivery",
            date(2025, 10, 1),
            "The platform evolved from reporting infrastructure into a live intelligence interface.",
            ["timeline", "architecture", "bi"],
            ["embeddings", "vector_db", "rag_pipelines", "winston_interface"],
            ["fund-jll-pds"],
            None,
        ),
    ]

    initiatives_by_role = {}
    for initiative in initiatives:
        initiatives_by_role.setdefault(initiative["role_id"], []).append(initiative)
    role_milestone_map = {
        "jll-bi-analytics": ["milestone-first-interactive-dashboards", "milestone-bi-service-line"],
        "kayne-sr-associate": ["milestone-500-property-automation"],
        "kayne-vp": ["milestone-ddq-acceleration", "milestone-waterfall-replaced-excel", "milestone-governed-foundation"],
        "jll-director-pds": ["milestone-ai-analytics-platform"],
    }
    milestones_by_id = {milestone["milestone_id"]: milestone for milestone in milestones}

    for role in roles:
        role["initiatives"] = initiatives_by_role.get(role["timeline_role_id"], [])
        role["milestones"] = [milestones_by_id[mid] for mid in role_milestone_map.get(role["timeline_role_id"], [])]

    return {
        "default_view": "career",
        "views": TIMELINE_VIEWS,
        "start_date": roles[0]["start_date"],
        "end_date": date(2026, 3, 27),
        "roles": roles,
        "milestones": milestones,
    }


def _build_architecture(components: list[dict[str, Any]]) -> dict[str, Any]:
    component_by_name = {component["name"]: component for component in components}

    def outcomes_for(name: str, fallback: list[str]) -> list[str]:
        component = component_by_name.get(name)
        return list(component.get("outcomes") or fallback) if component else fallback

    def description_for(name: str, fallback: str) -> str:
        component = component_by_name.get(name)
        return component.get("description") or fallback if component else fallback

    nodes = [
        _arch_node(
            "dealcloud", "DealCloud", "source", "Source Systems", 40, 80,
            "Investment CRM, pipeline, and DDQ source data entering the platform.",
            ["DealCloud"], outcomes_for("Databricks Lakehouse", ["Pipeline and investment context unified"]),
            "Pipeline and investor data lived outside the reporting backbone.",
            "Kayne Anderson warehouse foundation",
            ["initiative-kayne-warehouse"],
            ["fund-kayne-warehouse"],
            None,
        ),
        _arch_node(
            "yardi_mri", "Yardi / MRI", "source", "Source Systems", 40, 180,
            "Property-accounting systems feeding portfolio operating metrics and actuals.",
            ["Yardi", "MRI"], outcomes_for("Azure Data Lake", ["Property actuals operationalized"]),
            "Property systems were essential but fragmented.",
            "500+ property integration automation",
            ["initiative-azure-databricks-automation", "initiative-kayne-warehouse"],
            ["fund-kayne-ops", "fund-kayne-warehouse"],
            None,
        ),
        _arch_node(
            "excel_ingestion", "Excel Ingestion", "source", "Source Systems", 40, 280,
            "Spreadsheet-based workflows turned into governed inputs instead of manual dead ends.",
            ["Excel", "VBA"], ["Manual processes absorbed into platform workflows"],
            "Critical analysis lived in spreadsheets with little reuse or control.",
            "Excel-to-engine modernization arc",
            ["initiative-azure-databricks-automation", "initiative-waterfall-engine"],
            ["investment-kayne-waterfall"],
            "base_case",
        ),
        _arch_node(
            "api_sources", "External APIs", "source", "Source Systems", 40, 380,
            "Operational and client-facing systems connected through reusable interfaces.",
            ["APIs", "SQL"], ["Systems interoperated instead of exporting CSVs"],
            "Delivery depended on one-off handoffs instead of shared contracts.",
            "JLL service-line buildout",
            ["initiative-jpmc-service-line"],
            ["fund-jpmc-ops"],
            None,
        ),
        _arch_node(
            "azure_data_lake", "Azure Data Lake", "ingestion", "Ingestion", 290, 110,
            description_for("Azure Data Lake", "Cloud landing zone for governed raw data and automation workflows."),
            ["Azure Data Lake", "Logic Apps", "Azure"], outcomes_for("Azure Data Lake", ["Automated ingestion at scale"]),
            "Teams needed durable storage and orchestration before analytics could be trusted.",
            "Kayne automation landing zone",
            ["initiative-azure-databricks-automation", "initiative-kayne-warehouse"],
            ["fund-kayne-ops", "fund-kayne-warehouse"],
            None,
        ),
        _arch_node(
            "databricks_etl", "Databricks / PySpark ETL", "ingestion", "Ingestion", 290, 250,
            description_for("Databricks Lakehouse", "Transformation layer for batch pipelines, medallion flows, and performance-scale ETL."),
            ["Databricks", "PySpark", "Delta Lake"], outcomes_for("Databricks Lakehouse", ["Warehouse backbone established"]),
            "Manual transformation logic was too slow and inconsistent for institutional scale.",
            "Warehouse + PDS platform ETL core",
            ["initiative-azure-databricks-automation", "initiative-kayne-warehouse", "initiative-ai-analytics-platform"],
            ["fund-kayne-warehouse", "fund-jll-pds"],
            None,
        ),
        _arch_node(
            "silver_tables", "Silver Tables", "processing", "Processing", 560, 110,
            "Normalized operating data with consistent definitions, validation, and business-ready structure.",
            ["Delta Lake", "SQL"], ["Reusable transformation contracts"],
            "Source-system noise had to be resolved before downstream models could scale.",
            "Governed intermediate layer for Kayne and JLL",
            ["initiative-kayne-warehouse", "initiative-governance-automation"],
            ["fund-kayne-warehouse", "fund-jll-pds"],
            None,
        ),
        _arch_node(
            "gold_tables", "Gold Tables", "processing", "Processing", 560, 230,
            "Decision-grade curated tables used for metrics, models, executive reporting, and AI.",
            ["SQL", "Power BI", "Semantic Layer"], ["Trusted business definitions downstream"],
            "Without curated gold outputs, every report recreated its own logic.",
            "Gold-layer governed analytics foundation",
            ["initiative-kayne-warehouse", "initiative-semantic-layer", "initiative-waterfall-engine", "initiative-ai-analytics-platform"],
            ["fund-kayne-warehouse", "fund-jll-pds", "investment-kayne-waterfall"],
            "base_case",
        ),
        _arch_node(
            "semantic_models", "Semantic Models", "processing", "Processing", 560, 350,
            "Power BI / tabular business logic layer turning governed data into reusable metrics.",
            ["Power BI", "DAX", "Tabular"], outcomes_for("Power BI Semantic Layer", ["Metric definitions standardized"]),
            "Analysts kept rebuilding the same definitions in every dashboard.",
            "Semantic standardization at Kayne and JLL",
            ["initiative-tableau-dashboards", "initiative-semantic-layer", "initiative-ai-analytics-platform"],
            ["fund-jpmc-ops", "fund-kayne-warehouse", "fund-jll-pds"],
            None,
        ),
        _arch_node(
            "embeddings", "Embeddings", "ai", "AI Layer", 835, 90,
            "Transforms governed enterprise content into semantically searchable context.",
            ["OpenAI Embeddings"], ["Context becomes retrievable, not trapped in documents"],
            "AI needed grounding in actual operating data and knowledge artifacts.",
            "PDS AI analytics + Winston pattern",
            ["initiative-ai-analytics-platform"],
            ["fund-jll-pds"],
            None,
        ),
        _arch_node(
            "vector_db", "Vector DB", "ai", "AI Layer", 835, 190,
            "Stores embeddings and makes context retrieval fast enough for product interactions.",
            ["pgvector", "PostgreSQL"], ["Grounded AI retrieval layer"],
            "AI answers needed retrieval, not just model prompting.",
            "Winston context infrastructure",
            ["initiative-ai-analytics-platform"],
            ["fund-jll-pds"],
            None,
        ),
        _arch_node(
            "rag_pipelines", "RAG Pipelines", "ai", "AI Layer", 835, 290,
            "Retrieval, ranking, and response assembly against the governed data estate.",
            ["RAG", "FastAPI", "Policies"], ["Conversational analytics grounded in current context"],
            "Natural language needed to stay tied to source-of-truth systems.",
            "Conversational BI and Winston evolution",
            ["initiative-ai-analytics-platform"],
            ["fund-jll-pds"],
            None,
        ),
        _arch_node(
            "bi_dashboards", "BI Dashboards", "consumption", "Consumption", 1100, 100,
            "Executive and analyst-facing dashboards that turn governed data into decision support.",
            ["Power BI", "Tableau", "Recharts"], ["Reporting becomes navigable and faster to trust"],
            "Stakeholders needed live answers instead of static packs.",
            "Dashboard systems across JLL and Kayne",
            ["initiative-tableau-dashboards", "initiative-semantic-layer"],
            ["fund-jpmc-ops", "fund-kayne-warehouse"],
            None,
        ),
        _arch_node(
            "winston_interface", "Winston Interface", "consumption", "Consumption", 1100, 210,
            "Contextual assistant and execution layer sitting on top of data, models, and governed actions.",
            ["FastAPI", "Next.js", "MCP"], ["Data platform becomes an operating surface"],
            "The next step beyond dashboards was an interface that could act, explain, and navigate.",
            "Winston-style system layer",
            ["initiative-ai-analytics-platform"],
            ["fund-jll-pds"],
            None,
        ),
        _arch_node(
            "external_apis", "APIs", "consumption", "Consumption", 1100, 320,
            "Reusable interfaces for operational systems, downstream applications, and delivery workflows.",
            ["APIs", "FastAPI"], ["Architecture stays extensible instead of trapped in reports"],
            "Systems needed to serve other systems, not just human dashboards.",
            "Productizing the platform",
            ["initiative-jpmc-service-line", "initiative-ai-analytics-platform"],
            ["fund-jpmc-ops", "fund-jll-pds"],
            None,
        ),
    ]

    edges = [
        _arch_edge("edge-dealcloud-lake", "dealcloud", "azure_data_lake", "Source capture", "Pipeline + CRM ingestion"),
        _arch_edge("edge-property-lake", "yardi_mri", "azure_data_lake", "Accounting actuals", "500+ property operational data"),
        _arch_edge("edge-excel-etl", "excel_ingestion", "databricks_etl", "Spreadsheet normalization", "Manual analysis absorbed into pipelines"),
        _arch_edge("edge-api-etl", "api_sources", "databricks_etl", "Operational feeds", "Repeatable system contracts"),
        _arch_edge("edge-lake-etl", "azure_data_lake", "databricks_etl", "Raw to transform", "Landing zone to governed pipeline"),
        _arch_edge("edge-etl-silver", "databricks_etl", "silver_tables", "Normalize", "Source reconciliation"),
        _arch_edge("edge-silver-gold", "silver_tables", "gold_tables", "Curate", "Decision-grade business tables"),
        _arch_edge("edge-gold-semantic", "gold_tables", "semantic_models", "Model", "Shared business definitions"),
        _arch_edge("edge-gold-embed", "gold_tables", "embeddings", "Vectorize", "AI-ready knowledge layer"),
        _arch_edge("edge-embed-vector", "embeddings", "vector_db", "Store embeddings", "Fast context retrieval"),
        _arch_edge("edge-vector-rag", "vector_db", "rag_pipelines", "Retrieve", "Grounded AI answers"),
        _arch_edge("edge-rag-winston", "rag_pipelines", "winston_interface", "Assemble response", "Contextual AI interface"),
        _arch_edge("edge-semantic-bi", "semantic_models", "bi_dashboards", "Serve metrics", "Executive dashboards"),
        _arch_edge("edge-gold-api", "gold_tables", "external_apis", "Expose contracts", "Platform interoperability"),
    ]

    return {
        "default_view": "technical",
        "nodes": nodes,
        "edges": edges,
    }


def _build_modeling() -> dict[str, Any]:
    assumptions = {
        "entry_cap_rate": 0.059,
        "debt_rate": 0.062,
        "exit_cost_pct": 0.018,
        "lp_equity_share": 0.9,
        "gp_equity_share": 0.1,
        "pref_rate": 0.08,
        "catch_up_ratio": 0.30,
        "residual_lp_split": 0.70,
        "residual_gp_split": 0.30,
    }
    return {
        "defaults": {
            "purchase_price": 128000000.0,
            "exit_cap_rate": 0.055,
            "hold_period": 5,
            "noi_growth_pct": 0.035,
            "debt_pct": 0.58,
        },
        "assumptions": assumptions,
        "presets": [
            {
                "preset_id": "base_case",
                "label": "Base Case",
                "description": "Representative institutional underwriting case tied to the waterfall engine narrative.",
                "inputs": {
                    "purchase_price": 128000000.0,
                    "exit_cap_rate": 0.055,
                    "hold_period": 5,
                    "noi_growth_pct": 0.035,
                    "debt_pct": 0.58,
                },
            },
            {
                "preset_id": "upside",
                "label": "Upside",
                "description": "Higher rent growth and tighter exit assumptions showing upside sensitivity.",
                "inputs": {
                    "purchase_price": 128000000.0,
                    "exit_cap_rate": 0.051,
                    "hold_period": 5,
                    "noi_growth_pct": 0.05,
                    "debt_pct": 0.55,
                },
            },
            {
                "preset_id": "downside",
                "label": "Downside",
                "description": "Rate pressure and softer growth illustrating why fast scenario iteration matters.",
                "inputs": {
                    "purchase_price": 128000000.0,
                    "exit_cap_rate": 0.061,
                    "hold_period": 5,
                    "noi_growth_pct": 0.018,
                    "debt_pct": 0.62,
                },
            },
        ],
    }


def _build_bi() -> dict[str, Any]:
    periods = [f"2025-{month:02d}" for month in range(1, 13)]
    funds = [
        {"entity_id": "fund-kayne-ops", "name": "Kayne Automation Portfolio", "story": "Automation and intake systems used to compress manual work."},
        {"entity_id": "fund-kayne-warehouse", "name": "Kayne Institutional Warehouse", "story": "Warehouse and semantic model build proving governed reporting at scale."},
        {"entity_id": "fund-jll-pds", "name": "JLL PDS Analytics Platform", "story": "AI-enabled analytics surface for executive and client delivery."},
    ]
    investments = [
        ("investment-kayne-west", "fund-kayne-ops", "West Residential Cluster", "Phoenix", "Multifamily", "Residential"),
        ("investment-kayne-sunbelt", "fund-kayne-ops", "Sunbelt Logistics Cluster", "Dallas", "Industrial", "Industrial"),
        ("investment-kayne-east", "fund-kayne-ops", "East Coast Office Cluster", "Atlanta", "Office", "Office"),
        ("investment-kayne-data", "fund-kayne-warehouse", "Warehouse Core Portfolio", "Los Angeles", "Industrial", "Industrial"),
        ("investment-kayne-reporting", "fund-kayne-warehouse", "Investor Reporting Spine", "Chicago", "Office", "Office"),
        ("investment-kayne-waterfall", "fund-kayne-warehouse", "Capital Modeling Sleeve", "Miami", "Mixed Use", "Mixed Use"),
        ("investment-jll-delivery", "fund-jll-pds", "Delivery Intelligence", "New York", "Project Services", "Services"),
        ("investment-jll-accounts", "fund-jll-pds", "Strategic Accounts Analytics", "Boston", "Project Services", "Services"),
        ("investment-jll-ai", "fund-jll-pds", "Conversational BI Rollout", "San Francisco", "Project Services", "Services"),
    ]
    assets_seed = [
        ("asset-phoenix-one", "investment-kayne-west", "Apex Flats", "Phoenix", "Multifamily", "Residential", 21500000, 0.945, 0.173, (0.78, 0.62)),
        ("asset-phoenix-two", "investment-kayne-west", "Copper View", "Phoenix", "Multifamily", "Residential", 19800000, 0.952, 0.168, (0.79, 0.61)),
        ("asset-dallas-one", "investment-kayne-sunbelt", "Mercury Logistics", "Dallas", "Industrial", "Industrial", 28400000, 0.972, 0.191, (0.63, 0.52)),
        ("asset-dallas-two", "investment-kayne-sunbelt", "Transit Yard", "Dallas", "Industrial", "Industrial", 24200000, 0.968, 0.183, (0.62, 0.53)),
        ("asset-atlanta-one", "investment-kayne-east", "Peachtree Plaza", "Atlanta", "Office", "Office", 18800000, 0.884, 0.131, (0.69, 0.47)),
        ("asset-atlanta-two", "investment-kayne-east", "Midtown Commons", "Atlanta", "Office", "Office", 17700000, 0.901, 0.136, (0.70, 0.46)),
        ("asset-la-one", "investment-kayne-data", "Harbor Industrial", "Los Angeles", "Industrial", "Industrial", 31200000, 0.971, 0.186, (0.15, 0.54)),
        ("asset-la-two", "investment-kayne-data", "Pacific Storage", "Los Angeles", "Industrial", "Industrial", 28900000, 0.969, 0.181, (0.16, 0.55)),
        ("asset-chicago-one", "investment-kayne-reporting", "Lakeshore Tower", "Chicago", "Office", "Office", 23200000, 0.912, 0.144, (0.51, 0.39)),
        ("asset-chicago-two", "investment-kayne-reporting", "Canal Point", "Chicago", "Office", "Office", 21900000, 0.918, 0.149, (0.50, 0.40)),
        ("asset-miami-one", "investment-kayne-waterfall", "Biscayne Exchange", "Miami", "Mixed Use", "Mixed Use", 26500000, 0.934, 0.166, (0.76, 0.71)),
        ("asset-miami-two", "investment-kayne-waterfall", "Brickell Landing", "Miami", "Mixed Use", "Mixed Use", 24800000, 0.928, 0.161, (0.77, 0.72)),
        ("asset-ny-one", "investment-jll-delivery", "Hudson Delivery Hub", "New York", "Project Services", "Services", 20500000, 0.962, 0.179, (0.82, 0.32)),
        ("asset-ny-two", "investment-jll-delivery", "Fifth Avenue PMO", "New York", "Project Services", "Services", 21800000, 0.958, 0.175, (0.83, 0.31)),
        ("asset-boston-one", "investment-jll-accounts", "Back Bay Accounts", "Boston", "Project Services", "Services", 19100000, 0.949, 0.171, (0.86, 0.28)),
        ("asset-boston-two", "investment-jll-accounts", "Harbor Accounts", "Boston", "Project Services", "Services", 18400000, 0.947, 0.169, (0.87, 0.29)),
        ("asset-sf-one", "investment-jll-ai", "Market AI Studio", "San Francisco", "Project Services", "Services", 22300000, 0.955, 0.182, (0.08, 0.35)),
        ("asset-sf-two", "investment-jll-ai", "Mission Control", "San Francisco", "Project Services", "Services", 21400000, 0.951, 0.178, (0.09, 0.36)),
        ("asset-orlando-one", "investment-jll-ai", "Sunrail Ops", "Orlando", "Project Services", "Services", 16800000, 0.944, 0.163, (0.73, 0.64)),
        ("asset-denver-one", "investment-kayne-data", "Front Range Industrial", "Denver", "Industrial", "Industrial", 22700000, 0.964, 0.177, (0.39, 0.45)),
        ("asset-charlotte-one", "investment-kayne-east", "Queen City Office", "Charlotte", "Office", "Office", 17200000, 0.905, 0.139, (0.74, 0.49)),
    ]

    entities: list[dict[str, Any]] = [
        {
            "entity_id": "portfolio-root",
            "parent_id": None,
            "level": "portfolio",
            "name": "Institutional Delivery Portfolio",
            "market": None,
            "property_type": None,
            "sector": None,
            "coordinates": None,
            "metrics": {"portfolio_value": 0.0, "noi": 0.0, "occupancy": 0.0, "irr": 0.0},
            "trend": [],
            "story": "Top-level executive lens showing how architecture choices changed reporting, modeling, and decision support.",
            "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
            "linked_timeline_ids": ["initiative-kayne-warehouse", "initiative-semantic-layer", "initiative-ai-analytics-platform"],
        },
    ]

    for fund in funds:
        entities.append({
            "entity_id": fund["entity_id"],
            "parent_id": "portfolio-root",
            "level": "fund",
            "name": fund["name"],
            "market": None,
            "property_type": None,
            "sector": None,
            "coordinates": None,
            "metrics": {"portfolio_value": 0.0, "noi": 0.0, "occupancy": 0.0, "irr": 0.0},
            "trend": [],
            "story": fund["story"],
            "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
            "linked_timeline_ids": ["initiative-kayne-warehouse"] if "kayne" in fund["entity_id"] else ["initiative-ai-analytics-platform"],
        })

    for investment_id, parent_id, name, market, property_type, sector in investments:
        entities.append({
            "entity_id": investment_id,
            "parent_id": parent_id,
            "level": "investment",
            "name": name,
            "market": market,
            "property_type": property_type,
            "sector": sector,
            "coordinates": None,
            "metrics": {"portfolio_value": 0.0, "noi": 0.0, "occupancy": 0.0, "irr": 0.0},
            "trend": [],
            "story": f"{name} shows how operating data was turned into reusable reporting and drillable insight in {market}.",
            "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
            "linked_timeline_ids": ["initiative-waterfall-engine"] if investment_id == "investment-kayne-waterfall" else ["initiative-kayne-warehouse"],
        })

    for idx, (entity_id, parent_id, name, market, property_type, sector, value, occupancy, irr, coords) in enumerate(assets_seed):
        base_noi = round(value * 0.061, 2)
        trend = []
        for month_idx, period in enumerate(periods):
            factor = 0.985 + (month_idx * 0.004)
            trend.append({
                "period": period,
                "noi": round(base_noi * factor, 2),
                "occupancy": round(min(0.989, occupancy - 0.015 + month_idx * 0.002), 4),
                "value": round(value * (0.985 + month_idx * 0.0035), 2),
                "irr": round(max(0.09, irr - 0.02 + month_idx * 0.0025), 4),
            })
        entities.append({
            "entity_id": entity_id,
            "parent_id": parent_id,
            "level": "asset",
            "name": name,
            "market": market,
            "property_type": property_type,
            "sector": sector,
            "coordinates": {"x": coords[0], "y": coords[1]},
            "metrics": {
                "portfolio_value": float(value),
                "noi": float(base_noi),
                "occupancy": float(occupancy),
                "irr": float(irr),
            },
            "trend": trend,
            "story": f"{name} is a representative asset-level record showing how drill paths preserve context through portfolio, fund, investment, and asset views.",
            "linked_architecture_node_ids": ["gold_tables", "semantic_models", "bi_dashboards"],
            "linked_timeline_ids": ["initiative-kayne-warehouse"] if "kayne" in parent_id else ["initiative-ai-analytics-platform"],
        })

    return {
        "root_entity_id": "portfolio-root",
        "levels": ["portfolio", "fund", "investment", "asset"],
        "markets": sorted({entity["market"] for entity in entities if entity.get("market")}),
        "property_types": sorted({entity["property_type"] for entity in entities if entity.get("property_type")}),
        "periods": periods,
        "entities": entities,
    }


def _build_stories(*, stats: dict[str, Any], roles: list[dict[str, Any]], projects: list[dict[str, Any]], deployments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "story_id": "story-ddq",
            "title": "DDQ turnaround became a platform outcome",
            "module": "timeline",
            "why_it_matters": "Faster DDQ responses changed investor-facing responsiveness, not just internal reporting speed.",
            "before_state": "Manual sourcing across fragmented systems with long response cycles.",
            "after_state": "Governed warehouse and semantic layer enabled faster, more trustworthy responses.",
            "audience": "Investor relations and executive stakeholders",
        },
        {
            "story_id": "story-waterfall",
            "title": "Financial modeling moved from spreadsheets to reusable systems",
            "module": "modeling",
            "why_it_matters": "The value is faster scenario iteration, clearer LP/GP economics, and less spreadsheet risk.",
            "before_state": "Slow Excel-driven scenario work with limited comparability.",
            "after_state": "Deterministic waterfall logic with live parameter sensitivity.",
            "audience": "Investment committee, FP&A, and portfolio leadership",
        },
        {
            "story_id": "story-ai",
            "title": "AI was layered onto governed data, not bolted on top of chaos",
            "module": "architecture",
            "why_it_matters": "The systems are credible because the data and business logic are already structured.",
            "before_state": "Analytics depended on analysts and static outputs.",
            "after_state": "Context-aware AI and BI sit on top of reusable data foundations.",
            "audience": "Platform buyers, operations leaders, and technical evaluators",
        },
    ]


def _initiative(
    initiative_id: str,
    role_id: str,
    title: str,
    start_date: date,
    end_date: date,
    category: str,
    capability: str,
    impact_area: str,
    technologies: list[str],
    impact_tag: str,
    linked_modules: list[str],
    linked_architecture_node_ids: list[str],
    linked_bi_entity_ids: list[str],
    linked_model_preset: str | None,
    summary: str,
    team_context: str,
    business_challenge: str,
    measurable_outcome: str,
    stakeholder_group: str,
    scale: str,
    architecture: str,
) -> dict[str, Any]:
    return {
        "initiative_id": initiative_id,
        "role_id": role_id,
        "title": title,
        "summary": summary,
        "team_context": team_context,
        "business_challenge": business_challenge,
        "measurable_outcome": measurable_outcome,
        "stakeholder_group": stakeholder_group,
        "scale": scale,
        "architecture": architecture,
        "start_date": start_date,
        "end_date": end_date,
        "category": category,
        "capability": capability,
        "impact_area": impact_area,
        "technologies": technologies,
        "impact_tag": impact_tag,
        "linked_modules": linked_modules,
        "linked_architecture_node_ids": linked_architecture_node_ids,
        "linked_bi_entity_ids": linked_bi_entity_ids,
        "linked_model_preset": linked_model_preset,
    }


def _milestone(
    milestone_id: str,
    title: str,
    when: date,
    summary: str,
    linked_modules: list[str],
    linked_architecture_node_ids: list[str],
    linked_bi_entity_ids: list[str],
    linked_model_preset: str | None,
) -> dict[str, Any]:
    return {
        "milestone_id": milestone_id,
        "title": title,
        "date": when,
        "summary": summary,
        "linked_modules": linked_modules,
        "linked_architecture_node_ids": linked_architecture_node_ids,
        "linked_bi_entity_ids": linked_bi_entity_ids,
        "linked_model_preset": linked_model_preset,
    }


def _arch_node(
    node_id: str,
    label: str,
    layer: str,
    group: str,
    x: float,
    y: float,
    description: str,
    tools: list[str],
    outcomes: list[str],
    business_problem: str,
    real_example: str,
    linked_timeline_ids: list[str],
    linked_bi_entity_ids: list[str],
    linked_model_preset: str | None,
) -> dict[str, Any]:
    return {
        "node_id": node_id,
        "label": label,
        "layer": layer,
        "group": group,
        "position": {"x": x, "y": y},
        "description": description,
        "tools": tools,
        "outcomes": outcomes,
        "business_problem": business_problem,
        "real_example": real_example,
        "linked_timeline_ids": linked_timeline_ids,
        "linked_bi_entity_ids": linked_bi_entity_ids,
        "linked_model_preset": linked_model_preset,
    }


def _arch_edge(edge_id: str, source: str, target: str, technical_label: str, impact_label: str) -> dict[str, Any]:
    return {
        "edge_id": edge_id,
        "source": source,
        "target": target,
        "technical_label": technical_label,
        "impact_label": impact_label,
    }


def _timeline_blocks(*, selected_timeline: dict[str, Any] | None, query: str) -> list[dict[str, Any]]:
    if not selected_timeline:
        return [
            _markdown_block(
                "timeline-default",
                "The timeline shows the progression from reporting support to platform architecture. Select a role, initiative, or milestone to anchor the rest of the workspace."
            )
        ]
    return [
        _markdown_block(
            "timeline-summary",
            f"**{selected_timeline['title']}** sits at the point where Paul’s scope expanded from {selected_timeline['business_challenge']} to {selected_timeline['measurable_outcome']}."
        ),
        _table_block(
            "timeline-detail",
            "Execution Detail",
            ["Field", "Value"],
            [
                {"Field": "Team context", "Value": selected_timeline["team_context"]},
                {"Field": "Stakeholders", "Value": selected_timeline["stakeholder_group"]},
                {"Field": "Scale", "Value": selected_timeline["scale"]},
                {"Field": "Architecture", "Value": selected_timeline["architecture"]},
            ],
        ),
    ]


def _architecture_blocks(*, selected_node: dict[str, Any] | None, context: dict[str, Any]) -> list[dict[str, Any]]:
    if not selected_node:
        return [
            _markdown_block(
                "architecture-default",
                "This architecture is organized from source systems through ingestion, processing, AI, and consumption. Select a node to see the business problem it solved."
            )
        ]
    return [
        _markdown_block(
            "architecture-summary",
            f"**{selected_node['label']}** exists to solve this problem: {selected_node['business_problem']}. Real example: {selected_node['real_example']}."
        ),
        _kpi_block(
            "architecture-kpis",
            "Node Focus",
            [
                {"label": "View", "value": context.get("architecture_view", "technical").title()},
                {"label": "Tools", "value": ", ".join(selected_node["tools"][:3]) or "—"},
                {"label": "Linked BI contexts", "value": str(len(selected_node["linked_bi_entity_ids"]))},
            ],
        ),
    ]


def _modeling_blocks(context: dict[str, Any]) -> list[dict[str, Any]]:
    metrics = context.get("metrics") or {}
    preset = context.get("model_preset_id") or "base_case"
    return [
        _markdown_block(
            "modeling-summary",
            f"The current **{preset.replace('_', ' ').title()}** scenario shows how the waterfall engine turned Excel-style fund logic into fast, inspectable software."
        ),
        _kpi_block(
            "modeling-kpis",
            "Scenario Output",
            [
                {"label": "IRR", "value": _safe_value(metrics.get("irr"))},
                {"label": "TVPI", "value": _safe_value(metrics.get("tvpi"))},
                {"label": "LP Split", "value": _safe_value(metrics.get("lp_distribution"))},
                {"label": "GP Split", "value": _safe_value(metrics.get("gp_distribution"))},
            ],
        ),
    ]


def _bi_blocks(*, selected_bi: dict[str, Any] | None, context: dict[str, Any]) -> list[dict[str, Any]]:
    metrics = context.get("metrics") or {}
    title = selected_bi["name"] if selected_bi else "Current BI Slice"
    story = selected_bi["story"] if selected_bi else "The dashboard keeps portfolio, fund, investment, and asset context connected."
    return [
        _markdown_block(
            "bi-summary",
            f"**{title}** represents the current drill context. {story}"
        ),
        _kpi_block(
            "bi-kpis",
            "Visible Metrics",
            [
                {"label": "Portfolio Value", "value": _safe_value(metrics.get("portfolio_value"))},
                {"label": "NOI", "value": _safe_value(metrics.get("noi"))},
                {"label": "Occupancy", "value": _safe_value(metrics.get("occupancy"))},
                {"label": "IRR", "value": _safe_value(metrics.get("irr"))},
            ],
        ),
    ]


def _markdown_block(block_id: str, markdown: str) -> dict[str, Any]:
    return {"type": "markdown_text", "block_id": block_id, "markdown": markdown}


def _kpi_block(block_id: str, title: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "kpi_group", "block_id": block_id, "title": title, "items": items}


def _table_block(block_id: str, title: str, columns: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "table", "block_id": block_id, "title": title, "columns": columns, "rows": rows}


def _safe_value(value: Any) -> str:
    if value in (None, ""):
        return "—"
    return str(value)


def _find_timeline_item(timeline: dict[str, Any], item_id: str | None) -> dict[str, Any] | None:
    if not item_id:
        return None
    for milestone in timeline["milestones"]:
        if milestone["milestone_id"] == item_id:
            return {
                "title": milestone["title"],
                "business_challenge": "manual or fragmented workflows",
                "measurable_outcome": milestone["summary"],
                "team_context": "Cross-functional delivery",
                "stakeholder_group": "Executives and operators",
                "scale": "Institutional portfolio scale",
                "architecture": "See linked architecture nodes",
            }
    for role in timeline["roles"]:
        if role["timeline_role_id"] == item_id:
            return {
                "title": role["title"],
                "business_challenge": role["summary"],
                "measurable_outcome": role["scope"],
                "team_context": role["summary"],
                "stakeholder_group": role["lane"],
                "scale": "Career-stage scope",
                "architecture": role["scope"],
            }
        for initiative in role["initiatives"]:
            if initiative["initiative_id"] == item_id:
                return initiative
    return None


def _find_by_id(items: list[dict[str, Any]], key: str, value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    for item in items:
        if item.get(key) == value:
            return item
    return None
