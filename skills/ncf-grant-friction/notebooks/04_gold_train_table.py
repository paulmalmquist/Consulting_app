# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 04 Gold Train Table
# MAGIC
# MAGIC Join features + label into a train-ready set. Labeled rows only (terminal-state grants).

# COMMAND ----------

from pyspark.sql import functions as F

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
SILVER_LABELED = f"{CATALOG}.{SCHEMA}.silver_grant_labeled"
SILVER_FEATURES = f"{CATALOG}.{SCHEMA}.silver_feature_store"
GOLD_TRAIN = f"{CATALOG}.{SCHEMA}.gold_grant_friction_train"

labeled = spark.table(SILVER_LABELED).select("grant_id", "had_friction", "stage")
features = spark.table(SILVER_FEATURES)

train = features.join(labeled, "grant_id", "inner")

# Safety: drop rows where recommended_at is null — we can't time-split those.
train = train.filter(F.col("recommended_at").isNotNull())

train.write.mode("overwrite").option("overwriteSchema", "true").saveAsTable(GOLD_TRAIN)

summary = train.agg(
    F.count("*").alias("n"),
    F.avg("had_friction").alias("positive_rate"),
    F.min("recommended_at").alias("min_date"),
    F.max("recommended_at").alias("max_date"),
).collect()[0]
print(f"gold_grant_friction_train: {summary.asDict()}")
