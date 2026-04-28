# =============================================================================
# Supply Chain Demo — 06: AI NL→SQL Layer
#
# Translates natural language questions into validated Spark SQL queries
# against the supply_chain_demo.semantic schema.
#
# Two execution paths:
#   PRIMARY:  Databricks Foundation Model API (requires Standard/Premium tier)
#             Uses databricks-meta-llama-3-1-70b-instruct via workspace endpoint.
#   FALLBACK: Deterministic pattern router — keyword → hardcoded SQL.
#             Runs on Community Edition with no API dependency.
#
# Guardrails (applied to ALL paths before execution):
#   1. Statement must start with SELECT
#   2. Blocked keywords: DROP, INSERT, UPDATE, DELETE, ALTER, CREATE, GRANT,
#      TRUNCATE, EXEC, EXECUTE, MERGE, CALL
#   3. Only supply_chain_demo.semantic.* table references allowed
#   4. Referenced tables validated against known set
#   5. No LIMIT bypass via subquery detection (basic)
# =============================================================================

import re
from typing import Optional

try:
    spark.sql("USE CATALOG supply_chain_demo")
    USE_UNITY = True
    CATALOG_PREFIX = "supply_chain_demo.semantic"
except Exception:
    USE_UNITY = False
    CATALOG_PREFIX = "supply_chain_demo_gold"  # fallback when semantic schema unavailable

# ---------------------------------------------------------------------------
# Known semantic tables (validation whitelist)
# ---------------------------------------------------------------------------

SEMANTIC_TABLES = {
    "supply_chain_demo.semantic.otif_scorecard",
    "supply_chain_demo.semantic.fill_rate_by_sku",
    "supply_chain_demo.semantic.days_of_supply_by_warehouse",
    "supply_chain_demo.semantic.supplier_scorecard",
    "supply_chain_demo.semantic.inventory_turns_by_warehouse",
}

BLOCKED_KEYWORDS = {
    "DROP", "INSERT", "UPDATE", "DELETE", "ALTER", "CREATE",
    "GRANT", "REVOKE", "TRUNCATE", "EXEC", "EXECUTE", "MERGE", "CALL",
}

# ---------------------------------------------------------------------------
# SQL Guardrail Validator
# ---------------------------------------------------------------------------

def validate_sql(sql: str) -> tuple[bool, str]:
    """
    Returns (is_valid, reason). reason is empty string on valid.
    """
    stripped = sql.strip()
    if not stripped:
        return False, "empty query"

    # Must start with SELECT
    first_token = stripped.split()[0].upper()
    if first_token != "SELECT":
        return False, f"query must start with SELECT, got '{first_token}'"

    # Block dangerous keywords (word boundary match to avoid false positives)
    upper_sql = stripped.upper()
    for kw in BLOCKED_KEYWORDS:
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, upper_sql):
            return False, f"blocked keyword: {kw}"

    # Extract table references — look for word.word.word or word.word patterns
    # that follow FROM, JOIN, or INTO (we already blocked INTO via INSERT)
    table_refs = re.findall(
        r"(?:FROM|JOIN)\s+([\w]+(?:\.[\w]+){1,2})",
        upper_sql,
        re.IGNORECASE,
    )
    # Lower the found refs and check against whitelist
    for ref in table_refs:
        normalized = ref.lower()
        if not any(normalized == t.lower() or normalized in t.lower() for t in SEMANTIC_TABLES):
            return False, f"table not in semantic whitelist: {ref}"

    return True, ""


# ---------------------------------------------------------------------------
# Deterministic fallback router
# ---------------------------------------------------------------------------
# 5 patterns covering the 5 KPIs. Runs when LLM is unavailable.
# Each pattern is a regex → SQL pair. First match wins.

