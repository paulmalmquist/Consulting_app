"""Read-only provider adapters. Each NORMALIZES mocked/provided read-only output
into ProviderInventoryObservation rows; none executes a command in PR 3.

The adapter contract is deliberately parse-only: an adapter is handed the raw
read-only output (e.g. parsed ACCOUNT_USAGE rows or `databricks ... --output json`)
and returns observations. Live fetching (running the list/describe/SELECT) is a
later concern; PR 3 proves the *normalization + fail-closed* pattern with mocks
and never reaches a provider or needs credentials.
"""
from __future__ import annotations

from app.services.ade_ops.cloud.models import (
    CloudProvider,
    ProviderInventoryObservation,
    ProviderStatus,
)

# The set of read-only verbs an adapter is ever allowed to be associated with.
# Used by a test to prove no write/mutating verb is present anywhere here.
READ_ONLY_VERBS = frozenset({"list", "describe", "get", "show", "select", "ls", "query_history"})


def _obs(provider: CloudProvider, *, evidence_source: str, status: ProviderStatus,
         **kw) -> ProviderInventoryObservation:
    return ProviderInventoryObservation(
        provider=provider, evidence_source=evidence_source, status=status, **kw)


def _not_configured(provider: CloudProvider, evidence_source: str,
                    null_reason: str) -> list[ProviderInventoryObservation]:
    """A single status observation explaining why nothing could be read."""
    return [_obs(provider, evidence_source=evidence_source,
                 status=ProviderStatus.NOT_CONFIGURED, null_reason=null_reason)]


# ── Snowflake (ACCOUNT_USAGE-style mocked rows) ───────────────────────────────

def snowflake(mock_rows: list[dict] | None = None, *, account: str | None = None) -> list[ProviderInventoryObservation]:
    src = "snowflake ACCOUNT_USAGE (mocked)"
    if mock_rows is None:
        return _not_configured(CloudProvider.SNOWFLAKE, src, "snowflake_cli_or_account_not_configured")
    if not account:
        return _not_configured(CloudProvider.SNOWFLAKE, src, "snowflake_account_not_set")
    out = []
    for r in mock_rows:
        rtype = r.get("resource_type", "warehouse")  # warehouse|task|dynamic_table|query
        out.append(_obs(
            CloudProvider.SNOWFLAKE, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=account, region=r.get("region"),
            resource_type=rtype, resource_id=r.get("name"), display_name=r.get("name"),
            observed_at=r.get("observed_at"),
            runtime_observation_available=rtype in {"warehouse", "task", "query"},
            cost_observation_available=("credits_used" in r or rtype == "warehouse"),
            freshness_observation_available=rtype in {"task", "dynamic_table"},
            raw_summary={k: v for k, v in r.items() if k not in {"resource_type", "name", "region", "observed_at"}},
        ))
    return out or _not_configured(CloudProvider.SNOWFLAKE, src, "snowflake_no_rows_returned")


# ── Databricks (jobs/runs/cluster CLI JSON) ───────────────────────────────────

def databricks(mock_json: dict | None = None, *, workspace: str | None = None) -> list[ProviderInventoryObservation]:
    src = "databricks CLI --output json (mocked)"
    if mock_json is None:
        return _not_configured(CloudProvider.DATABRICKS, src, "databricks_cli_or_token_not_configured")
    if not workspace:
        return _not_configured(CloudProvider.DATABRICKS, src, "databricks_workspace_not_set")
    out = []
    for job in mock_json.get("jobs", []):
        out.append(_obs(
            CloudProvider.DATABRICKS, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=workspace, resource_type="job",
            resource_id=str(job.get("job_id")), display_name=(job.get("settings", {}) or {}).get("name") or job.get("name"),
            runtime_observation_available=True, cost_observation_available=True,
            freshness_observation_available=bool(job.get("schedule")),
            raw_summary={"schedule": job.get("schedule")},
        ))
    for cl in mock_json.get("clusters", []):
        out.append(_obs(
            CloudProvider.DATABRICKS, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=workspace, resource_type="cluster",
            resource_id=cl.get("cluster_id"), display_name=cl.get("cluster_name"),
            runtime_observation_available=True, cost_observation_available=True,
            raw_summary={"state": cl.get("state"), "node_type_id": cl.get("node_type_id")},
        ))
    return out or _not_configured(CloudProvider.DATABRICKS, src, "databricks_no_resources_returned")


