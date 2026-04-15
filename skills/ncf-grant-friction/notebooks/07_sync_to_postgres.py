# Databricks notebook source
# MAGIC %md
# MAGIC # NCF Grant Friction — 07 Sync to Postgres
# MAGIC
# MAGIC Upsert `gold_grant_friction_preds` → Supabase `ncf_grant_friction_prediction`.
# MAGIC Runs nightly. Uses JDBC + `ON CONFLICT (env_id, grant_id) DO UPDATE`.

# COMMAND ----------

import os
from pyspark.sql import functions as F

CATALOG = "novendor_1"
SCHEMA = "ncf_ml"
GOLD_PREDS = f"{CATALOG}.{SCHEMA}.gold_grant_friction_preds"

JDBC_URL = os.environ["NCF_PG_JDBC_URL"]
JDBC_USER = os.environ["NCF_PG_USER"]
JDBC_PASSWORD = os.environ["NCF_PG_PASSWORD"]
STAGING_TABLE = "ncf_grant_friction_prediction_stage"

preds = spark.table(GOLD_PREDS)

# Land in a staging table first to avoid a long transaction on the live table.
(
    preds.write.format("jdbc")
    .option("url", JDBC_URL)
    .option("user", JDBC_USER)
    .option("password", JDBC_PASSWORD)
    .option("driver", "org.postgresql.Driver")
    .option("dbtable", STAGING_TABLE)
    .mode("overwrite")
    .save()
)

# Upsert staging -> live via a single psycopg round-trip.
import psycopg2  # Databricks runtime provides psycopg2

conn = psycopg2.connect(
    host=os.environ["NCF_PG_HOST"],
    port=int(os.environ.get("NCF_PG_PORT", "5432")),
    dbname=os.environ["NCF_PG_DB"],
    user=JDBC_USER,
    password=JDBC_PASSWORD,
)
try:
    with conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                INSERT INTO ncf_grant_friction_prediction (
                    env_id, business_id, grant_id, risk_score, risk_band,
                    top_drivers, prediction_timestamp, model_version,
                    model_run_id, calibration_brier, confidence_note, null_reason
                )
                SELECT
                    env_id::uuid, business_id::uuid, grant_id::uuid,
                    risk_score, risk_band, top_drivers::jsonb,
                    prediction_timestamp, model_version, model_run_id,
                    calibration_brier, confidence_note, null_reason
                FROM {STAGING_TABLE}
                ON CONFLICT (env_id, grant_id) DO UPDATE SET
                    risk_score = EXCLUDED.risk_score,
                    risk_band = EXCLUDED.risk_band,
                    top_drivers = EXCLUDED.top_drivers,
                    prediction_timestamp = EXCLUDED.prediction_timestamp,
                    model_version = EXCLUDED.model_version,
                    model_run_id = EXCLUDED.model_run_id,
                    calibration_brier = EXCLUDED.calibration_brier,
                    confidence_note = EXCLUDED.confidence_note,
                    null_reason = EXCLUDED.null_reason;
            """)
            cur.execute(f"TRUNCATE TABLE {STAGING_TABLE};")
finally:
    conn.close()

print("sync complete")