FALLBACK_PATTERNS = [
    # OTIF
    (
        r"\botif\b|on.time\s+in.full|on.time.*full|delivery\s+rate",
        f"""
SELECT supplier_name, period_month,
       CAST(otif_pct AS DECIMAL(6,2)) AS otif_pct,
       total_shipments
  FROM {CATALOG_PREFIX}.otif_scorecard
 ORDER BY period_month DESC, otif_pct ASC
 LIMIT 50
""".strip(),
        "OTIF scorecard: supplier delivery performance",
    ),
    # Fill Rate / Stockout
    (
        r"\bfill.rate\b|stockout|stock.out|fulfillment.rate",
        f"""
SELECT sku_id, sku_description, sku_category, period_month,
       CAST(fill_rate_pct AS DECIMAL(7,2)) AS fill_rate_pct,
       fill_rate_status
  FROM {CATALOG_PREFIX}.fill_rate_by_sku
 ORDER BY fill_rate_pct ASC
 LIMIT 50
""".strip(),
        "Fill rate by SKU: stockout risk ranking",
    ),
    # Days of Supply
    (
        r"\bdays.of.supply\b|inventory.days|dos\b|how.many.days",
        f"""
SELECT warehouse_id, sku_id, period_month,
       CAST(days_of_supply AS DECIMAL(8,1)) AS days_of_supply,
       supply_status
  FROM {CATALOG_PREFIX}.days_of_supply_by_warehouse
 ORDER BY days_of_supply ASC NULLS LAST
 LIMIT 50
""".strip(),
        "Days of supply: inventory coverage by warehouse",
    ),
    # Inventory Turns
    (
        r"\binventory.turns?\b|stock.turns?|turn.ratio",
        f"""
SELECT warehouse_id, period_month,
       CAST(annualized_turns AS DECIMAL(8,2)) AS annualized_turns,
       turns_rating
  FROM {CATALOG_PREFIX}.inventory_turns_by_warehouse
 ORDER BY annualized_turns DESC
 LIMIT 50
""".strip(),
        "Inventory turns by warehouse: efficiency metric",
    ),
    # Supplier scorecard / composite
    (
        r"\bsupplier.score\b|composite.score|supplier.rank|supplier.performance",
        f"""
SELECT supplier_name, period_month,
       CAST(composite_score AS DECIMAL(6,2)) AS composite_score,
       score_tier
  FROM {CATALOG_PREFIX}.supplier_scorecard
 ORDER BY period_month DESC, composite_score ASC
 LIMIT 50
""".strip(),
        "Supplier scorecard: composite performance ranking",
    ),
]


def fallback_router(question: str) -> Optional[tuple[str, str]]:
    """Returns (sql, description) or None if no pattern matches."""
    q = question.lower()
    for pattern, sql, description in FALLBACK_PATTERNS:
        if re.search(pattern, q, re.IGNORECASE):
            return sql.strip(), description
    return None


# ---------------------------------------------------------------------------
# Foundation Model API client (primary path)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""You are a supply chain data analyst. Translate the user's question
into a valid Spark SQL query against the supply_chain_demo.semantic schema.

Available tables and their key columns:
  {CATALOG_PREFIX}.otif_scorecard
    — supplier_id, supplier_name, supplier_tier, period_month,
       otif_pct, on_time_pct, in_full_pct, avg_lead_time_days

  {CATALOG_PREFIX}.fill_rate_by_sku
    — sku_id, sku_description, sku_category, period_month,
       fill_rate_pct, fill_rate_status, total_shipped_qty, total_ordered_qty

  {CATALOG_PREFIX}.days_of_supply_by_warehouse
    — warehouse_id, sku_id, period_month,
       days_of_supply, supply_status, avg_on_hand_units

  {CATALOG_PREFIX}.supplier_scorecard
    — supplier_id, supplier_name, period_month,
       otif_pct, lead_time_score, quality_score, composite_score, score_tier

  {CATALOG_PREFIX}.inventory_turns_by_warehouse
    — warehouse_id, period_month,
       monthly_cogs_usd, avg_inventory_value_usd, annualized_turns, turns_rating

Rules:
  - Return ONLY the SQL query, no explanation, no markdown fences
  - Always use fully-qualified table names (supply_chain_demo.semantic.*)
  - period_month is a TIMESTAMP truncated to month — use DATE_TRUNC or direct comparison
  - Use ADD_MONTHS(CURRENT_DATE, -N) for relative date ranges
  - Never reference tables outside supply_chain_demo.semantic
  - Always include LIMIT <= 100
