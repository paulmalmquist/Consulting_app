# Databricks notebook source
# MAGIC %md
# MAGIC # shared/utils — History Rhymes common utilities
# MAGIC
# MAGIC %run this AFTER config:
# MAGIC   %run ../shared/config
# MAGIC   %run ../shared/utils

# COMMAND ----------

import subprocess
subprocess.run(
    ["pip", "install", "tiktoken", "pyarrow", "-q"],
    capture_output=True,
)

import hashlib
import json
import warnings
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ── Timestamp ─────────────────────────────────────────────────────────────────
AS_OF_TS: str = datetime.utcnow().isoformat() + "Z"

# ── Data snapshot registry (module-level, cleared per notebook run) ───────────
_snapshots: list[dict] = []

def snap(source: str, payload: dict, as_of: str = AS_OF_TS) -> str:
    """
    Record one external data pull.
    Returns a 16-char snapshot id (SHA256 prefix).
    Every external pull must call snap() before returning data to callers.
    """
    snap_id = hashlib.sha256(f"{source}{as_of}".encode()).hexdigest()[:16]
    _snapshots.append({
        "id":             snap_id,
        "called_ts":      datetime.utcnow().isoformat() + "Z",
        "as_of_ts":       as_of,
        "source":         source,
        "payload_digest": hashlib.sha256(
            json.dumps(payload, default=str).encode()
        ).hexdigest()[:32],
    })
    return snap_id

def get_snapshots() -> list[dict]:
    """Return all snapshots accumulated in this notebook run."""
    return list(_snapshots)

def snapshots_df() -> pd.DataFrame:
    """Return snapshots as a DataFrame ready to write to Supabase."""
    return pd.DataFrame(_snapshots) if _snapshots else pd.DataFrame()

# ── FRED helper ───────────────────────────────────────────────────────────────
def fred_latest(series_id: str, as_of: Optional[str] = None) -> Optional[float]:
    """Pull the latest value of a single FRED series. Snaps on success."""
    import requests
    as_of = as_of or datetime.utcnow().isoformat() + "Z"
    url   = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    try:
        df = pd.read_csv(url, parse_dates=["DATE"]).replace(".", np.nan)
        df.columns = ["date", "value"]
        df["value"] = pd.to_numeric(df["value"], errors="coerce")
        latest = df.dropna().iloc[-1]
        val    = float(latest["value"])
        snap(f"FRED:{series_id}", {"date": str(latest["date"]), "value": val}, as_of)
        return val
    except Exception as e:
        print(f"  FRED {series_id}: {e}")
        return None

# ── Safe type coercions ───────────────────────────────────────────────────────
def safe_float(v: Any) -> Optional[float]:
    try:
        f = float(v)
        return None if (f != f) else f   # NaN → None
    except Exception:
        return None

def safe_int(v: Any) -> Optional[int]:
    try:
        return int(v)
    except Exception:
        return None

def fmt(val: Any, spec: str = ".2f", fallback: str = "N/A") -> str:
    if val is None:
        return fallback
    try:
        return format(float(val), spec)
    except Exception:
        return str(val)

def pct(val: Any, fallback: str = "N/A") -> str:
    if val is None:
        return fallback
    try:
        return f"{float(val)*100:.0f}%"
    except Exception:
        return fallback

# ── Token counter ─────────────────────────────────────────────────────────────
try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")
    def count_tokens(text: str) -> int:
        return len(_enc.encode(text))
except ImportError:
    def count_tokens(text: str) -> int:
        return len(text.split()) * 4 // 3

# ── MLflow artifact helpers ───────────────────────────────────────────────────
def log_snapshots_artifact(run, local_path: str = "/tmp/data_snapshots.parquet") -> None:
    """Save accumulated snapshots as a parquet MLflow artifact."""
    import mlflow
    df = snapshots_df()
    if not df.empty:
        df.to_parquet(local_path, index=False)
        mlflow.log_artifact(local_path, artifact_path="data")
        print(f"  snapshots: {len(df)} rows logged to MLflow")

def download_run_artifact_df(client, run_id: str, artifact_path: str) -> Optional[pd.DataFrame]:
    try:
        local = client.download_artifacts(run_id, artifact_path)
        return pd.read_parquet(local)
    except Exception as e:
        print(f"  artifact {artifact_path}: {e}")
        return None

def download_run_artifact_json(client, run_id: str, artifact_path: str) -> Optional[dict]:
    try:
        local = client.download_artifacts(run_id, artifact_path)
        with open(local) as f:
            return json.load(f)
    except Exception as e:
        print(f"  artifact json {artifact_path}: {e}")
        return None

def get_latest_run(client, experiment_id: str, run_name: str):
    """Return most recent MLflow Run matching run_name."""
    runs = client.search_runs(
        experiment_ids=[experiment_id],
        filter_string=f"tags.mlflow.runName = '{run_name}'",
        order_by=["start_time DESC"],
        max_results=1,
    )
    return runs[0] if runs else None

print(f"[utils] loaded  AS_OF_TS={AS_OF_TS[:19]}")
