"""ADE Ops PR 3 — read-only cloud inventory adapters (mocked output only)."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/test")

from app.services.ade_ops.cloud import adapters, providers  # noqa: E402
from app.services.ade_ops.cloud.models import CloudProvider, ProviderStatus  # noqa: E402
from app.services.ade_ops.models import OpsConfidence, OpsNullReason, OpsStatus  # noqa: E402
from app.services.ade_ops.models import OpsCommandRequest  # noqa: E402
from app.services.ade_ops.supervisor import run_skill  # noqa: E402

BIZ = "00000000-0000-0000-0000-000000000001"


# ── Fail closed by default (no creds, the CI/default path) ────────────────────

def test_every_adapter_not_configured_without_input():
    for fn, reason_frag in [
        (adapters.snowflake, "snowflake"), (adapters.databricks, "databricks"),
        (adapters.gcp, "gcloud"), (adapters.aws, "aws"),
    ]:
        obs = fn(None)
        assert len(obs) == 1
        assert obs[0].status is ProviderStatus.NOT_CONFIGURED
        assert obs[0].null_reason and reason_frag in obs[0].null_reason
        assert obs[0].observed_at is None  # nothing read -> no fabricated timestamp
        assert obs[0].rightsizing_candidate_available is False


def test_missing_identity_fails_closed_even_with_rows():
    # rows present but no account/workspace/project/region -> explicit null_reason
    assert adapters.snowflake([{"name": "WH1"}], account=None)[0].null_reason == "snowflake_account_not_set"
    assert adapters.databricks({"jobs": [{"job_id": 1}]}, workspace=None)[0].null_reason == "databricks_workspace_not_set"
    assert adapters.gcp({"dataproc_clusters": [{"clusterName": "c"}]}, project=None)[0].null_reason == "gcp_project_not_set"
    assert adapters.aws({"glue_jobs": ["g"]}, account=None, region="us-east-1")[0].null_reason == "aws_account_not_set"
    assert adapters.aws({"glue_jobs": ["g"]}, account="123", region=None)[0].null_reason == "aws_region_not_set"


# ── Normalize mocked output into the ONE shared model ─────────────────────────

def test_snowflake_normalizes_to_observation():
    obs = adapters.snowflake(
        [{"resource_type": "warehouse", "name": "ANALYTICS_WH", "region": "us-west-2",
          "credits_used": 42, "observed_at": "2026-06-17T00:00:00Z"}],
        account="xy12345")
    o = obs[0]
    assert o.provider is CloudProvider.SNOWFLAKE and o.status is ProviderStatus.CONFIGURED
    assert o.account_or_workspace == "xy12345" and o.resource_type == "warehouse"
    assert o.runtime_observation_available and o.cost_observation_available
    assert o.rightsizing_candidate_available is False  # never True in PR 3
    assert o.raw_summary.get("credits_used") == 42      # provider detail in raw_summary only


def test_databricks_gcp_aws_normalize():
    db = adapters.databricks({"jobs": [{"job_id": 9, "settings": {"name": "etl"}, "schedule": {}}],
                              "clusters": [{"cluster_id": "c1", "cluster_name": "shared"}]}, workspace="ws")
    assert {o.resource_type for o in db} == {"job", "cluster"}
    g = adapters.gcp({"dataproc_clusters": [{"clusterName": "dp", "region": "us-central1"}],
                      "bigquery_datasets": [{"datasetId": "sales", "location": "US"}],
                      "billing_export_configured": True}, project="proj-1")
    assert any(o.resource_type == "bigquery_dataset" and o.cost_observation_available for o in g)
    a = adapters.aws({"glue_jobs": ["g1"], "emr_clusters": [{"Id": "j-1", "Name": "emr"}],
                      "cur_configured": True}, account="111122223333", region="us-east-1")
    assert {o.resource_type for o in a} == {"glue_job", "emr_cluster"}


# ── No write verb anywhere (the read-only wall) ───────────────────────────────

def test_adapters_module_has_no_write_verbs():
    import inspect
    src = inspect.getsource(adapters).lower()
    WRITE = ("alter ", "drop ", "create warehouse", "terminate", "modify-instance",
             "delete", "update-job", "run-now", "start-job-run", "resize", "insert ")
    for tok in WRITE:
        assert tok not in src, f"adapters must be read-only; found write token {tok!r}"
    # And the declared verb allowlist is read-only only.
    assert all(v in {"list", "describe", "get", "show", "select", "ls", "query_history"}
               for v in adapters.READ_ONLY_VERBS)


# ── Provider rollup ───────────────────────────────────────────────────────────

def test_all_provider_status_defaults_not_configured():
    for st in providers.all_provider_status():
        assert st.status is ProviderStatus.NOT_CONFIGURED
        assert st.null_reason and st.resource_count == 0


def test_config_status_configured_with_mock():
    st = providers.config_status(CloudProvider.SNOWFLAKE,
                                 mock={"rows": [{"resource_type": "warehouse", "name": "W"}], "account": "a1"})
    assert st.status is ProviderStatus.CONFIGURED and st.resource_count == 1
    assert st.cost_observation_available


# ── Executor wiring (through the supervisor) ──────────────────────────────────

def _run(skill, **inputs):
    return run_skill(OpsCommandRequest(skill=skill, inputs=inputs, business_id=BIZ, env_id="env-1"))


def test_scan_pipelines_reports_provider_config_status(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    monkeypatch.setattr("app.services.governance.list_decisions", lambda b, **k: [])
    r = _run("ade.inventory.scan_pipelines")
    labels = {e.label for e in r.evidence}
    assert {"cloud:snowflake", "cloud:databricks", "cloud:gcp", "cloud:aws"} <= labels
    # default = not_configured, surfaced honestly with the reason
    snow = next(e for e in r.evidence if e.label == "cloud:snowflake")
    assert "not_configured" in str(snow.value)


def test_cost_hotspots_availability_only_blocked_by_default(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.cost.show_hotspots")
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED
    assert r.recommendation is None
    # still reports per-provider cost-observation availability as evidence
    assert any(e.label.startswith("cost_observation:") for e in r.evidence)


def test_rightsize_still_recommendation_disabled(monkeypatch):
    monkeypatch.setattr("app.services.governance.record_decision", lambda **k: "rid")
    r = _run("ade.compute.recommend_rightsize")
    assert r.status == OpsStatus.BLOCKED
    assert r.null_reason == OpsNullReason.DATA_SOURCE_NOT_CONFIGURED
    assert r.recommendation is None
    # confidence import kept meaningful
    assert OpsConfidence.LOW  # sanity
