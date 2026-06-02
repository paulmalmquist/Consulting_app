# Pointer — migrations do not live here

Telemetry database migrations follow the repo convention: numbered SQL files in `repo-b/db/schema/`,
not a separate migrations tree in this folder. This keeps them in the single migration sequence the
Supabase tooling and the rest of the platform already use.

Real location (built in Phase 3):

- `repo-b/db/schema/NNN_telemetry_*.sql` — the `NNN` is resolved live at migration time by querying
  `supabase_migrations.schema_migrations` (project `ozboonlsplroialdwuxj`) for the next free number.
  Do not hardcode it; the on-disk numbering is non-monotonic.

Tables (`tel_` prefix, registered in `ARCHITECTURE.md`): `tel_test_runs`, `tel_telemetry_channels`,
`tel_predictions`, `tel_anomaly_events`, `tel_model_runs`, `tel_drift_metrics`. Each carries
`env_id TEXT NOT NULL` + `business_id UUID NOT NULL`, enables RLS, and gets a `tenant_isolation`
policy `USING (env_id = current_setting('app.env_id', true))` with a matching `WITH CHECK`, plus a
`COMMENT ON TABLE`.

Do not put migrations in this folder.
