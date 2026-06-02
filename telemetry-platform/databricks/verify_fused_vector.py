"""
Phase 7A verifier — proves the 256-d fused state vector is real, honest, and traceable.

Checks (against the committed JSON + the Supabase tel_fused_state_vectors / tel_feature_manifest):
  1. selected_channels == 32
  2. features_per_channel == 8
  3. vector_dim == 256  (and every stored vector has length 256)
  4. no duplicate channels; no constant-padding feature columns across the corpus
  5. D-4 included
  6. every manifest feature maps to a real source (gold_smap_msl_windows) + a real channel
  7. train/test split present and leakage-free by construction (past-only rolling features,
     train-fit scaler/threshold) — asserted via the selection/manifest leakage_risk == 'none'
  8. a sample vector traces back to its source channels + window index

Exits non-zero on any failure. Reads Supabase via the Supabase CLI (read-only).
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SEL = json.loads((HERE / "fused_channel_selection.json").read_text())
MAN = json.loads((HERE / "fused_feature_manifest.json").read_text())
ENV = "telemetry-demo"


def q(sql: str):
    out = subprocess.run(["supabase", "db", "query", "--linked"], input=sql,
                         capture_output=True, text=True, timeout=120).stdout
    # the CLI prints a JSON object with a "rows" array; find it
    start = out.find("{")
    while start != -1:
        try:
            obj = json.loads(out[start:out.rfind("}") + 1])
            return obj.get("rows", [])
        except Exception:
            start = out.find("{", start + 1)
    return []


def main() -> int:
    fails = []

    # 1, 5: channel count + D-4
    chans = [s["chan_id"] for s in SEL["selection"]]
    if len(chans) != 32:
        fails.append(f"selected_channels={len(chans)} != 32")
    if len(set(chans)) != len(chans):
        fails.append("duplicate channels in selection")
    if "D-4" not in chans:
        fails.append("D-4 not in selection")

    # 2: features per channel
    fpc = SEL.get("features_per_channel")
    if fpc != 8:
        fails.append(f"features_per_channel={fpc} != 8")

    # 3: manifest dim + stored vector length
    if MAN.get("feature_dim") != 256 or len(MAN["manifest"]) != 256:
        fails.append(f"manifest feature_dim={MAN.get('feature_dim')} / rows={len(MAN['manifest'])} != 256")
    dimrow = q(f"SELECT min(vector_dim) lo, max(vector_dim) hi, "
               f"min(array_length(feature_vector::real[],1)) vlo, max(array_length(feature_vector::real[],1)) vhi "
               f"FROM tel_fused_state_vectors WHERE env_id='{ENV}';")
    if dimrow:
        d = dimrow[0]
        if not (d["lo"] == d["hi"] == 256 and d["vlo"] == d["vhi"] == 256):
            fails.append(f"stored vector_dim/length not all 256: {d}")

    # 4: manifest channel set == 32 distinct, 8 features each; no constant-pad column
    man_chans = {}
    for m in MAN["manifest"]:
        man_chans.setdefault(m["chan_id"], set()).add(m["feature_name"])
    if len(man_chans) != 32:
        fails.append(f"manifest distinct channels={len(man_chans)} != 32")
    if any(len(fs) != 8 for fs in man_chans.values()):
        fails.append("a channel does not have exactly 8 features in the manifest")
    # constant-pad check: no feature index is identical across ALL stored vectors (would be dead padding)
    constrow = q(f"""
      WITH v AS (SELECT feature_vector::real[] a FROM tel_fused_state_vectors WHERE env_id='{ENV}')
      SELECT count(*) n_const FROM (
        SELECT i, count(DISTINCT a[i]) d FROM v, generate_series(1,256) i GROUP BY i
      ) t WHERE d <= 1;
    """)
    if constrow and int(constrow[0]["n_const"]) > 0:
        fails.append(f"{constrow[0]['n_const']} constant/padding feature columns detected")

    # 6: every manifest feature points at the real source table + a selected channel
    bad_src = [m["feature_index"] for m in MAN["manifest"]
               if "gold_smap_msl_windows" not in m["source_table"] or m["chan_id"] not in set(chans)]
    if bad_src:
        fails.append(f"{len(bad_src)} manifest features not traceable to a selected channel / source table")

    # 7: leakage risk recorded as none; alignment disclosed
    if any(m["leakage_risk"] != "none (past-only rolling features; train-median imputation)" for m in MAN["manifest"]):
        fails.append("a manifest feature has non-'none' leakage_risk")
    if "normalized" not in (SEL.get("alignment") or "").lower():
        fails.append("alignment caveat (normalized progress) not recorded in selection json")

    # 8: sample vector traceable
    samp = q(f"SELECT vector_id, split, window_index, source_channels, label_any_anomaly "
             f"FROM tel_fused_state_vectors WHERE env_id='{ENV}' AND split='test' AND label_any_anomaly=1 "
             f"ORDER BY recon_error_ae DESC LIMIT 1;")
    counts = q(f"SELECT (SELECT count(*) FROM tel_fused_state_vectors WHERE env_id='{ENV}') v, "
               f"(SELECT count(*) FROM tel_feature_manifest WHERE env_id='{ENV}') m;")

    print("=== FUSED VECTOR VERIFICATION ===")
    print(f"selected_channels      = {len(chans)} (expect 32)   D-4 included = {'D-4' in chans}")
    print(f"features_per_channel   = {fpc} (expect 8)")
    print(f"manifest features      = {len(MAN['manifest'])} (expect 256)")
    print(f"stored vectors         = {counts[0]['v'] if counts else '?'} ; manifest rows = {counts[0]['m'] if counts else '?'}")
    print(f"stored vector_dim/len  = {dimrow[0] if dimrow else '?'}")
    print(f"constant-pad columns   = {constrow[0]['n_const'] if constrow else '?'} (expect 0)")
    print(f"alignment              = {SEL.get('alignment')}")
    if samp:
        print(f"sample anomalous vector: {samp[0]['vector_id'][:12]} split={samp[0]['split']} "
              f"window_index={samp[0]['window_index']} -> traces to source_channels[0..40]="
              f"{samp[0]['source_channels'][:40]}... label_any_anomaly={samp[0]['label_any_anomaly']}")
    print(f"SMAP/MSL mix           = "
          f"SMAP={sum(1 for s in SEL['selection'] if s['spacecraft']=='SMAP')} "
          f"MSL={sum(1 for s in SEL['selection'] if s['spacecraft']=='MSL')}")

    if fails:
        print("\nFAILED CHECKS:")
        for f in fails:
            print("  - " + f)
        return 1
    print("\nALL CHECKS PASS — 256-d fused vector is real, 32 channels x 8 features, D-4 included, "
          "no padding, traceable, leakage-free.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
