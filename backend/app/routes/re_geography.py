"""Geography + Market Data API endpoints for Pipeline Map."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.observability.logger import emit_log
from app.schemas.re_geography import (
    ChoroplethEntry,
    GeoDealContextOut,
    GeoMapContextOut,
    GeoOverlayCatalogItem,
    GeocodeResult,
    GeographyFeatureCollection,
    MetricCatalogItem,
    MetricValue,
    PipelineMapFeed,
)
from app.services import re_geography

router = APIRouter(prefix="/api/re/v2/geography", tags=["re-geography"])


def _to_http(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


# ── Polygon Retrieval ────────────────────────────────────────────────────────

@router.get("/geographies", response_model=GeographyFeatureCollection)
def list_geographies(
    geography_type: str = Query(..., description="tract|county|cbsa"),
    sw_lat: float = Query(..., description="Southwest latitude"),
    sw_lon: float = Query(..., description="Southwest longitude"),
    ne_lat: float = Query(..., description="Northeast latitude"),
    ne_lon: float = Query(..., description="Northeast longitude"),
    simplify: bool = Query(True, description="Simplify geometries for performance"),
    max_features: int = Query(2000, le=5000, description="Max features to return"),
):
    """Return GeoJSON FeatureCollection of geographies within a bounding box."""
    try:
        return re_geography.list_geographies(
            geography_type=geography_type,
            sw_lat=sw_lat, sw_lon=sw_lon,
            ne_lat=ne_lat, ne_lon=ne_lon,
            simplify=simplify,
            max_features=max_features,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Metric Catalog ───────────────────────────────────────────────────────────

@router.get("/metrics/catalog", response_model=list[MetricCatalogItem])
def metric_catalog():
    """Return all active metric definitions for layer toggles."""
    try:
        return re_geography.list_metric_catalog()
    except Exception as exc:
        raise _to_http(exc)


@router.get("/overlay-catalog", response_model=list[GeoOverlayCatalogItem])
def overlay_catalog():
    """Return curated overlay definitions for the geo intelligence map."""
    try:
        return re_geography.list_overlay_catalog()
    except Exception as exc:
        raise _to_http(exc)


# ── Choropleth Data ──────────────────────────────────────────────────────────

@router.get("/metrics", response_model=list[ChoroplethEntry])
def choropleth_data(
    geography_type: str = Query(...),
    metric_key: str = Query(...),
    period_start: str | None = Query(None, description="YYYY-MM-DD"),
    sw_lat: float | None = Query(None),
    sw_lon: float | None = Query(None),
    ne_lat: float | None = Query(None),
    ne_lon: float | None = Query(None),
):
    """Return metric values for choropleth rendering."""
    try:
        return re_geography.get_choropleth_data(
            geography_type=geography_type,
            metric_key=metric_key,
            period_start=period_start,
            sw_lat=sw_lat, sw_lon=sw_lon,
            ne_lat=ne_lat, ne_lon=ne_lon,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/map-context", response_model=GeoMapContextOut)
def map_context(
    env_id: str = Query(...),
    geography_level: str = Query(..., description="county|tract|block_group"),
    overlay_key: str = Query(...),
    sw_lat: float = Query(...),
    sw_lon: float = Query(...),
    ne_lat: float = Query(...),
    ne_lon: float = Query(...),
    fund_id: str | None = Query(None),
    strategy: str | None = Query(None),
    sector: str | None = Query(None),
    stage: str | None = Query(None),
    q: str | None = Query(None),
    simplify: bool = Query(True),
):
    """Return choropleth polygons plus nearby pipeline deals for the current viewport."""
    try:
        return re_geography.get_map_context(
            env_id=env_id,
            geography_level=geography_level,
            overlay_key=overlay_key,
            sw_lat=sw_lat,
            sw_lon=sw_lon,
            ne_lat=ne_lat,
            ne_lon=ne_lon,
            fund_id=fund_id,
            strategy=strategy,
            sector=sector,
            stage=stage,
            q=q,
            simplify=simplify,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Tooltip Drilldown ────────────────────────────────────────────────────────

@router.get("/geographies/{geography_type}/{geography_id}/metrics", response_model=list[MetricValue])
def geography_metrics(
    geography_type: str,
    geography_id: str,
    metric_keys: str | None = Query(None, description="Comma-separated metric keys"),
    period_start: str | None = Query(None),
    period_end: str | None = Query(None),
):
    """Return time series metrics for a single geography (tooltip drilldown)."""
    try:
        keys = metric_keys.split(",") if metric_keys else None
        return re_geography.get_geography_metrics(
            geography_id=geography_id,
            metric_keys=keys,
            period_start=period_start,
            period_end=period_end,
        )
    except Exception as exc:
        raise _to_http(exc)


@router.get("/deals/{deal_id}/geo-context", response_model=GeoDealContextOut)
def deal_geo_context(deal_id: str):
    """Return market, hazard, and benchmark context for a selected pipeline deal."""
    try:
        return re_geography.get_deal_geo_context(deal_id=deal_id)
    except Exception as exc:
        raise _to_http(exc)


# ── Pipeline Map Feed ────────────────────────────────────────────────────────

@router.get("/pipeline-map-feed", response_model=PipelineMapFeed)
def pipeline_map_feed(
    env_id: str = Query(...),
    sw_lat: float | None = Query(None),
    sw_lon: float | None = Query(None),
    ne_lat: float | None = Query(None),
    ne_lon: float | None = Query(None),
    status: str | None = Query(None),
):
    """Return pipeline properties as map markers with linked geographies."""
    try:
        return re_geography.get_pipeline_map_feed(
            env_id=env_id,
            sw_lat=sw_lat, sw_lon=sw_lon,
            ne_lat=ne_lat, ne_lon=ne_lon,
            status=status,
        )
    except Exception as exc:
        raise _to_http(exc)


# ── Geocode + Link ───────────────────────────────────────────────────────────

@router.post("/geocode-property/{property_id}", response_model=GeocodeResult)
def geocode_property(property_id: str):
    """Geocode a property and create geography links via spatial join."""
    try:
        return re_geography.geocode_and_link_property(property_id)
    except Exception as exc:
        emit_log(
            level="error", service="backend",
            action="geography.geocode_failed",
            message=str(exc),
            context={"property_id": property_id},
        )
        raise _to_http(exc)


@router.post("/properties/{property_id}/link-geography", response_model=GeocodeResult)
def link_property_geography(property_id: str):
    """Relink a pipeline property to county/tract/block group using the current coordinates."""
    try:
        return re_geography.geocode_and_link_property(property_id)
    except Exception as exc:
        raise _to_http(exc)
