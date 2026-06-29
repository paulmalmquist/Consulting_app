# Databricks notebook source
# MAGIC %md
# MAGIC # Factory NCR Intelligence — backlog forecast (REAL walk-forward backtest)
# MAGIC Builds the weekly opened/closed/open-backlog series from novendor_1.telemetry.ncr_records,
# MAGIC backtests a declared drift forecaster against the naive last-value baseline with a strict
# MAGIC walk-forward protocol (fit on weeks < t, predict week t — no look-ahead), reports MAE BESIDE
# MAGIC MAPE (MAPE alone is unstable near zero), and emits a 4-week forecast with an empirical 90%
# MAGIC band from the backtest residuals. Writes ncr_backlog_weekly to UC and logs to MLflow.
# MAGIC The forecaster only ships as "skillful" if it beats naive in the backtest — that comparison is
# MAGIC logged either way.
# MAGIC
# MAGIC ===== TEACHING NOTES (plain language) =====
# MAGIC WHAT THIS FILE DOES: counts, week by week, how many tickets were OPENED, how many were CLOSED,
# MAGIC and how many are still OPEN (the "backlog"). Then it predicts where the backlog is headed over
# MAGIC the next 4 weeks, and — crucially — first proves the prediction method actually works by
# MAGIC replaying history (a "backtest").
# MAGIC
# MAGIC TWO COMPETING FORECASTS:
# MAGIC   - DRIFT model: "the backlog will keep moving in the direction it's been trending lately"
# MAGIC     (today's backlog plus the average weekly net change over the trailing 8 weeks).
# MAGIC   - NAIVE baseline: "next week looks exactly like this week" (a random walk). This is the dumb
# MAGIC     yardstick — a forecast is only worth shipping if it beats this.
# MAGIC
# MAGIC WALK-FORWARD BACKTEST: train on the past, predict the next week, then step forward one week and
# MAGIC repeat. We only ever use data from BEFORE the week we're predicting (no peeking at the answer).
# MAGIC The gaps between prediction and what actually happened are the "residuals" (the misses).
# MAGIC
# MAGIC WHERE YOU SEE THIS (exact page + visual): FactoryNcrIntelligence.tsx — the BACKLOG FORECAST
# MAGIC CHART. The history rows draw the solid backlog line; the 4 forecast rows draw the projected
# MAGIC line plus the shaded uncertainty band; and the MAE / MAPE accuracy figures shown on the page
# MAGIC come straight from the backtest below.
# MAGIC
# MAGIC INPUTS -> OUTPUT: ticket open/close dates in -> one table (ncr_backlog_weekly) with 16 history
# MAGIC weeks + 4 forecast weeks, plus logged accuracy metrics.
# MAGIC
# MAGIC HOW TO READ THE NUMBERS (one phrase each):
# MAGIC   - MAE  = Mean Absolute Error = on average, how many TICKETS the forecast missed by. Lower is better.
# MAGIC   - MAPE = the same miss expressed as a PERCENTAGE of the actual backlog. Lower is better, but
# MAGIC            it goes haywire when the backlog is near zero — that's why we show MAE beside it.
# MAGIC   - skill_vs_naive = how much better the drift model is than the dumb baseline (>0 = better).
# MAGIC   - the 90% band = drawn from how big the backtest misses actually were, so it honestly reflects
# MAGIC            observed error rather than a textbook assumption.

# COMMAND ----------
import json
from datetime import date, timedelta

import numpy as np
import mlflow

SEED = 20260609
TEL = "novendor_1.telemetry"
EXPERIMENT_ID = "3740651530987773"
ANCHOR = date(2026, 6, 8)          # must match notebooks/ncr_corpus.py
N_WEEKS = 16
DRIFT_WINDOW = 8                   # the drift model looks at the trailing 8 weeks to gauge the trend
BACKTEST_START = 8                 # replay-and-check weeks 8..15 (8 separate predict-the-next-week tests)
HORIZON = 4                        # how many weeks into the future we forecast
BAND_Q = 0.90                      # 90% uncertainty band, sized from the actual backtest miss sizes

