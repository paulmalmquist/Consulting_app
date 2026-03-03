"""Service layer for Geography + Market Data queries."""
from __future__ import annotations

from app.db import get_cursor


def list_geographies(
    geography_type: str,
    sw_lat: float,
    sw_lon: float,
    ne_lat: float,
    ne_lon: float,
    simplify: bool = True,
    max_features: int = 2000,
) -> dict:
    """Return GeoJSON FeatureCollection of geographies within a bounding box."""
    # Use ST_SimplifyPreserveTopology for tract-level to reduce payload
    simplify_tolerance = 0.001 if simplify and geography_type == "tract" else 0.0005

    geom_select = (
        f"ST_AsGeoJSON(ST_SimplifyPreserveTopology(g.geom, {simplify_tolerance}))::json"
        if simplify
        else "ST_AsGeoJSON(g.geom)::json"
    )

    with get_cursor() as cur:
        cur.execute(
            f"""
            SELECT
                g.geography_id,
                g.geography_type,
                g.name,
                g.state_fips,
                g.county_fips,
                g.cbsa_code,
                g.centroid_lat::float,
                g.centroid_lon::float,
                g.area_sq_miles::float,
                {geom_select} AS geometry
            FROM dim_geography g
            WHERE g.geography_type = %s
              AND g.centroid_lat BETWEEN %s AND %s
              AND g.centroid_lon BETWEEN %s AND %s
            LIMIT %s
            """,
            (geography_type, sw_lat, ne_lat, sw_lon, ne_lon, max_features),
        )
        rows = cur.fetchall()

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "id": row["geography_id"],
            "properties": {
                "geography_id": row["geography_id"],
                "geography_type": row["geography_type"],
                "name": row["name"],
                "state_fips": row["state_fips"],
                "county_fips": row["county_fips"],
                "cbsa_code": row["cbsa_code"],
                "centroid_lat": row["centroid_lat"],
                "centroid_lon": row["centroid_lon"],
                "area_sq_miles": row["area_sq_miles"],
            },
            "geometry": row["geometry"],
        })

    return {
        "type": "FeatureCollection",
        "features": features,
        "total_count": len(features),
    }


def list_metric_catalog() -> list[dict]:
    """Return all active metric definitions."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT metric_key, display_name, description, units,
                   grain_supported, geography_types_supported,
                   source_name, source_url, color_scale, is_active
            FROM dim_metric
            WHERE is_active = true
            ORDER BY display_name
            """
        )
        return cur.fetchall()


def get_choropleth_data(
    geography_type: str,
    metric_key: str,
    period_start: str | None = None,
    sw_lat: float | None = None,
    sw_lon: float | None = None,
    ne_lat: float | None = None,
    ne_lon: float | None = None,
) -> list[dict]:
    """Return metric values for choropleth rendering within a viewport."""
    with get_cursor() as cur:
        params: list = [geography_type, metric_key]
        bbox_clause = ""

        if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
            params.extend([sw_lat, ne_lat, sw_lon, ne_lon])
            bbox_clause = """
                AND g.centroid_lat BETWEEN %s AND %s
                AND g.centroid_lon BETWEEN %s AND %s
            """

        period_clause = ""
        if period_start:
            params.append(period_start)
            period_clause = "AND f.period_start = %s"

        cur.execute(
            f"""
            SELECT DISTINCT ON (f.geography_id)
                f.geography_id,
                f.value::float,
                f.units,
                f.dataset_vintage,
                f.source_name
            FROM fact_market_metric f
            JOIN dim_geography g ON g.geography_id = f.geography_id
            WHERE g.geography_type = %s
              AND f.metric_key = %s
              {bbox_clause}
              {period_clause}
            ORDER BY f.geography_id, f.period_start DESC
            """,
            params,
        )
        return cur.fetchall()


