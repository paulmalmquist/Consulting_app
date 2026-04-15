# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 02 Silver Label
# MAGIC
# MAGIC Construct the `had_friction` target on terminal-state grants only.
# MAGIC Unresolved grants are excluded from training but scored in inference.
# MAGIC
# MAGIC ## Target (v1, binary)
# MAGIC `had_friction = 1` IF any of:
# MAGIC - `required_manual_exception = true` (upstream flag), OR
# MAGIC - `paid_at - recommended_at > SLA_business_days` (default 10), OR
# MAGIC - `review_cycles > 1`
# MAGIC
# MAGIC ## Assumptions
# MAGIC The `ncf_grant` schema as of 517 has `stage`, `recommended_at`, `approved_at`, `paid_at`.
# MAGIC It does NOT yet have `required_manual_exception` or `review_cycles`. For v1 we derive
# MAGIC a proxy target from SLA miss + stage jitter. A follow-up schema bump should add the
# MAGIC exception flag and review-cycle counter.

# COMMAND ----------

from pyspark.sql import functions as F

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
BRONZE_GRANTS = f"{CATALOG}.{SCHEMA}.bronze_grants"
SILVER = f"{CATALOG}.{SCHEMA}.silver_grant_labeled"

DEFAULT_SLA_DAYS = 10  # calendar days; tune per office/charity in v2

grants = spark.table(BRONZE_GRANTS)

# Terminal states only. Today 'paid' | 'cancelled' | 'returned' are the accepted terminals;
# adapt as stage taxonomy evolves.
TERMINAL_STAGES = ["paid", "cancelled", "returned"]
terminal = grants.filter(F.col("stage").isin(TERMINAL_STAGES))

# SLA miss: paid later than SLA, OR never paid but stayed open > SLA before cancel/return.
sla_miss = F.when(
    (F.col("stage") == "paid") & F.col("paid_at").isNotNull() & F.col("recommended_at").isNotNull(),
    F.datediff(F.col("paid_at"), F.col("recommended_at")) > DEFAULT_SLA_DAYS,
).when(
    F.col("stage").isin("cancelled", "returned") & F.col("recommended_at").isNotNull(),
    F.datediff(F.current_date(), F.col("recommended_at")) > DEFAULT_SLA_DAYS,
).otherwise(False)

# Proxy for review complexity: stage transitions took long paths (approved_at gap large).
review_jitter = F.when(
    F.col("approved_at").isNotNull() & F.col("recommended_at").isNotNull(),
    F.datediff(F.col("approved_at"), F.col("recommended_at")) > 5,
).otherwise(False)

labeled = terminal.withColumn("sla_miss", sla_miss) \
                  .withColumn("review_jitter", review_jitter) \
                  .withColumn(
                      "had_friction",
                      (F.col("sla_miss") | F.col("review_jitter")).cast("int"),
                  ) \
                  .select(
                      "grant_id",
                      "env_id",
                      "business_id",
                      "fund_id",
                      "office_id",
                      "charity_id",
                      "value_amount",
                      "recommended_at",
                      "approved_at",
                      "paid_at",
                      "stage",
                      "sla_miss",
                      "review_jitter",
                      "had_friction",
                  )

labeled.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(SILVER)

rate = labeled.agg(F.avg("had_friction").alias("positive_rate")).collect()[0]["positive_rate"]
print(f"silver_grant_labeled rows={labeled.count():,} positive_rate={rate:.4f}")

# COMMAND ----------

# MAGIC %md
# MAGIC Next: `03_silver_features.py` — point-in-time feature engineering.