mlflow.set_experiment(experiment_id=EXPERIMENT_ID)

rows = (
    spark.table(f"{TEL}.ncr_records")  # type: ignore[name-defined]  # noqa: F821
    .select("ncr_key", "opened_at", "closed_at")
    .toPandas()
)


def _d(v):
    return v if isinstance(v, date) else (None if v is None or str(v) == "None" else date.fromisoformat(str(v)))


rows["opened_at"] = rows["opened_at"].map(_d)
rows["closed_at"] = rows["closed_at"].map(_d)

# Bucket every ticket into the week it opened and the week it closed -> two 16-long count series.
week_starts = [ANCHOR - timedelta(weeks=N_WEEKS - w) for w in range(N_WEEKS)]
opened = [0] * N_WEEKS
closed = [0] * N_WEEKS
for r in rows.itertuples():
    wo = (r.opened_at - week_starts[0]).days // 7
    if 0 <= wo < N_WEEKS:
        opened[wo] += 1
    if r.closed_at is not None:
        wc = (r.closed_at - week_starts[0]).days // 7
        if 0 <= wc < N_WEEKS:
            closed[wc] += 1
# Open backlog at each week END: records opened on/before week end and not closed by week end.
# This is the "how big is the pile of unresolved tickets" series — the line the chart forecasts.
backlog = []
for w in range(N_WEEKS):
    week_end = week_starts[w] + timedelta(days=6)
    n_open = sum(
        1 for r in rows.itertuples()
        if r.opened_at <= week_end and (r.closed_at is None or r.closed_at > week_end)
    )
    backlog.append(n_open)
print("opened", opened)
print("closed", closed)
print("backlog", backlog)

# COMMAND ----------
# Declared models. Drift: backlog_T + h * mean(net flow over trailing DRIFT_WINDOW weeks).
# Naive: backlog_T (random walk). Walk-forward h=1 backtest over weeks BACKTEST_START..N_WEEKS-1.
def drift_forecast(bk: list[int], op: list[int], cl: list[int], t: int, h: int) -> float:
    """Forecast backlog at week t-1+h using only data through week t-1.

    Plain language: take the most recent known backlog and nudge it h weeks forward by the average
    weekly net flow (opened minus closed) over the trailing window. Positive net flow -> backlog
    projected to grow; negative -> projected to shrink.
    """
    lo = max(0, t - DRIFT_WINDOW)
    net = [op[i] - cl[i] for i in range(lo, t)]  # weekly (opened - closed) over the trailing window
    return bk[t - 1] + h * (sum(net) / len(net))


# THE BACKTEST: for each test week, predict it using only earlier weeks, then record the miss
# (residual = actual minus prediction) for BOTH the drift model and the naive baseline. Comparing
# these two piles of misses is how we earn the right to call the drift model "skillful".
resid_model, resid_naive = [], []
for t in range(BACKTEST_START, N_WEEKS):
    actual = backlog[t]
    resid_model.append(actual - drift_forecast(backlog, opened, closed, t, 1))
    resid_naive.append(actual - backlog[t - 1])  # naive = "next week == this week"

# Turn the piles of misses into the accuracy numbers shown on the page.
# MAE  = average size of a miss, in tickets (we drop the +/- sign with abs() first).
# MAPE = that miss as a % of the actual backlog (maximum(...,1) guards against divide-by-zero).
# skill_vs_naive = 1 means perfect, 0 means no better than the dumb baseline, negative means worse.
abs_m = np.abs(np.array(resid_model))
abs_n = np.abs(np.array(resid_naive))
actuals = np.array(backlog[BACKTEST_START:], dtype=float)
mae = float(abs_m.mean())
mae_naive = float(abs_n.mean())
mape = float((abs_m / np.maximum(actuals, 1)).mean() * 100)
mape_naive = float((abs_n / np.maximum(actuals, 1)).mean() * 100)
skill = float(1 - mae / mae_naive) if mae_naive > 0 else 0.0
print(f"backtest folds={len(resid_model)}  MAE={mae:.2f} (naive {mae_naive:.2f})  "
      f"MAPE={mape:.1f}% (naive {mape_naive:.1f}%)  skill_vs_naive={skill:.3f}")

