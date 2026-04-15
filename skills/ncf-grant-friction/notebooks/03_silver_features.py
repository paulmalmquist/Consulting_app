# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 03 Silver Features (point-in-time)
# MAGIC
# MAGIC Builds `silver_feature_store` with one row per (grant_id, recommended_at), where every
# MAGIC rolling aggregate uses `window.end < recommended_at` — no same-day leakage.
# MAGIC
# MAGIC Feature groups (see plan §3):
# MAGIC   A. Grant-level     (known at recommendation)
# MAGIC   B. Donor history   (365d lagged)
# MAGIC   C. Charity history (365d lagged)
# MAGIC   D. Office queue    (90d exception rate, in-flight count)
# MAGIC   E. Time/seasonality
# MAGIC   F. Governance precursors (prior exceptions)

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
BRONZE_GRANTS = f"{CATALOG}.{SCHEMA}.bronze_grants"
SILVER_LABELED = f"{CATALOG}.{SCHEMA}.silver_grant_labeled"
SILVER_FEATURES = f"{CATALOG}.{SCHEMA}.silver_feature_store"

# All grants (including unresolved) — needed for donor/office history on new grants.
all_grants = spark.table(BRONZE_GRANTS)

# Historical friction signal: join labeled back to all grants. Unlabeled (open) rows get 0
# but do not contribute to denominators (null).
labeled = spark.table(SILVER_LABELED).select("grant_id", "had_friction")
base = all_grants.join(labeled, "grant_id", "left")

# ── A. Grant-level (known at recommendation) ──────────────────────────────────
grant_level = base.select(
    "grant_id",
    "env_id",
    "business_id",
    "fund_id",
    "office_id",
    "charity_id",
    "recommended_at",
    F.log1p(F.col("value_amount")).alias("log_grant_amount"),
    # Derived categoricals — the 517 schema doesn't carry destination_type yet,
    # so v1 uses stage + reporting_lens proxies until the column lands.
    F.col("reporting_lens").alias("grant_reporting_lens"),
)

# ── E. Time / seasonality ─────────────────────────────────────────────────────
time_features = grant_level.select(
    "grant_id",
    F.month("recommended_at").alias("recommendation_month"),
    F.dayofweek("recommended_at").alias("recommendation_dow"),
    F.when(F.month("recommended_at").isin(11, 12), 1).otherwise(0).alias("is_fiscal_year_end_window"),
)

# ── D. Office queue depth at recommendation (point-in-time) ────────────────────
# office_grants_in_flight = count of grants where recommended_at <= g.recommended_at
# and (paid_at is null OR paid_at > g.recommended_at)
office_queue = base.alias("a").join(
    base.alias("g"),
    (F.col("a.office_id") == F.col("g.office_id"))
    & (F.col("a.recommended_at") <= F.col("g.recommended_at"))
    & ((F.col("a.paid_at").isNull()) | (F.col("a.paid_at") > F.col("g.recommended_at"))),
    "inner",
).groupBy("g.grant_id").agg(
    F.count("a.grant_id").alias("office_grants_in_flight"),
)

# ── D. Office exception rate 90d prior ────────────────────────────────────────
# Window: (recommended_at - 90d, recommended_at - 1d). Use labeled rows only.
office_excrate = base.alias("a").filter(F.col("a.had_friction").isNotNull()).join(
    base.alias("g"),
    (F.col("a.office_id") == F.col("g.office_id"))
    & (F.col("a.recommended_at") < F.col("g.recommended_at"))
    & (F.col("a.recommended_at") >= F.date_sub(F.col("g.recommended_at"), 90)),
    "inner",
).groupBy("g.grant_id").agg(
    F.count("a.grant_id").alias("office_prior_grants_90d"),
    F.avg("a.had_friction").alias("office_exception_rate_90d"),
)

# ── B. Donor / giver history (365d lagged) ────────────────────────────────────
donor_hist = base.alias("a").join(
    base.alias("g"),
    (F.col("a.business_id") == F.col("g.business_id"))  # donor_id not on grant in 517; proxy w/ business
    & (F.col("a.recommended_at") < F.col("g.recommended_at"))
    & (F.col("a.recommended_at") >= F.date_sub(F.col("g.recommended_at"), 365)),
    "inner",
).groupBy("g.grant_id").agg(
    F.count("a.grant_id").alias("donor_prior_grant_count_365d"),
    F.avg(F.coalesce(F.col("a.had_friction"), F.lit(0.0))).alias("donor_prior_exception_rate_365d"),
)

# Days since prior grant (same business_id).
w_prior = Window.partitionBy("business_id").orderBy("recommended_at")
days_since = base.withColumn("prev_rec", F.lag("recommended_at").over(w_prior)) \
                 .withColumn(
                     "days_since_prior_grant",
                     F.datediff("recommended_at", "prev_rec"),
                 ).select("grant_id", "days_since_prior_grant")

# ── C. Charity history ────────────────────────────────────────────────────────
charity_hist = base.alias("a").filter(F.col("a.charity_id").isNotNull()).join(
    base.alias("g").filter(F.col("charity_id").isNotNull()),
    (F.col("a.charity_id") == F.col("g.charity_id"))
    & (F.col("a.recommended_at") < F.col("g.recommended_at"))
    & (F.col("a.recommended_at") >= F.date_sub(F.col("g.recommended_at"), 365)),
    "inner",
).groupBy("g.grant_id").agg(
    F.count("a.grant_id").alias("charity_prior_grants_received_365d"),
    F.avg(F.coalesce(F.col("a.had_friction"), F.lit(0.0))).alias("charity_prior_exception_rate_365d"),
)

# ── F. Governance precursors ──────────────────────────────────────────────────
# Prior exception on same charity / donor — boolean.
prior_excp = base.alias("a").filter(F.col("a.had_friction") == 1).join(
    base.alias("g"),
    ((F.col("a.charity_id") == F.col("g.charity_id")) | (F.col("a.business_id") == F.col("g.business_id")))
    & (F.col("a.recommended_at") < F.col("g.recommended_at"))
    & (F.col("a.recommended_at") >= F.date_sub(F.col("g.recommended_at"), 365)),
    "left",
).groupBy("g.grant_id").agg(
    F.max(F.when(F.col("a.charity_id") == F.col("g.charity_id"), 1).otherwise(0)).alias("prior_exception_on_same_charity"),
    F.max(F.when(F.col("a.business_id") == F.col("g.business_id"), 1).otherwise(0)).alias("prior_exception_on_same_donor"),
)

# ── Join everything ───────────────────────────────────────────────────────────
features = (
    grant_level
    .join(time_features, "grant_id", "left")
    .join(office_queue, "grant_id", "left")
    .join(office_excrate, "grant_id", "left")
    .join(donor_hist, "grant_id", "left")
    .join(days_since, "grant_id", "left")
    .join(charity_hist, "grant_id", "left")
    .join(prior_excp, "grant_id", "left")
    .fillna({
        "office_grants_in_flight": 0,
        "office_prior_grants_90d": 0,
        "office_exception_rate_90d": 0.0,
        "donor_prior_grant_count_365d": 0,
        "donor_prior_exception_rate_365d": 0.0,
        "charity_prior_grants_received_365d": 0,
        "charity_prior_exception_rate_365d": 0.0,
        "prior_exception_on_same_charity": 0,
        "prior_exception_on_same_donor": 0,
    })
)

features.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(SILVER_FEATURES)
print(f"silver_feature_store rows={features.count():,}")

# COMMAND ----------

# MAGIC %md
# MAGIC Next: `04_gold_train_table.py` — join features + label into the training set.
