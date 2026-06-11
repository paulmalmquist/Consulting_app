-- Managed Flink: 5-second tumbling aggregates per printer.
-- Run in a Confluent Cloud Flink workspace/compute pool scoped to the cluster
-- that holds the stargate topics. Statement 1 of 2 (see 02_anomaly_route.sql).
--
-- The source table is the topic table Confluent infers from the Protobuf
-- subject; $rowtime is the Kafka record timestamp. The sink is declared with
-- json-registry so the bridge's cloud mode reads plain JSON after the
-- registry frame (it tolerates the 5-byte prefix).
--
-- The bridge's local mode emulates exactly this window in
-- scripts/streaming/stargate/signal_mapping.py::TumblingAggregator.

CREATE TABLE IF NOT EXISTS `stargate.printer.telemetry.agg5s.v1` (
  printer_id STRING,
  window_start_ms BIGINT,
  window_end_ms BIGINT,
  avg_temp_c DOUBLE,
  max_vibration_g DOUBLE,
  n BIGINT
) WITH (
  'value.format' = 'json-registry'
);

INSERT INTO `stargate.printer.telemetry.agg5s.v1`
SELECT
  printer_id,
  1000 * UNIX_TIMESTAMP(CAST(window_start AS STRING)) AS window_start_ms,
  1000 * UNIX_TIMESTAMP(CAST(window_end AS STRING)) AS window_end_ms,
  AVG(melt_pool_temp_c) AS avg_temp_c,
  MAX(arm_vibration_g) AS max_vibration_g,
  COUNT(*) AS n
FROM TABLE(
  TUMBLE(TABLE `stargate.printer.telemetry.v1`, DESCRIPTOR($rowtime), INTERVAL '5' SECOND)
)
GROUP BY printer_id, window_start, window_end;
