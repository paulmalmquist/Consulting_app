-- Trading Analytics Copilot Databricks / Unity Catalog feature examples.
-- Adjust catalog/schema names to match the target workspace.

CREATE CATALOG IF NOT EXISTS trading_demo;
CREATE SCHEMA IF NOT EXISTS trading_demo.bronze;
CREATE SCHEMA IF NOT EXISTS trading_demo.silver;
CREATE SCHEMA IF NOT EXISTS trading_demo.semantic;

CREATE TABLE IF NOT EXISTS trading_demo.bronze.market_prices (
  symbol STRING,
  asset_class STRING,
  source STRING,
  observation_date DATE,
  value DOUBLE,
  unit STRING,
  series_type STRING,
  ingested_at TIMESTAMP
)
USING DELTA
PARTITIONED BY (symbol)
TBLPROPERTIES (
  delta.enableChangeDataFeed = true,
  quality = 'bronze'
);

CREATE TABLE IF NOT EXISTS trading_demo.silver.normalized_series (
  symbol STRING,
  asset_class STRING,
  source STRING,
  observation_date DATE,
  value DOUBLE,
  unit STRING,
  series_type STRING,
  quality_status STRING,
  normalized_at TIMESTAMP
)
USING DELTA
PARTITIONED BY (symbol)
TBLPROPERTIES (
  delta.enableChangeDataFeed = true,
  quality = 'silver'
);

CREATE TABLE IF NOT EXISTS trading_demo.semantic.trading_features (
  symbol STRING,
  observation_date DATE,
  feature_name STRING,
  value DOUBLE,
  method STRING,
  source_table STRING,
  computed_at TIMESTAMP
)
USING DELTA
PARTITIONED BY (symbol)
TBLPROPERTIES (
  delta.enableChangeDataFeed = true,
  quality = 'gold'
);

CREATE OR REPLACE VIEW trading_demo.semantic.daily_returns AS
SELECT
  symbol,
  observation_date,
  value,
  LOG(value / LAG(value) OVER (PARTITION BY symbol ORDER BY observation_date)) AS log_return_1d
FROM trading_demo.silver.normalized_series
WHERE value > 0;

CREATE OR REPLACE VIEW trading_demo.semantic.crude_spreads AS
SELECT
  wti.observation_date,
  brent.value AS brent_price,
  wti.value AS wti_price,
  brent.value - wti.value AS brent_wti_spread
FROM trading_demo.silver.normalized_series wti
JOIN trading_demo.silver.normalized_series brent
  ON brent.observation_date = wti.observation_date
WHERE wti.symbol = 'WTI'
  AND brent.symbol = 'BRENT';

CREATE OR REPLACE VIEW trading_demo.semantic.regression_ready_wti AS
WITH returns AS (
  SELECT symbol, observation_date, log_return_1d
  FROM trading_demo.semantic.daily_returns
  WHERE symbol IN ('WTI', 'DXY_PROXY', 'UST10Y', 'VIX', 'CRUDE_INVENTORY_PROXY')
)
SELECT
  wti.observation_date,
  wti.log_return_1d AS wti_return,
  dxy.log_return_1d AS dxy_return,
  rates.log_return_1d AS ust10y_return,
  vix.log_return_1d AS vix_return,
  inv.log_return_1d AS inventory_change
FROM returns wti
JOIN returns dxy
  ON dxy.observation_date = wti.observation_date AND dxy.symbol = 'DXY_PROXY'
JOIN returns rates
  ON rates.observation_date = wti.observation_date AND rates.symbol = 'UST10Y'
JOIN returns vix
  ON vix.observation_date = wti.observation_date AND vix.symbol = 'VIX'
JOIN returns inv
  ON inv.observation_date = wti.observation_date AND inv.symbol = 'CRUDE_INVENTORY_PROXY'
WHERE wti.symbol = 'WTI';

CREATE OR REPLACE VIEW trading_demo.semantic.seasonal_percentiles AS
SELECT
  symbol,
  DAYOFYEAR(observation_date) AS day_of_year,
  percentile_approx(value, 0.10) AS p10,
  percentile_approx(value, 0.50) AS p50,
  percentile_approx(value, 0.90) AS p90,
  AVG(value) AS historical_avg,
  COUNT(*) AS sample_count
FROM trading_demo.silver.normalized_series
GROUP BY symbol, DAYOFYEAR(observation_date);

CREATE OR REPLACE VIEW trading_demo.semantic.rolling_wti_brent_correlation AS
WITH returns AS (
  SELECT symbol, observation_date, log_return_1d
  FROM trading_demo.semantic.daily_returns
  WHERE symbol IN ('WTI', 'BRENT')
),
aligned AS (
  SELECT
    wti.observation_date,
    wti.log_return_1d AS wti_return,
    brent.log_return_1d AS brent_return
  FROM returns wti
  JOIN returns brent
    ON brent.observation_date = wti.observation_date
   AND brent.symbol = 'BRENT'
  WHERE wti.symbol = 'WTI'
)
SELECT
  observation_date,
  corr(wti_return, brent_return) OVER (
    ORDER BY observation_date
    ROWS BETWEEN 59 PRECEDING AND CURRENT ROW
  ) AS rolling_60d_corr
FROM aligned;

-- Databricks performance hooks:
-- OPTIMIZE trading_demo.silver.normalized_series ZORDER BY (observation_date);
-- OPTIMIZE trading_demo.semantic.trading_features ZORDER BY (observation_date, feature_name);
-- Use MLflow to register calibrated regression/scenario models once fixtures are replaced by governed feeds.