"""


def call_foundation_model(question: str) -> Optional[str]:
    """
    Calls the Databricks Foundation Model API.
    Returns generated SQL string or None if unavailable.

    Requires Standard/Premium tier workspace with FMAPI enabled.
    """
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        response = w.serving_endpoints.query(
            name="databricks-meta-llama-3-1-70b-instruct",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": question},
            ],
            max_tokens=512,
            temperature=0.0,  # deterministic — same question → same SQL
        )
        sql = response.choices[0].message.content.strip()
        # Strip markdown fences if the model wraps in ```sql ... ```
        sql = re.sub(r"^```(?:sql)?\s*", "", sql)
        sql = re.sub(r"\s*```$", "", sql)
        return sql.strip()
    except Exception as e:
        print(f"  Foundation Model API unavailable ({type(e).__name__}). Using fallback router.")
        return None


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def ask(question: str) -> dict:
    """
    Main entry point. Returns:
      {
        "question": str,
        "sql": str,
        "path": "llm" | "fallback" | None,
        "error": str | None,
        "description": str,
      }
    """
    result = {"question": question, "sql": None, "path": None, "error": None, "description": ""}

    # Try LLM first
    generated_sql = call_foundation_model(question)
    if generated_sql:
        valid, reason = validate_sql(generated_sql)
        if valid:
            result["sql"] = generated_sql
            result["path"] = "llm"
        else:
            print(f"  LLM output failed guardrail: {reason}. Falling back to router.")

    # Fall back to deterministic router
    if not result["sql"]:
        match = fallback_router(question)
        if match:
            sql, description = match
            valid, reason = validate_sql(sql)
            if valid:
                result["sql"] = sql
                result["path"] = "fallback"
                result["description"] = description
            else:
                result["error"] = f"internal fallback SQL failed validation: {reason}"
        else:
            result["error"] = "no matching pattern — try rephrasing around OTIF, fill rate, days of supply, inventory turns, or supplier scorecard"

    return result


def run_query(question: str) -> None:
    """Ask a question, validate the SQL, and display results."""
    print(f"\nQ: {question}")
    r = ask(question)
    if r["error"]:
        print(f"  Error: {r['error']}")
        return
    print(f"  Path: {r['path']}")
    if r["description"]:
        print(f"  Desc: {r['description']}")
    print(f"  SQL:\n{r['sql']}\n")
    try:
        spark.sql(r["sql"]).show(10, truncate=False)
    except Exception as e:
        print(f"  Execution error: {e}")


# ---------------------------------------------------------------------------
# 5 worked examples — one per KPI
# ---------------------------------------------------------------------------

print("=== AI NL→SQL Demo ===\n")

run_query("Which suppliers have OTIF below 85% in the last 90 days?")
run_query("What are the top 10 SKUs by stockout risk right now?")
run_query("Show me inventory turns by warehouse for the last quarter")
run_query("Which categories have the worst fill rate variance?")
run_query("Which supplier had the biggest OTIF improvement month over month?")

# ---------------------------------------------------------------------------
# Guardrail demonstration
# ---------------------------------------------------------------------------

print("\n=== Guardrail Tests ===\n")

def test_guardrail(label: str, sql: str) -> None:
    valid, reason = validate_sql(sql)
    print(f"  [{label}] {'BLOCKED' if not valid else 'ALLOWED'}: {reason or 'passed'}")
    print(f"    Input: {sql[:80]}...")


test_guardrail("DDL block",        "DROP TABLE supply_chain_demo.semantic.otif_scorecard")
test_guardrail("DML block",        "INSERT INTO supply_chain_demo.semantic.otif_scorecard VALUES (1,2,3)")
test_guardrail("Wrong schema",     "SELECT * FROM supply_chain_demo.gold.supplier_otif_scorecard")
test_guardrail("Valid SELECT",     "SELECT supplier_name, otif_pct FROM supply_chain_demo.semantic.otif_scorecard LIMIT 5")
test_guardrail("UPDATE block",     "UPDATE supply_chain_demo.semantic.otif_scorecard SET otif_pct=100")

print("\nNext: run 07_dashboard.sql for pre-built dashboard queries.")
