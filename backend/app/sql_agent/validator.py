"""SQL safety validator — ensures generated queries are read-only and scoped.

Non-negotiable rules:
1. Read-only: only SELECT statements allowed
2. Tenant isolation: business_id must appear in the query
3. Table allowlist: only catalog tables
4. No dangerous patterns: no subquery writes, COPY, etc.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.sql_agent.catalog import ALLOWED_TABLES, get_join_path


@dataclass
class ValidationResult:
    valid: bool
    sql: str
    error: str | None = None
    warnings: list[str] | None = None


# Patterns that indicate write operations
_WRITE_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|EXECUTE|CALL)\b",
    re.IGNORECASE,
)

# Patterns that indicate dangerous constructs
_DANGEROUS_PATTERNS = re.compile(
    r"(;\s*(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE))"  # multi-statement injection
    r"|(\bpg_\w+)"                # system catalog access
    r"|(\binformation_schema\b)"  # metadata access
    r"|(--.*$)"                   # SQL comments (could hide payload)
    r"|(/\*)"                     # block comment start
    r"|(\bINTO\s+OUTFILE\b)"     # file writes
    r"|(\bLOAD\s+DATA\b)",       # file reads
    re.IGNORECASE | re.MULTILINE,
)


def validate_sql(sql: str, business_id: str) -> ValidationResult:
    """Validate a generated SQL query for safety.

    Returns ValidationResult with valid=True if the query is safe to execute.
    """
    sql = sql.strip()

    # Remove markdown code fences if present
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    # Must be a SELECT
    if not sql.upper().lstrip().startswith("SELECT"):
        return ValidationResult(valid=False, sql=sql, error="Only SELECT queries are allowed")

    # No write keywords
    if _WRITE_KEYWORDS.search(sql):
        return ValidationResult(valid=False, sql=sql, error="Write operations are not allowed")

    # No dangerous patterns
    match = _DANGEROUS_PATTERNS.search(sql)
    if match:
        return ValidationResult(
            valid=False, sql=sql,
            error=f"Dangerous pattern detected: {match.group()!r}",
        )

    # No multiple statements
    # Split on semicolons outside of string literals (simplified check)
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    if len(statements) > 1:
        return ValidationResult(valid=False, sql=sql, error="Multiple statements not allowed")

    # Table allowlist check
    # Extract table names from FROM and JOIN clauses
    table_pattern = re.compile(
        r"\b(?:FROM|JOIN)\s+(\w+)", re.IGNORECASE,
    )
    referenced_tables = {m.group(1).lower() for m in table_pattern.finditer(sql)}
    allowed_lower = {t.lower() for t in ALLOWED_TABLES}
    unknown = referenced_tables - allowed_lower
    if unknown:
        return ValidationResult(
            valid=False, sql=sql,
            error=f"Unknown tables: {', '.join(sorted(unknown))}. Only catalog tables are allowed.",
        )

    # Tenant isolation: business_id must be referenced
    # The query must join to repe_fund and filter by business_id,
    # OR directly filter a table that has business_id
    if "business_id" not in sql.lower():
        return ValidationResult(
            valid=False, sql=sql,
            error="Query must include business_id filter for tenant isolation",
        )

    # Join validation: verify that all JOINs use validated paths
    join_pattern = re.compile(
        r"\bJOIN\s+(\w+)\b", re.IGNORECASE,
    )
    from_pattern = re.compile(
        r"\bFROM\s+(\w+)\b", re.IGNORECASE,
    )
    from_tables = [m.group(1).lower() for m in from_pattern.finditer(sql)]
    join_tables = [m.group(1).lower() for m in join_pattern.finditer(sql)]

    warnings: list[str] = []
    if join_tables and from_tables:
        # Check each JOIN against the join graph
        all_tables_in_order = from_tables + join_tables
        for i, jt in enumerate(join_tables):
            # The join target should have a validated path from at least one
            # previously referenced table
            preceding = all_tables_in_order[:len(from_tables) + i]
            has_valid_path = any(
                get_join_path(prev, jt) is not None for prev in preceding
            )
            if not has_valid_path:
                warnings.append(
                    f"Unvalidated join: no known path to '{jt}' from {preceding}. "
                    f"This join may produce incorrect results."
                )
            else:
                # Check for fan-out warnings
                for prev in preceding:
                    path = get_join_path(prev, jt)
                    if path and not path.is_safe:
                        warnings.append(
                            f"Fan-out warning on {prev} → {jt}: {path.fan_out_warning or 'potential row multiplication'}"
                        )

    return ValidationResult(valid=True, sql=sql, warnings=warnings or None)
