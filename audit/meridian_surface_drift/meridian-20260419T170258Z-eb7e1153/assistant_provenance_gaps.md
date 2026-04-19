# Assistant Provenance Gaps

- `meridian_structured_runtime` fund-performance templates now read released authoritative fund snapshots.
- `meridian_structured_executor.py` remains a deprecated compatibility path, but its Meridian fund-performance reads now resolve through released authoritative fund snapshots.
- Any assistant path outside the structured runtime should be treated as non-authoritative until it resolves through released snapshot contracts.