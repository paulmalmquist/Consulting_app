"""
Phase 7A driver — run the fused-state-vector notebook in Databricks, persist the selection + manifest,
and emit the Supabase backfill SQL for tel_fused_state_vectors + tel_feature_manifest.

Heavy work (vector build, PCA + autoencoder-style training, MLflow, attribution) runs in the Databricks
notebook (notebooks/fused_state_vector.py) which writes Delta tables. This driver:
  1. uploads + runs that notebook (serverless job), captures the summary JSON,
  2. writes committed fused_channel_selection.json + fused_feature_manifest.json,
  3. pulls the gold_fused_state_vectors + gold_fused_feature_manifest Delta tables,
  4. emits an idempotent, demo-tenant-scoped seed_serving_fused.sql (is_backfilled=true).

Run: python 14_fused_state_vector.py
"""
import json
import sys
from pathlib import Path

from _bootstrap import get_client, TEL
from _jobs import ensure_dir, upload_notebook, run_notebook_and_wait, get_notebook_output, WORKSPACE_DIR

HERE = Path(__file__).resolve().parent
NOTEBOOK = HERE / "notebooks" / "fused_state_vector.py"
SEL_JSON = HERE / "fused_channel_selection.json"
MAN_JSON = HERE / "fused_feature_manifest.json"
SEED = HERE / "14_backfill_fused.sql"

ENV_ID = "telemetry-demo"
BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001"
BATCH_ID = "phase7a-fused-v1"


def _fetch_all(client, sql):
    resp = client.execute_sql(sql, wait=True)
    if resp.get("status", {}).get("state") not in ("SUCCEEDED", "FINISHED"):
        raise RuntimeError(f"SQL not OK: {resp.get('status')}")
    rows = resp.get("result", {}).get("data_array", []) or []
    total = resp.get("manifest", {}).get("total_row_count", len(rows))
    sid = resp.get("statement_id"); chunks = resp.get("manifest", {}).get("chunks", [])
    if sid and len(rows) < total and len(chunks) > 1:
        for ch in chunks[1:]:
            more = client._request("GET", f"/api/2.0/sql/statements/{sid}/result/chunks/{ch['chunk_index']}")
            rows.extend(more.get("data_array", []) or [])
    cols = [c["name"] for c in resp.get("manifest", {}).get("schema", {}).get("columns", [])]
    return cols, rows