# Now the real 4-week forecast (using ALL 16 weeks). The uncertainty band is set from how big the
# backtest misses actually were: q = the 90th-percentile miss size. We widen the band the further
# out we forecast (* sqrt(h)) because predictions get shakier the further ahead you look.
# -> fc is the forecast line; [lo, hi] is the shaded band on the chart.
q = float(np.quantile(abs_m, BAND_Q))
forecast = []
for h in range(1, HORIZON + 1):
    fc = drift_forecast(backlog, opened, closed, N_WEEKS, h)
    band = q * np.sqrt(h)
    forecast.append({
        "week_start": (week_starts[-1] + timedelta(weeks=h)).isoformat(),
        "kind": "forecast", "opened": None, "closed": None, "backlog": None,
        "fc": round(fc, 2), "lo": round(fc - band, 2), "hi": round(fc + band, 2),
    })

# The 16 weeks of actuals (kind="history") + the 4 forecast weeks (kind="forecast") are written to
# one table. The UI draws the solid line from history rows and the projected line + band from forecast rows.
history = [
    {"week_start": week_starts[w].isoformat(), "kind": "history",
     "opened": opened[w], "closed": closed[w], "backlog": backlog[w],
     "fc": None, "lo": None, "hi": None}
    for w in range(N_WEEKS)
]

# COMMAND ----------
# Log the method, the backtest setup, and every accuracy number to MLflow — the reproducible record
# that the MAE/MAPE/skill figures the page displays were measured honestly, not hand-typed.
with mlflow.start_run(run_name="ncr_backlog_forecast") as run:
    mlflow.log_param("method", "drift(mean net flow, trailing 8w) vs naive(last value)")
    mlflow.log_param("backtest", f"walk-forward h=1, weeks {BACKTEST_START}..{N_WEEKS - 1}")
    mlflow.log_param("band", f"empirical q{int(BAND_Q * 100)}(|resid|) * sqrt(h)")
    mlflow.log_param("seed", SEED)
    mlflow.log_metric("mae", mae)
    mlflow.log_metric("mae_naive", mae_naive)
    mlflow.log_metric("mape_pct", mape)
    mlflow.log_metric("mape_naive_pct", mape_naive)
    mlflow.log_metric("skill_vs_naive", skill)
    mlflow.log_metric("backtest_folds", len(resid_model))
    run_id = run.info.run_id

out_rows = [{**r, "mlflow_run_id": run_id} for r in history + forecast]
# Explicit schema: history rows carry all-None forecast columns (and vice versa), which breaks
# spark's schema inference (CANNOT_INFER_TYPE_FOR_FIELD).
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType  # noqa: E402

BACKLOG_SCHEMA = StructType([
    StructField("week_start", StringType()),
    StructField("kind", StringType()),
    StructField("opened", IntegerType()),
    StructField("closed", IntegerType()),
    StructField("backlog", IntegerType()),
    StructField("fc", DoubleType()),
    StructField("lo", DoubleType()),
    StructField("hi", DoubleType()),
    StructField("mlflow_run_id", StringType()),
])
spark.createDataFrame(out_rows, schema=BACKLOG_SCHEMA).write.mode("overwrite") \
    .option("overwriteSchema", "true").saveAsTable(f"{TEL}.ncr_backlog_weekly")  # type: ignore[name-defined]  # noqa: F821

result = {
    "mlflow_run_id": run_id, "experiment_id": EXPERIMENT_ID,
    "mae": round(mae, 3), "mae_naive": round(mae_naive, 3),
    "mape_pct": round(mape, 2), "mape_naive_pct": round(mape_naive, 2),
    "skill_vs_naive": round(skill, 4), "backtest_folds": len(resid_model),
    "horizon_weeks": HORIZON, "table": f"{TEL}.ncr_backlog_weekly",
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))  # type: ignore[name-defined]  # noqa: F821
