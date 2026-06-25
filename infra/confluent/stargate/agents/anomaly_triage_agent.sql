-- Confluent Streaming Agent: Stargate anomaly triage (reproducibility artifact).
--
-- The deployed agent is "Paul_Streaming_Agent" with model "stargate-anomaly-triage-gpt4o".
-- It READS deterministic anomaly events and EMITS structured AI triage events. It is NOT the
-- detector: the upstream Flink rule (flink/02_anomaly_route.sql, predicate
-- `melt_pool_temp_c < 1400 AND arm_vibration_g > 0.08`) detects; this agent only EXPLAINS and
-- recommends. Nothing here changes detection.
--
--   stargate.printer.anomalies.v1            (input — the detection event)
--     -> Paul_Streaming_Agent / stargate-anomaly-triage-gpt4o
--       -> stargate.printer.anomaly.triage.v1 (output — this agent's triage)
--
-- Output schema: anomaly_triage_output.schema.json (json-registry). The field names MUST match the
-- durable consumer (backend/app/services/telemetry_stream_consumer.py::persist_row, which upserts
-- tel_stream_triage_events): triage_id, anomaly_id, printer_id, print_job_id, severity, status,
-- incident_summary, likely_cause, leading_indicators, recommended_action, confidence,
-- requires_human_review, null_reason (+ provenance: source_topic/partition/offset, schema_subject/version).
--
-- This file documents the agent so it can be re-created from the repo. It is not auto-submitted by any
-- script (the agent runs in Confluent; see agents/README.md for the create/verify steps). Submit each
-- statement separately, same as the flink/*.sql lane.

-- ── 1. The model handle (provisioned once; connection holds the GPT-4o endpoint + key) ────────────────
-- The CONNECTION (credentials) is created out-of-band via `confluent flink connection create` so no
-- secret lands in the repo (see agents/README.md). The model binds the system prompt below.
CREATE MODEL IF NOT EXISTS `stargate-anomaly-triage-gpt4o`
INPUT (prompt STRING)
OUTPUT (response STRING)
WITH (
  'provider' = 'openai',
  'task' = 'text_generation',
  'openai.connection' = 'stargate-openai-connection',
  'openai.model_version' = 'gpt-4o',
  -- System prompt is the single source of truth for the output contract.
  -- Keep byte-equal to agents/anomaly_triage_system_prompt.md.
  'openai.system_prompt' = '<<see agents/anomaly_triage_system_prompt.md>>'
);

-- ── 2. The triage output topic table (json-registry; Flink owns its sink topic) ───────────────────────
-- Do NOT pre-create the topic — like agg5s/anomalies, the CREATE TABLE binds topic + json-registry
-- schema together. Fields mirror anomaly_triage_output.schema.json.
CREATE TABLE IF NOT EXISTS `stargate.printer.anomaly.triage.v1` (
  triage_id STRING,
  anomaly_id STRING,
  printer_id STRING,
  print_job_id STRING,
  severity STRING,                 -- low | medium | high | critical | null
  status STRING,                   -- ok | not_available
  incident_summary STRING,
  likely_cause STRING,
  leading_indicators ARRAY<STRING>,
  recommended_action STRING,
  confidence STRING,               -- low | medium | high
  requires_human_review BOOLEAN,
  null_reason STRING,
  source_topic STRING,             -- provenance: the anomaly event this triage explains
  source_partition INT,
  source_offset BIGINT,
  schema_subject STRING,
  schema_version INT
) WITH (
  'value.format' = 'json-registry'
);

-- ── 3. The agent statement: anomalies -> model -> triage ──────────────────────────────────────────────
-- ML_PREDICT runs the model per anomaly row; the prompt embeds the structured anomaly. The model is
-- instructed (system prompt) to return STRICT JSON matching the output schema; we parse it into columns.
-- triage_id is deterministic per anomaly so re-runs are idempotent downstream (the consumer upserts on
-- triage_id). status/severity FAIL CLOSED to 'not_available'/NULL when the model cannot triage.
INSERT INTO `stargate.printer.anomaly.triage.v1`
SELECT
  CONCAT('tri_', a.printer_id, '_', CAST(a.ts_us AS STRING))   AS triage_id,
  CONCAT('anom_', a.printer_id, '_', CAST(a.ts_us AS STRING))  AS anomaly_id,
  a.printer_id,
  a.print_job_id,
  JSON_VALUE(p.response, '$.severity')                          AS severity,
  COALESCE(JSON_VALUE(p.response, '$.status'), 'not_available') AS status,
  JSON_VALUE(p.response, '$.incident_summary')                 AS incident_summary,
  JSON_VALUE(p.response, '$.likely_cause')                     AS likely_cause,
  CAST(JSON_QUERY(p.response, '$.leading_indicators') AS ARRAY<STRING>) AS leading_indicators,
  JSON_VALUE(p.response, '$.recommended_action')               AS recommended_action,
  JSON_VALUE(p.response, '$.confidence')                       AS confidence,
  COALESCE(CAST(JSON_VALUE(p.response, '$.requires_human_review') AS BOOLEAN), TRUE) AS requires_human_review,
  JSON_VALUE(p.response, '$.null_reason')                      AS null_reason,
  'stargate.printer.anomalies.v1'                              AS source_topic,
  CAST(NULL AS INT)                                            AS source_partition,
  CAST(NULL AS BIGINT)                                         AS source_offset,
  'stargate.printer.anomalies.v1-value'                        AS schema_subject,
  CAST(NULL AS INT)                                            AS schema_version
FROM `stargate.printer.anomalies.v1` AS a
CROSS JOIN LATERAL TABLE(
  ML_PREDICT(
    'stargate-anomaly-triage-gpt4o',
    CONCAT(
      'Triage this Stargate printer anomaly. Return STRICT JSON only.\n',
      'printer_id=', a.printer_id,
      ' print_job_id=', a.print_job_id,
      ' layer=', CAST(a.layer AS STRING),
      ' melt_pool_temp_c=', CAST(a.melt_pool_temp_c AS STRING),
      ' arm_vibration_g=', CAST(a.arm_vibration_g AS STRING),
      ' ts_us=', CAST(a.ts_us AS STRING)
    )
  )
) AS p;