# ── GCP (Dataproc/BigQuery/billing-export gcloud/bq JSON) ─────────────────────

def gcp(mock_json: dict | None = None, *, project: str | None = None) -> list[ProviderInventoryObservation]:
    src = "gcloud/bq --format json (mocked)"
    if mock_json is None:
        return _not_configured(CloudProvider.GCP, src, "gcloud_or_adc_not_configured")
    if not project:
        return _not_configured(CloudProvider.GCP, src, "gcp_project_not_set")
    out = []
    for c in mock_json.get("dataproc_clusters", []):
        out.append(_obs(
            CloudProvider.GCP, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=project, region=c.get("region"), resource_type="dataproc_cluster",
            resource_id=c.get("clusterName"), display_name=c.get("clusterName"),
            runtime_observation_available=True, cost_observation_available=True,
            raw_summary={"status": (c.get("status") or {}).get("state")},
        ))
    for ds in mock_json.get("bigquery_datasets", []):
        out.append(_obs(
            CloudProvider.GCP, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=project, region=ds.get("location"), resource_type="bigquery_dataset",
            resource_id=ds.get("datasetId") or (ds.get("datasetReference") or {}).get("datasetId"),
            display_name=ds.get("datasetId") or (ds.get("datasetReference") or {}).get("datasetId"),
            cost_observation_available=bool(mock_json.get("billing_export_configured")),
            freshness_observation_available=True,
            raw_summary={"billing_export_configured": bool(mock_json.get("billing_export_configured"))},
        ))
    return out or _not_configured(CloudProvider.GCP, src, "gcp_no_resources_returned")


# ── AWS (Glue/EMR/Athena/Compute Optimizer/CUR aws CLI JSON) ──────────────────

def aws(mock_json: dict | None = None, *, account: str | None = None, region: str | None = None) -> list[ProviderInventoryObservation]:
    src = "aws CLI --output json (mocked)"
    if mock_json is None:
        return _not_configured(CloudProvider.AWS, src, "aws_cli_or_credentials_not_configured")
    if not account:
        return _not_configured(CloudProvider.AWS, src, "aws_account_not_set")
    if not region:
        return _not_configured(CloudProvider.AWS, src, "aws_region_not_set")
    out = []
    for name in mock_json.get("glue_jobs", []):
        out.append(_obs(
            CloudProvider.AWS, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=account, region=region, resource_type="glue_job",
            resource_id=name, display_name=name,
            runtime_observation_available=True, cost_observation_available=True))
    for cl in mock_json.get("emr_clusters", []):
        out.append(_obs(
            CloudProvider.AWS, evidence_source=src, status=ProviderStatus.CONFIGURED,
            account_or_workspace=account, region=region, resource_type="emr_cluster",
            resource_id=cl.get("Id"), display_name=cl.get("Name"),
            runtime_observation_available=True, cost_observation_available=bool(mock_json.get("cur_configured")),
            raw_summary={"state": (cl.get("Status") or {}).get("State")}))
    if mock_json.get("athena_workgroups"):
        for wg in mock_json["athena_workgroups"]:
            out.append(_obs(
                CloudProvider.AWS, evidence_source=src, status=ProviderStatus.CONFIGURED,
                account_or_workspace=account, region=region, resource_type="athena_workgroup",
                resource_id=wg, display_name=wg, runtime_observation_available=True))
    return out or _not_configured(CloudProvider.AWS, src, "aws_no_resources_returned")


ADAPTERS = {
    CloudProvider.SNOWFLAKE: snowflake,
    CloudProvider.DATABRICKS: databricks,
    CloudProvider.GCP: gcp,
    CloudProvider.AWS: aws,
}
