-- Managed Flink: route structural-flaw signatures to their own topic.
-- Statement 2 of 2. The predicate is the canonical anomaly definition; it must
-- stay equal to scripts/streaming/stargate/signal_mapping.py (is_anomalous).
-- backend/tests/test_stargate_codec.py parses this file and fails if the
-- constants drift.

CREATE TABLE IF NOT EXISTS `stargate.printer.anomalies.v1` (
  printer_id STRING,
  ts_us BIGINT,
  layer INT,
  print_job_id STRING,
  melt_pool_temp_c DOUBLE,
  arm_vibration_g DOUBLE
) WITH (
  'value.format' = 'json-registry'
);

INSERT INTO `stargate.printer.anomalies.v1`
SELECT
  printer_id,
  ts_us,
  CAST(layer AS INT) AS layer,  -- proto uint32 infers as BIGINT; sink is INT
  print_job_id,
  melt_pool_temp_c,
  arm_vibration_g
FROM `stargate.printer.telemetry.v1`
WHERE melt_pool_temp_c < 1400.0 AND arm_vibration_g > 0.08;
