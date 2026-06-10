"""Dependency-ordered generators (convo.md §4 / §17). Parents before dependents."""

from . import g01_master_data
from . import g02_crm_demand

# As later generators land they are appended here in dependency order.
GENERATORS = [
    g01_master_data,
    g02_crm_demand,
]

__all__ = ["GENERATORS"]
