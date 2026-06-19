"""History Rhymes Feature Store connectors (Phase B).

Each connector follows the polymarket triad: a strict live `client` (raises, no
fixture fallback), a pure `normalizer` (raw → canonical readings), and an
inspectable `series_registry` (source contract). Connectors write the SILVER
layer (`hr_fs_readings`) idempotently; tests run on committed fixtures only,
never the network.
"""
