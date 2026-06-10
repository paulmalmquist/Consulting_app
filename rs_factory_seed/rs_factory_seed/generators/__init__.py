"""Dependency-ordered generators (convo.md §4 / §17). Parents before dependents."""

from . import g01_master_data

# As later generators land they are appended here in dependency order.
GENERATORS = [
    g01_master_data,
]

__all__ = ["GENERATORS"]
