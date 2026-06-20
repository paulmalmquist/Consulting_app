"""Confluent feature consumer that persists auditable divergence forecasts."""

from __future__ import annotations

import logging

from app.events.envelope import EventEnvelope
from app.events.protobuf_codec import build_confluent_conf
from app.events.publisher import publish_event
from app.services.hr_polymarket.analog_provider import (
    HistoricalOutcomeError,
    HistoricalOutcomeProvider,
)
from app.services.hr_polymarket.calibration import CalibrationRegistry
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.forecast import (
    CalibrationEvidence,
    EventForecast,
    build_event_forecast,
    parse_forecast_question,
)
from app.services.hr_polymarket.models import FeatureSnapshot, MarketDefinition
from app.services.hr_polymarket.repository import PolymarketRepository

logger = logging.getLogger("app.hr_polymarket.forecast")


class PolymarketForecastWorker:
    def __init__(
        self,
        settings: PolymarketSettings,
        *,
        repository: PolymarketRepository | None = None,
        outcome_provider: HistoricalOutcomeProvider | None = None,
        calibration_registry: CalibrationRegistry | None = None,
        publisher=publish_event,
    ) -> None:
        self.settings = settings
        self.repository = repository or PolymarketRepository()
        self.outcome_provider = outcome_provider or HistoricalOutcomeProvider()
        self.calibration_registry = calibration_registry or CalibrationRegistry.from_path(
            settings.calibration_path
        )
        self.publisher = publisher

    def run_forever(self) -> None:
        if not self.settings.enabled:
            logger.info("Polymarket forecast worker disabled")
            return

        from confluent_kafka import Consumer

        config = build_confluent_conf(group_id="winston-hr-polymarket-forecast-v1")
        config.update(
            {
                "client.id": "winston-hr-polymarket-forecast",
                "auto.offset.reset": "earliest",
                "enable.auto.commit": False,
            }
        )
        consumer = Consumer(config)
        consumer.subscribe([self.settings.features_topic])
        try:
            while True:
                message = consumer.poll(1.0)
                if message is None:
                    continue
                if message.error():
                    raise RuntimeError(str(message.error()))
                self.process_wire(message.value())
                consumer.commit(message=message, asynchronous=False)
        finally:
            consumer.close()

    def process_wire(self, raw: bytes) -> EventForecast:
        envelope = EventEnvelope.model_validate_json(raw)
        feature = FeatureSnapshot.model_validate(envelope.payload)
        market_row = self.repository.get_market(feature.market_id)
        if market_row is None:
            raise RuntimeError(
                f"Polymarket market metadata missing for {feature.market_id}"
            )
        market = _market_from_row(market_row)
        parsed = parse_forecast_question(
            market.question,
            resolution_source=market.resolution_source,
        )
        question_id = self.repository.upsert_question(market.market_id, parsed)
        family_calibration = self.calibration_registry.get(parsed.family)
        calibration = self._with_live_stats(parsed.family, family_calibration)

        analogs = []
        provider_error = None
        if (
            parsed.mapping_status == "eligible"
            and calibration is not None
            and calibration.offline_passes
            and not feature.connection_stale
            and feature.yes_probability is not None
        ):
            try:
                analogs = self.outcome_provider.build_observations(
                    parsed,
                    forecast_at=feature.bucket_at,
                    limit=20,
                )
            except HistoricalOutcomeError as exc:
                provider_error = str(exc)

        if provider_error:
            forecast = EventForecast(
                forecast_at=feature.bucket_at,
                p_polymarket=feature.yes_probability,
                forecast_status="withheld",
                null_reason=f"historical_outcomes_unavailable:{provider_error}",
                calibration=calibration.model_dump() if calibration else {},
            )
        else:
            forecast = build_event_forecast(
                parsed,
                forecast_at=feature.bucket_at,
                p_polymarket=feature.yes_probability,
                p_base=family_calibration.p_base if family_calibration else 0.5,
                analogs=analogs,
                calibration=calibration,
                inputs_stale=feature.connection_stale
                or feature.null_reason is not None,
            )

        forecast_id = self.repository.insert_forecast(question_id, forecast)
        output = EventEnvelope(
            event_type="hr.polymarket.forecast",
            idempotency_key=f"hr.polymarket.forecast:{forecast_id}",
            occurred_at=forecast.forecast_at,
            source_service="hr-polymarket-forecast",
            payload={
                "forecast_id": forecast_id,
                "question_id": question_id,
                "market_id": market.market_id,
                "question": parsed.model_dump(mode="json"),
                "forecast": forecast.model_dump(mode="json"),
            },
        )
        if not self.publisher(
            self.settings.forecasts_topic,
            output,
            key=market.market_id,
        ):
            raise RuntimeError("required Polymarket forecast publish failed")
        return forecast

    def _with_live_stats(
        self,
        family: str | None,
        family_calibration,
    ) -> CalibrationEvidence | None:
        if family_calibration is None or family is None:
            return None
        stats = self.repository.get_live_resolution_stats(family)
        return family_calibration.evidence.model_copy(
            update={
                "live_resolutions": stats.get("live_resolutions") or 0,
                "live_window_days": stats.get("live_window_days") or 0,
                "live_brier_score": stats.get("live_brier_score"),
            }
        )


def _market_from_row(row: dict) -> MarketDefinition:
    return MarketDefinition(
        market_id=row["market_id"],
        event_id=row.get("event_id"),
        condition_id=row["condition_id"],
        question=row["question"],
        slug=row.get("slug"),
        category=row.get("category"),
        tags=list(row.get("tags") or []),
        end_at=row["end_at"],
        resolution_source=row.get("resolution_source"),
        yes_token_id=row["yes_token_id"],
        no_token_id=row["no_token_id"],
        yes_price=row.get("gamma_yes_price"),
        no_price=row.get("gamma_no_price"),
        liquidity_usd=float(row.get("liquidity_usd") or 0),
        volume_usd=float(row.get("volume_usd") or 0),
        active=bool(row.get("active", True)),
        closed=bool(row.get("closed", False)),
        accepting_orders=bool(row.get("accepting_orders", True)),
        enable_order_book=bool(row.get("enable_order_book", True)),
        raw=row.get("raw") or {},
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    PolymarketForecastWorker(PolymarketSettings.from_env()).run_forever()


if __name__ == "__main__":
    main()
