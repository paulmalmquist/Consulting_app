"""Dependency-ordered generators (convo.md §4 / §17). Parents before dependents."""

from . import g01_master_data
from . import g02_crm_demand
from . import g03_plm_changes
from . import g04_erp_materials
from . import g05_mes_work_orders
from . import g06_qms_quality
from . import g07_test_telemetry
from . import g08_jira_blockers
from . import g09_docs_rag
from . import g10_ai_ml_outputs
from . import g11_gold_frames

# As later generators land they are appended here in dependency order.
# g08 (Jira/blockers) + g09 (docs/RAG) are reserved for the second contributor and slot in
# before g10 when they land; g10 depends only on g01-g07. g11 (gold + DQ) runs LAST — it
# aggregates everything above into demo-readable read models, so it must see all upstream tables.
GENERATORS = [
    g01_master_data,
    g02_crm_demand,
    g03_plm_changes,
    g04_erp_materials,
    g05_mes_work_orders,
    g06_qms_quality,
    g07_test_telemetry,
    g08_jira_blockers,
    g09_docs_rag,
    g10_ai_ml_outputs,
    g11_gold_frames,
]

__all__ = ["GENERATORS"]
