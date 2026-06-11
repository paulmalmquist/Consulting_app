"""Lineage conventions shared by every generator (guards against silent drift).

- GENERATOR_VERSION is stamped in the manifest (table-level; not duplicated per row).
- SOURCE_SYSTEM marks each row's owning system (convo.md §3).
- Quantitative scenario numbers live ONLY in config/scenario_config.yaml. Generators
  CONSUME them via ctx.scenario; they never invent their own counts. This is the rule
  that keeps "CRM says 38, ERP says 37, QMS says 39" from happening.
- dq_defect_tag marks intentionally-injected defects so ETL DQ assertions exclude them.
"""

from __future__ import annotations

GENERATOR_VERSION = "0.2.0"


class SourceSystem:
    MASTER = "MASTER"
    CRM = "CRM"
    PLM = "PLM"
    ERP = "ERP"
    MES = "MES"
    QMS = "QMS"
    TEST = "TEST"
    IOT = "IOT"
    JIRA = "JIRA"
    DOCS = "DOCS"
    AIML = "AIML"
