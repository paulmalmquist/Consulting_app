# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 01 Bronze Ingest
# MAGIC
# MAGIC Mirror Postgres NCF tables into `novendor_1.ncf_ml.bronze_*`.
# MAGIC JDBC pull, partitioned by `recommended_at` for efficient downstream point-in-time joins.
# MAGIC
# MAGIC Run cadence: nightly (full-refresh on small tables; incremental via `recommended_at >= cutoff` on grants).

# COMMAND ----------

import os
from datetime import date, timedelta

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
JDBC_URL = os.environ["NCF_PG_JDBC_URL"]           # e.g. jdbc:postgresql://host:5432/db
JDBC_USER = os.environ["NCF_PG_USER"]
JDBC_PASSWORD = os.environ["NCF_PG_PASSWORD"]

# Incremental window: last 30 days + 2 days slack for late-arriving updates.
CUTOFF = (date.today() - timedelta(days=32)).isoformat()

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")


def pull(table: str, query: str) -> None:
    """JDBC pull and overwrite table partition."""
    df = (
        spark.read.format("jdbc")
        .option("url", JDBC_URL)
        .option("user", JDBC_USER)
        .option("password", JDBC_PASSWORD)
        .option("driver", "org.postgresql.Driver")
        .option("dbtable", f"({query}) src")
        .load()
    )
    target = f"{CATALOG}.{SCHEMA}.{table}"
    df.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(target)
    print(f"wrote {target}: {df.count():,} rows")


# COMMAND ----------

# Full refresh on small dimensions.
pull("bronze_offices", "SELECT * FROM ncf_office")
pull("bronze_donors", "SELECT * FROM ncf_donor")
pull("bronze_funds", "SELECT * FROM ncf_fund")

# Incremental on facts.
pull(
    "bronze_grants",
    f"""
    SELECT *
    FROM ncf_grant
    WHERE recommended_at >= DATE '{CUTOFF}'
       OR paid_at >= DATE '{CUTOFF}'
       OR approved_at >= DATE '{CUTOFF}'
    """,
)
pull(
    "bronze_contributions",
    f"""
    SELECT *
    FROM ncf_contribution
    WHERE contributed_at >= DATE '{CUTOFF}'
    """,
)

# COMMAND ----------

# MAGIC %md
# MAGIC Next: `02_silver_label.py` — construct `had_friction` target on terminal-state grants.
