#!/usr/bin/env bash
# RS Factory/NCR local E2E drill (throwaway postgres; never touches prod).
# Proves: 10016 applies cleanly; /api/telemetry/ncr fails CLOSED pre-seed (data_not_ingested);
# the generated seed_ncr_serving.sql applies; the route then serves the real mirrored pipeline
# output (clusters, points, backtest, provenance). Receipts land in drill_out/.
set -e
cd "$(dirname "$0")/.."
OUT="drill_out"
mkdir -p "$OUT"
BIZ="7e1eb000-0000-4000-a000-000000000001"

echo "── 1. throwaway postgres ──"
docker rm -f rs_ncr_drill >/dev/null 2>&1 || true
docker run -d --name rs_ncr_drill -e POSTGRES_PASSWORD=pg -p 5434:5432 postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec rs_ncr_drill pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
echo "postgres ready"

echo "── 2. apply 10006 + 10016 ──"
for f in 10006_telemetry_serving 10016_factory_ncr_intelligence; do
  docker exec -i rs_ncr_drill psql -U postgres -v ON_ERROR_STOP=1 -q < "repo-b/db/schema/${f}.sql" >/dev/null
  echo "  applied ${f}"
done

echo "── 3. seed business tenant ──"
docker exec -i rs_ncr_drill psql -U postgres -v ON_ERROR_STOP=1 -q <<SQL
CREATE TABLE IF NOT EXISTS business (business_id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
INSERT INTO business VALUES ('$BIZ', gen_random_uuid()) ON CONFLICT DO NOTHING;
SQL
echo "seeded"

echo "── 4. boot uvicorn ──"
( cd backend && \
  DATABASE_URL="postgresql://postgres:pg@localhost:5434/postgres" \
  WINSTON_OPERATOR_ENABLED=0 \
  python -m uvicorn app.main:app --port 8011 --log-level warning > "../$OUT/ncr_uvicorn.log" 2>&1 & )
for i in $(seq 1 45); do
  curl -s -o /dev/null --max-time 2 "http://localhost:8011/api/telemetry/health" && { echo "uvicorn up after ~$((i*2))s"; break; }
  sleep 2
done

echo "── 5. PRE-SEED: route must fail closed ──"
curl -s "http://localhost:8011/api/telemetry/ncr?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/ncr_preseed.json"
python - "$OUT/ncr_preseed.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d["null_reason"] == "data_not_ingested", d
assert d["kpis"] is None and d["points"] == [] and d["clusters"] == []
print("fail-closed OK:", d["null_reason"])
PY

echo "── 6. apply seed_ncr_serving.sql (the mirror output) ──"
docker exec -i rs_ncr_drill psql -U postgres -v ON_ERROR_STOP=1 < "telemetry-platform/databricks/seed_ncr_serving.sql" | tail -2

echo "── 7. POST-SEED: full payload ──"
curl -s "http://localhost:8011/api/telemetry/ncr?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/ncr_postseed.json"
python - "$OUT/ncr_postseed.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert d["null_reason"] is None, d.get("null_reason")
k, bt, prov = d["kpis"], d["backlog"]["backtest"], d["provenance"]
print("records:", k["n_records"], "| open now:", k["open_now"], "vs", k["open_weeks_ago"], "8wk ago")
print("clusters:", len(d["clusters"]), "| rising:", k["clusters_rising"], k["rising_labels"])
print("points:", len(d["points"]), "| pareto rows:", len(d["pareto"]))
print("history wks:", len(d["backlog"]["history"]), "| forecast wks:", len(d["backlog"]["forecast"]))
print("backtest: MAE", bt["mae"], "(naive", str(bt["mae_naive"]) + ")",
      "MAPE", bt["mape_pct"], "skill", bt["skill_vs_naive"])
print("provenance:", prov["provenance"], "| cluster mlflow:", prov["cluster_mlflow_run_id"],
      "| forecast mlflow:", prov["forecast_mlflow_run_id"])
labels = [(c["cluster_id"], c["label"], c["n_records"], c["status"]) for c in d["clusters"]]
print("cluster labels:", json.dumps(labels, indent=1))
PY

echo "── 8. idempotency: seed applies twice without change ──"
docker exec -i rs_ncr_drill psql -U postgres -v ON_ERROR_STOP=1 < "telemetry-platform/databricks/seed_ncr_serving.sql" >/dev/null
curl -s "http://localhost:8011/api/telemetry/ncr?env_id=telemetry-demo&business_id=$BIZ" > "$OUT/ncr_postseed2.json"
python - "$OUT/ncr_postseed.json" "$OUT/ncr_postseed2.json" <<'PY'
import json, sys
a, b = json.load(open(sys.argv[1], encoding="utf-8")), json.load(open(sys.argv[2], encoding="utf-8"))
assert a == b, "payload changed after re-applying the seed"
print("idempotent OK (payload identical after second apply)")
PY

echo "── teardown ──"
TASKKILL_PID=$(netstat -ano | grep ":8011 " | grep LISTEN | awk '{print $5}' | head -1 || true)
[ -n "$TASKKILL_PID" ] && taskkill //PID "$TASKKILL_PID" //F >/dev/null 2>&1 || true
docker rm -f rs_ncr_drill >/dev/null
echo "DRILL COMPLETE — receipts in $OUT/"
