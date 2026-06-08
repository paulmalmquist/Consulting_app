# Databricks notebook source
# MAGIC %md
# MAGIC # 06 Score and Visualize (thin adapter)
# MAGIC Logic lives in `weather_risk.stages.score`.

# COMMAND ----------

import os
import sys

_here = os.path.dirname(os.path.abspath("__file__")) if "__file__" not in dir() else os.path.dirname(__file__)
_src = os.path.normpath(os.path.join(_here, "..", "src"))
if _src not in sys.path:
    sys.path.insert(0, _src)


def _use_target_schema():
    catalog = dbutils.jobs.taskValues.get(taskKey="setup", key="catalog", default="hive_metastore")
    schema = dbutils.jobs.taskValues.get(taskKey="setup", key="schema", default="property_ops_risk_ml")
    if catalog == "hive_metastore":
        spark.sql(f"USE {schema}")
    else:
        spark.sql(f"USE {catalog}.{schema}")


_use_target_schema()

# COMMAND ----------

from pyspark.sql import functions as F

from weather_risk.stages import score

predictions = score.run_spark(spark, dbutils)
display(predictions.orderBy(F.desc("risk_score")).limit(50))
