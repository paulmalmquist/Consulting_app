-- 10040_telemetry_anomaly_challenger_metrics.sql
-- Backfill the honest range-aware metrics onto the anomaly CHALLENGER row (tel_anomaly_pca) so the
-- Model Registry's challenger bars (Affiliation F1, F1 point-wise honest, Event recall, Alarm precision)
-- show REAL numbers instead of "n/a". These were recomputed on the identical SMAP/MSL test windows with
-- the identical metric code as the champion (telemetry-platform/gcp/eval_challengers.py); the champion
-- MAD reproduction matched its persisted honest metrics exactly (fidelity gate), so champion-vs-challenger
-- honest bars are on the same basis. Legacy point-adjusted f1/precision/recall are left untouched.
-- Idempotent: jsonb merge (||) re-applies cleanly. Audit receipt: backend/app/data/telemetry/anomaly_challenger_receipt.json
UPDATE tel_model_runs
   SET metrics = COALESCE(metrics, '{}'::jsonb) || '{"f1_pointwise": 0.030281, "precision_pointwise": 0.25284, "recall_pointwise": 0.016105, "event_recall": 0.682692, "alarm_precision": 0.25284, "affiliation_f1": 0.387646, "affiliation_precision": 0.270128, "affiliation_recall": 0.686154, "affiliation_cap_d_ticks": 50, "labeled_segments": 104, "honest_metrics_note": "Honest range-aware metrics recomputed on the SAME SMAP/MSL test windows and SAME metric code as the champion (telemetry-platform/gcp/eval_challengers.py); the champion MAD reproduction matched its persisted affiliation_f1/f1_pointwise/event_recall exactly. Legacy point-adjusted f1/precision/recall left as originally recorded.", "honest_eval_source": "eval_challengers.py @ smap_msl raw arrays (champion-parity validated)"}'::jsonb,
       gate    = COALESCE(gate, '{}'::jsonb) || '{"decision": "held_comparison", "selected_over": null, "primary_metric": "affiliation_f1", "champion_affiliation_f1": 0.474634, "challenger_affiliation_f1": 0.387646, "champion_ahead": true, "note": "PCA reconstruction challenger vs rolling-MAD champion; champion leads on every honest axis."}'::jsonb
 WHERE env_id = 'telemetry-demo'
   AND business_id = '7e1eb000-0000-4000-a000-000000000001'
   AND model_kind = 'anomaly'
   AND model_name = 'tel_anomaly_pca';
