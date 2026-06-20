"""Strict live DefiLlama client (public, keyless). Lazy httpx; raises on error
(no fixture fallback). Fetches the total stablecoin supply history chart. Never
called in unit/CI tests.
"""

from __future__ import annotations

from typing import Any

from .config import DefiLlamaSettings


class DefiLlamaFetchError(RuntimeError):
    """DefiLlama API returned a non-success response or unparseable body."""


def fetch_stablecoin_chart(*, limit: int | None = None, settings: DefiLlamaSettings | None = None) -> Any:
    """Fetch the total stablecoin circulating-supply history (daily). Live only."""
    settings = settings or DefiLlamaSettings.from_env()
    url = f"{settings.base_url}/stablecoincharts/all"

    import httpx  # noqa: PLC0415 — lazy; live path only

    try:
        resp = httpx.get(url, timeout=settings.timeout_seconds)
    except Exception as exc:
        raise DefiLlamaFetchError(f"DefiLlama request failed: {exc}") from exc
    if resp.status_code != 200:
        raise DefiLlamaFetchError(f"DefiLlama → HTTP {resp.status_code}")
    try:
        return resp.json()
    except Exception as exc:
        raise DefiLlamaFetchError("DefiLlama returned unparseable JSON") from exc
