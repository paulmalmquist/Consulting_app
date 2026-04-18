# Databricks notebook source
# MAGIC %md
# MAGIC # shared/config — History Rhymes global constants
# MAGIC
# MAGIC %run this at the top of every pipeline notebook:
# MAGIC   %run ../shared/config

# COMMAND ----------

# ── MLflow ───────────────────────────────────────────────────────────────────
EXPERIMENT_NAME = "/historyrhymes/HistoryRhymesML"

# ── Assets ───────────────────────────────────────────────────────────────────
EQUITY_TICKERS  = ["SPY", "QQQ", "IWM", "TLT", "GLD"]
CRYPTO_TICKERS  = ["BTC-USD", "ETH-USD"]
ALL_TICKERS     = EQUITY_TICKERS + CRYPTO_TICKERS

EQUITY_SYMBOLS  = ["SPY", "QQQ", "IWM", "TLT", "GLD"]   # Finnhub uses no -USD suffix
CRYPTO_SYMBOLS  = ["BTC", "ETH"]

# ── Agents ───────────────────────────────────────────────────────────────────
AGENT_IDS = [
    "macro_fundamentals",
    "narrative_behavioral",
    "technical_quant",
    "contrarian",
    "geopolitical_risk",
]

# ── Dissensus composite weights (must sum to 1.0) ────────────────────────────
W_W1     = 0.50   # Wasserstein-1 (ordinal dominance)
W_JSD    = 0.30   # Jensen-Shannon divergence
W_DIRVAR = 0.20   # directional variance

# ── Regime thresholds (hysteresis pairs: enter, exit) ────────────────────────
REGIME_THRESHOLDS = {
    "elevated": (0.75, 0.60),
    "high":     (0.95, 0.85),
    "extreme":  (0.99, 0.95),
}

# ── OOD ──────────────────────────────────────────────────────────────────────
OOD_PERCENTILE      = 99
OOD_ROLLING_WINDOW  = 1260   # 5 trading years

# ── Aggregator defaults ───────────────────────────────────────────────────────
CI_BASE      = 0.10
ALPHA_BASE   = 1.5
P_CAP        = 0.85
TOKEN_BUDGET = 600           # per agent context package

# ── Phase gate correlation threshold (Phase 2) ───────────────────────────────
PHASE2_MIN_CORR = 0.20       # corr(D_t, finnhub_dispersion) >= 0.20 by month 6

# ── FRED series (macro context) ───────────────────────────────────────────────
FRED_MACRO_SERIES = {
    "initial_claims":     "ICSA",
    "continued_claims":   "CCSA",
    "real_gdp_growth":    "A191RL1Q225SBEA",
    "cpi_yoy":            "CPIAUCSL",
    "pce_yoy":            "PCEPI",
    "retail_sales":       "RSAFS",
    "industrial_prod":    "INDPRO",
    "consumer_sentiment": "UMCSENT",
    "yield_2y":           "DGS2",
    "yield_10y":          "DGS10",
    "yield_30y":          "DGS30",
    "tips_10y":           "DFII10",
    "breakeven_5y":       "T5YIE",
    "breakeven_10y":      "T10YIE",
    "dollar_index":       "DTWEXBGS",
    "oil_wti":            "DCOILWTICO",
    "nfp":                "PAYEMS",
    "unemployment":       "UNRATE",
    "epu":                "USEPUINDXD",
    "t10y2y":             "T10Y2Y",
}

# ── Databricks workspace paths ────────────────────────────────────────────────
WS_ROOT        = "/historyrhymes"
WS_SHARED      = f"{WS_ROOT}/shared"
WS_PIPELINES   = f"{WS_ROOT}/pipelines"

print(f"[config] experiment={EXPERIMENT_NAME}  agents={len(AGENT_IDS)}  tickers={len(ALL_TICKERS)}")