def get_geography_metrics(
    geography_id: str,
    metric_keys: list[str] | None = None,
    period_start: str | None = None,
    period_end: str | None = None,
) -> list[dict]:
    """Return time series of metrics for a single geography."""
    with get_cursor() as cur:
        params: list = [geography_id]
        key_clause = ""
        period_clause = ""

        if metric_keys:
            params.append(tuple(metric_keys))
            key_clause = "AND f.metric_key IN %s"

        if period_start:
            params.append(period_start)
            period_clause += "AND f.period_start >= %s"
        if period_end:
            params.append(period_end)
            period_clause += "AND f.period_start <= %s"

        cur.execute(
            f"""
            SELECT
                f.geography_id,
                f.metric_key,
                f.period_start,
                f.period_grain,
                f.value::float,
                f.units,
                f.source_name,
                f.dataset_vintage,
                m.display_name,
                m.color_scale
            FROM fact_market_metric f
            JOIN dim_metric m ON m.metric_key = f.metric_key
            WHERE f.geography_id = %s
              {key_clause}
              {period_clause}
            ORDER BY f.metric_key, f.period_start DESC
            """,
            params,
        )
        return cur.fetchall()


def get_pipeline_map_feed(
    env_id: str,
    sw_lat: float | None = None,
    sw_lon: float | None = None,
    ne_lat: float | None = None,
    ne_lon: float | None = None,
    status: str | None = None,
) -> dict:
    """Return pipeline properties as map markers with linked geographies."""
    with get_cursor() as cur:
        params: list = [env_id]
        bbox_clause = ""
        status_clause = ""

        if all(v is not None for v in (sw_lat, sw_lon, ne_lat, ne_lon)):
            params.extend([sw_lat, ne_lat, sw_lon, ne_lon])
            bbox_clause = """
                AND p.lat BETWEEN %s AND %s
                AND p.lon BETWEEN %s AND %s
            """

        if status:
            params.append(status)
            status_clause = "AND d.status = %s"

        cur.execute(
            f"""
            SELECT
                p.property_id::text,
                p.deal_id::text,
                p.property_name,
                p.address,
                p.lat::float,
                p.lon::float,
                d.deal_name,
                d.status AS deal_status
            FROM re_pipeline_property p
            LEFT JOIN re_pipeline_deal d ON d.deal_id = p.deal_id
            WHERE d.env_id = %s::uuid
              AND p.lat IS NOT NULL
              AND p.lon IS NOT NULL
              {bbox_clause}
              {status_clause}
            ORDER BY d.deal_name, p.property_name
            """,
            params,
        )
        properties = cur.fetchall()

    # Enrich with linked geographies
    markers = []
    for prop in properties:
        geographies = []
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT pgl.geography_type, pgl.geography_id, g.name
                FROM property_geography_link pgl
                JOIN dim_geography g ON g.geography_id = pgl.geography_id
                WHERE pgl.property_id = %s::uuid
                """,
                (prop["property_id"],),
            )
            for link in cur.fetchall():
                geographies.append({
                    "geography_type": link["geography_type"],
                    "geography_id": link["geography_id"],
                    "name": link["name"],
                })

        markers.append({**prop, "geographies": geographies})

    return {"markers": markers, "total_count": len(markers)}


def geocode_and_link_property(property_id: str) -> dict:
    """Geocode a property address and create geography links via spatial join."""
    with get_cursor() as cur:
        # Get property lat/lon
        cur.execute(
            "SELECT property_id::text, lat::float, lon::float, address FROM re_pipeline_property WHERE property_id = %s::uuid",
            (property_id,),
        )
        prop = cur.fetchone()
        if not prop:
            raise LookupError(f"Property {property_id} not found")

        lat, lon = prop["lat"], prop["lon"]
        if lat is None or lon is None:
            raise ValueError(f"Property {property_id} has no coordinates. Geocode the address first.")

        # Spatial join: find containing geographies
        cur.execute(
            """
            SELECT geography_id, geography_type, name
            FROM dim_geography
            WHERE ST_Contains(geom, ST_SetSRID(ST_Point(%s, %s), 4326))
            """,
            (lon, lat),  # PostGIS Point is (lon, lat)
        )
        matches = cur.fetchall()

        linked = []
        for match in matches:
            cur.execute(
                """
                INSERT INTO property_geography_link
                    (property_id, geography_type, geography_id, link_method, confidence)
                VALUES (%s::uuid, %s, %s, 'geocode+spatial_join', 1.0)
                ON CONFLICT (property_id, geography_type) DO UPDATE
                SET geography_id = EXCLUDED.geography_id, linked_at = now()
                """,
                (property_id, match["geography_type"], match["geography_id"]),
            )
            linked.append({
                "geography_type": match["geography_type"],
                "geography_id": match["geography_id"],
                "name": match["name"],
            })

    return {
        "property_id": property_id,
        "lat": lat,
        "lon": lon,
        "linked_geographies": linked,
    }
