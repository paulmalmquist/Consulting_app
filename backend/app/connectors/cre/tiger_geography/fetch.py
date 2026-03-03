from __future__ import annotations

from app.connectors.cre.base import ConnectorContext


def fetch(_context: ConnectorContext) -> dict:
    return {
        "vintage": 2025,
        "rows": [
            {
                "geography_type": "cbsa",
                "geoid": "33100",
                "name": "Miami-Fort Lauderdale-West Palm Beach, FL",
                "state_code": "FL",
                "cbsa_code": "33100",
                "geometry_geojson": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-80.70, 25.25],
                        [-79.75, 25.25],
                        [-79.75, 26.45],
                        [-80.70, 26.45],
                        [-80.70, 25.25]
                    ]],
                },
            },
            {
                "geography_type": "county",
                "geoid": "12086",
                "name": "Miami-Dade County",
                "state_code": "FL",
                "cbsa_code": "33100",
                "geometry_geojson": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-80.90, 25.10],
                        [-80.10, 25.10],
                        [-80.10, 25.95],
                        [-80.90, 25.95],
                        [-80.90, 25.10]
                    ]],
                },
            },
            {
                "geography_type": "tract",
                "geoid": "12086000100",
                "name": "Census Tract 1, Miami-Dade",
                "state_code": "FL",
                "cbsa_code": "33100",
                "geometry_geojson": {
                    "type": "Polygon",
                    "coordinates": [[
                        [-80.25, 25.74],
                        [-80.17, 25.74],
                        [-80.17, 25.82],
                        [-80.25, 25.82],
                        [-80.25, 25.74]
                    ]],
                },
            },
        ],
    }

