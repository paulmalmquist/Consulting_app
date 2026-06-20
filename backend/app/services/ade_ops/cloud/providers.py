"""Roll provider observations into per-provider config status for scan/cost.

In PR 3 there is no live fetch wired: with no injected read-only output, every
provider resolves to ``not_configured`` with an explicit null_reason. A caller
(or a test) can inject mocked output via ``inventory(..., mock=...)`` to exercise
the configured path. Env-var presence is NEVER treated as "configured" — only a
real (here: mocked) read producing usable rows flips a provider to configured.
"""
from __future__ import annotations

from app.services.ade_ops.cloud.adapters import ADAPTERS
from app.services.ade_ops.cloud.models import (
    CloudProvider,
    ProviderConfigStatus,
    ProviderInventoryObservation,
    ProviderStatus,
)


def inventory(provider: CloudProvider, *, mock: dict | None = None) -> list[ProviderInventoryObservation]:
    """Return normalized observations for one provider.

    ``mock`` carries the read-only output + identity an adapter needs, e.g.
    ``{"rows": [...], "account": "..."}`` (snowflake) or ``{"json": {...}, "workspace": "..."}``.
    With ``mock`` None (the live/CI default), the adapter returns a single
    not_configured observation — no provider call, no fabrication.
    """
    fn = ADAPTERS[provider]
    if mock is None:
        return fn(None)  # not_configured path
    if provider is CloudProvider.SNOWFLAKE:
        return fn(mock.get("rows"), account=mock.get("account"))
    if provider is CloudProvider.DATABRICKS:
        return fn(mock.get("json"), workspace=mock.get("workspace"))
    if provider is CloudProvider.GCP:
        return fn(mock.get("json"), project=mock.get("project"))
    if provider is CloudProvider.AWS:
        return fn(mock.get("json"), account=mock.get("account"), region=mock.get("region"))
    return fn(None)


def config_status(provider: CloudProvider, *, mock: dict | None = None) -> ProviderConfigStatus:
    obs = inventory(provider, mock=mock)
    configured = [o for o in obs if o.status is ProviderStatus.CONFIGURED]
    if not configured:
        first = obs[0] if obs else None
        return ProviderConfigStatus(
            provider=provider,
            status=(first.status if first else ProviderStatus.NOT_CONFIGURED),
            null_reason=(first.null_reason if first else "no_observation"),
            evidence_source=(first.evidence_source if first else None),
        )
    return ProviderConfigStatus(
        provider=provider, status=ProviderStatus.CONFIGURED, null_reason=None,
        resource_count=len(configured),
        runtime_observation_available=any(o.runtime_observation_available for o in configured),
        cost_observation_available=any(o.cost_observation_available for o in configured),
        freshness_observation_available=any(o.freshness_observation_available for o in configured),
        evidence_source=configured[0].evidence_source,
    )


def all_provider_status(mocks: dict[CloudProvider, dict] | None = None) -> list[ProviderConfigStatus]:
    """Status for all four providers. ``mocks`` (test/caller-injected) maps a
    provider to its mocked read-only output; absent providers are not_configured."""
    mocks = mocks or {}
    return [config_status(p, mock=mocks.get(p)) for p in CloudProvider]
