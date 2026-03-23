from app.connectors.cre.base import ConnectorContext
from app.connectors.cre.noaa_storm_events.fetch import fetch
from app.connectors.cre.noaa_storm_events.parse import parse


def smoke_test() -> None:
    ctx = ConnectorContext(run_id="test", source_key="noaa_storm_events", scope="state", filters={})
    rows = parse(fetch(ctx), ctx)
    assert any(row["metric_key"] == "storm_event_count" for row in rows)