def s(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def main() -> int:
    client = get_client()

    # 1) run the notebook (it builds vectors, trains, writes Delta tables)
    ensure_dir(client)
    wp = upload_notebook(client, str(NOTEBOOK), f"{WORKSPACE_DIR}/fused_state_vector")
    print(f"[fused] uploaded {wp}; running serverless job (build + train, ~minutes) ...")
    res = run_notebook_and_wait(client, wp, "telemetry_fused_state_vector", timeout=3000)
    print(f"[fused] result_state={res['result_state']} url={res['run_page_url']}")
    if res["result_state"] != "SUCCESS":
        print(f"[fused] FAIL — {res.get('state_message')}")
        return 2
    summary = json.loads(get_notebook_output(client, res["run_id"]).get("result", "{}"))
    if summary.get("error"):
        print(f"[fused] BLOCKER — {summary}")
        return 3
    print(f"[fused] dim={summary['feature_dim']} channels={summary['n_channels']} "
          f"buckets={summary['buckets']} train={summary['fused_vectors_train']} test={summary['fused_vectors_test']}")
    print(f"[fused] models: PCA f1={summary['models']['pca_256']['f1']:.4f} "
          f"AE f1={summary['models']['autoencoder_256']['f1']:.4f} "
          f"AE test_recon_mse={summary['models']['autoencoder_256']['test_recon_mse']:.4f}")

    # 2) committed selection + manifest JSON
    SEL_JSON.write_text(json.dumps({
        "feature_dim": summary["feature_dim"], "n_channels": summary["n_channels"],
        "features_per_channel": summary["features_per_channel"], "buckets": summary["buckets"],
        "alignment": summary["alignment"], "adequacy": "train>=1500 & test>=2000 rows",
        "selection": summary["selection"],
    }, indent=2))
    cols, manrows = _fetch_all(client, f"SELECT feature_index, chan_id, feature_name, source_table, calc, "
                                       f"leakage_risk, included FROM {TEL}.gold_fused_feature_manifest "
                                       f"ORDER BY feature_index")
    ci = {c: i for i, c in enumerate(cols)}
    manifest = [{c: r[ci[c]] for c in cols} for r in manrows]
    MAN_JSON.write_text(json.dumps({"feature_dim": len(manifest), "manifest": manifest}, indent=2))
    print(f"[fused] wrote {SEL_JSON.name} ({len(summary['selection'])} channels) + {MAN_JSON.name} ({len(manifest)} features)")

    # 3) pull fused vectors -> emit idempotent demo-tenant seed
    fcols, frows = _fetch_all(client, f"SELECT split, window_index, source_channels, vector_dim, "
                                      f"feature_vector, label_any_anomaly, label_channels_anomalous, "
                                      f"recon_error_ae, recon_error_pca, top_contributors "
                                      f"FROM {TEL}.gold_fused_state_vectors")
    fi = {c: i for i, c in enumerate(fcols)}
    L = [
        "-- seed_serving_fused.sql  (GENERATED by 14_fused_state_vector.py — do not hand-edit)",
        "-- Phase 7A: 256-d fused NASA-analog state vectors (32 SMAP/MSL channels x 8 window features).",
        "-- Real values from gold_smap_msl_windows; channels aligned by NORMALIZED sequence progress",
        "-- (not physical simultaneity). is_backfilled=true, backfill_batch_id='" + BATCH_ID + "'.",
        "BEGIN;",
        f"DELETE FROM tel_fused_state_vectors WHERE env_id='{ENV_ID}' AND is_backfilled=true "
        f"AND backfill_batch_id='{BATCH_ID}';",
        f"DELETE FROM tel_feature_manifest WHERE env_id='{ENV_ID}' AND is_backfilled=true "
        f"AND backfill_batch_id='{BATCH_ID}';",
    ]
    import uuid
    NS = uuid.UUID("7e1e0000-0000-4000-a000-0000000000fe")
    for r in frows:
        vec = r[fi["feature_vector"]]
        if isinstance(vec, str):
            vec = json.loads(vec)
        vec_lit = "[" + ",".join(f"{float(x):.6g}" for x in vec) + "]"
        vid = str(uuid.uuid5(NS, f"{r[fi['split']]}:{r[fi['window_index']]}"))
        tc = r[fi["top_contributors"]] or "[]"
        L.append(
            "INSERT INTO tel_fused_state_vectors (id,env_id,business_id,vector_id,dataset,split,"
            "window_index,source_channels,vector_dim,feature_vector,label_any_anomaly,"
            "label_channels_anomalous,recon_error_ae,recon_error_pca,top_contributors,source,"
            "is_backfilled,backfill_batch_id) VALUES ("
            f"{s(vid)},{s(ENV_ID)},{s(BUSINESS_ID)},{s(vid)},'smap_msl',{s(r[fi['split']])},"
            f"{int(r[fi['window_index']])},{s(r[fi['source_channels']])},{int(r[fi['vector_dim']])},"
            f"'{vec_lit}'::vector,{int(r[fi['label_any_anomaly']])},{s(r[fi['label_channels_anomalous']])},"
            f"{float(r[fi['recon_error_ae']])},{float(r[fi['recon_error_pca']])},{s(tc)}::jsonb,"
            f"'public_nasa_analog_dataset',true,{s(BATCH_ID)});")
    for m in manifest:
        L.append(
            "INSERT INTO tel_feature_manifest (id,env_id,business_id,feature_index,chan_id,feature_name,"
            "source_table,calc,leakage_risk,included,is_backfilled,backfill_batch_id) VALUES ("
            f"{s(str(uuid.uuid5(NS, 'man:' + str(m['feature_index']))))},{s(ENV_ID)},{s(BUSINESS_ID)},"
            f"{int(m['feature_index'])},{s(m['chan_id'])},{s(m['feature_name'])},{s(m['source_table'])},"
            f"{s(m['calc'])},{s(m['leakage_risk'])},{str(bool(m['included'])).lower()},true,{s(BATCH_ID)});")
    L.append("COMMIT;")
    L.append(f"SELECT 'fused backfill applied' AS status, "
             f"(SELECT count(*) FROM tel_fused_state_vectors WHERE env_id='{ENV_ID}') AS vectors, "
             f"(SELECT count(*) FROM tel_feature_manifest WHERE env_id='{ENV_ID}') AS manifest_rows;")
    SEED.write_text("\n".join(L))
    print(f"[fused] wrote {SEED.name}: {len(frows)} vectors + {len(manifest)} manifest rows")
    print(f"[fused] selection (first 6): {[x['chan_id'] for x in summary['selection'][:6]]} ...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
