#!/usr/bin/env bash
# RS streaming-slice local E2E drill (throwaway postgres; never touches prod).
# Receipts land in drill_out/ (worktree-relative so Windows python can read them).
set -e
cd "$(dirname "$0")/.."
OUT="drill_out"
BIZ="7e1eb000-0000-4000-a000-000000000001"

echo "── 1. throwaway postgres ──"
docker rm -f rs_drill >/dev/null 2>&1 || true
docker run -d --name rs_drill -e POSTGRES_PASSWORD=pg -p 5433:5432 postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec rs_drill pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
echo "postgres ready"

echo "── 2. apply 10006 + 10008 + 10015 ──"
for f in 10006_telemetry_serving 10008_telemetry_backfill_metadata 10015_telemetry_streaming_slice; do
  docker exec -i rs_drill psql -U postgres -v ON_ERROR_STOP=1 -q < "repo-b/db/schema/${f}.sql" >/dev/null
  echo "  applied ${f}"
done

echo "── 3. seed business + champion ──"
docker exec -i rs_drill psql -U postgres -v ON_ERROR_STOP=1 -q <<SQL
CREATE TABLE IF NOT EXISTS business (business_id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
INSERT INTO business VALUES ('$BIZ', gen_random_uuid()) ON CONFLICT DO NOTHING;
INSERT INTO tel_model_runs (env_id, business_id, model_name, model_kind, model_version, model_alias,
  mlflow_run_id, metrics, gate, promotion_state)
VALUES ('telemetry-demo', '$BIZ', 'tel_anomaly_detector', 'anomaly', '1', 'champion',
  '4a48cb6af8714609b9581d66e904544c', '{"f1":0.6387}', '{"decision":"promoted"}', 'promoted')
ON CONFLICT DO NOTHING;
SQL
echo "seeded"

echo "── 4. boot uvicorn (capture mode, 15s ETL) ──"
( cd backend && \
  DATABASE_URL="postgresql://postgres:pg@localhost:5433/postgres" \
  TELEMETRY_STREAM_ENABLED=1 TELEMETRY_STREAM_SOURCE=capture TELEMETRY_ETL_INTERVAL_SECONDS=15 \
  TELEMETRY_STREAM_ADMIN_KEY=drill123 WINSTON_OPERATOR_ENABLED=0 \
  python -m uvicorn app.main:app --port 8001 --log-level warning > "../$OUT/uvicorn.log" 2>&1 & )
for i in $(seq 1 45); do
  curl -s -o /dev/null --max-time 2 "http://localhost:8001/api/telemetry/health" && { echo "uvicorn up after ~$((i*2))s"; break; }
  sleep 2
done
sleep 16   # let capture frames land + at least one ETL cycle

echo "── 5. live payload ──"
curl -s "http://localhost:8001/api/telemetry/stream/live?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/live1.json"
python - "$OUT/live1.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("source:", d["source"], "| pipeline:", d["pipeline"]["status"])
print("channels:", len(d["channels"]), "| total readings:", sum(len(c["readings"]) for c in d["channels"]))
print("sample:", [(c["channel_name"], round(c["latest"]["v"], 2) if c["latest"] else None) for c in d["channels"][:4]])
PY

echo "── 6. health + monitoring after an ETL cycle ──"
sleep 10
curl -s "http://localhost:8001/api/telemetry/stream/health?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/health1.json"
python - "$OUT/health1.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("freshness channels:", len(d["freshness"]), "| rows/min:", d["rows_per_min"])
print("ingest lag p50:", d["ingest_lag_p50_s"], "s | p95:", d["ingest_lag_p95_s"], "s")
print("assertions:", [(a["assertion_name"], a["passed"]) for a in d["assertions"][:4]])
print("pipeline:", [(s["surface"], s["status"]) for s in d["pipeline_status"]])
print("watermarks:", [w["job_name"] for w in d["watermarks"]])
PY
curl -s "http://localhost:8001/api/telemetry/monitoring?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/mon1.json"
python - "$OUT/mon1.json" <<'PY'
import json, sys
print("monitoring.stream:", json.load(open(sys.argv[1])).get("stream"))
PY

echo "── 7. EXPLAIN partition-pruning exhibit ──"
docker exec -i rs_drill psql -U postgres -c "EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM tel_stream_readings_bronze WHERE ts_ingest >= current_date AND ts_ingest < current_date + 1;" > "$OUT/explain_pruned.txt"
docker exec -i rs_drill psql -U postgres -c "EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM tel_stream_readings_bronze;" > "$OUT/explain_full.txt"
grep -E "Scan|Aggregate|Execution Time" "$OUT/explain_pruned.txt" | head -6

echo "── 8. STALE drill: starve the feed (adsb fallback w/o network luck), wait >60s ──"
curl -s -X POST "http://localhost:8001/api/telemetry/stream/source" -H "Content-Type: application/json" -H "x-stream-admin-key: drill123" -d '{"source":"adsb"}'
echo ""
sleep 78
curl -s "http://localhost:8001/api/telemetry/stream/live?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/live_stale.json"
python - "$OUT/live_stale.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("AFTER STARVATION -> pipeline:", d["pipeline"]["status"], "| reason:", d["pipeline"]["reason"])
PY

echo "── 9. recovery: back to capture ──"
curl -s -X POST "http://localhost:8001/api/telemetry/stream/source" -H "Content-Type: application/json" -H "x-stream-admin-key: drill123" -d '{"source":"capture"}'
echo ""
sleep 10
curl -s "http://localhost:8001/api/telemetry/stream/live?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/live_recovered.json"
python - "$OUT/live_recovered.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("AFTER RECOVERY -> pipeline:", d["pipeline"]["status"], "| source:", d["source"])
PY

echo "── teardown ──"
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match 'Python314.*uvicorn.*8001' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" 2>/dev/null || true
docker rm -f rs_drill >/dev/null
echo "DRILL COMPLETE"
