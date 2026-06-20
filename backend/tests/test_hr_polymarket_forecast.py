"""Deterministic parser, no-lookahead posterior, and launch-gate tests."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.events.envelope import EventEnvelope
from app.services.hr_polymarket.calibration import (
    CalibrationRegistry,
    FamilyCalibration,
)
from app.services.hr_polymarket.config import PolymarketSettings
from app.services.hr_polymarket.forecast import (
    AnalogObservation,
    CalibrationEvidence,
    WalkForwardObservation,
    build_event_forecast,
    calibration_from_walk_forward,
    parse_forecast_question,
)
from app.services.hr_polymarket.forecast_worker import PolymarketForecastWorker
from app.services.hr_polymarket.models import FeatureSnapshot


@pytest.mark.parametrize(
    ("question", "family", "subject", "predicate", "threshold"),
    [
        (
            "Will the Federal Reserve make at least 3 rate cuts by December 2026?",
            "fed_cuts",
            "DFEDTARU_CUT_COUNT",
            "at_least",
            3.0,
        ),
        (
            "Will the upper bound of the federal funds target rate be above 4.5% by December 2026?",
            "fed_upper_bound",
            "DFEDTARU",
            "above",
            4.5,
        ),
        (
            "Will CPI year-over-year be above 3% by December 2026?",
            "cpi_yoy",
            "CPIAUCSL_YOY",
            "above",
            3.0,
        ),
        (
            "Will US unemployment be below 5% by December 2026?",
            "unemployment",
            "UNRATE",
            "below",
            5.0,
        ),
        (
            "Will the U.S. be in a recession by December 2026?",
            "us_recession",
            "USREC",
            "equals",
            1.0,
        ),
        (
            "Will SPY close above $700 on December 31, 2026?",
            "asset_close",
            "SPY",
            "above",
            700.0,
        ),
        (
            "Will BTC close below $80,000 on December 31, 2026?",
            "asset_close",
            "BTC",
            "below",
            80000.0,
        ),
        (
            "Will ETH close above $5,000 on December 31, 2026?",
            "asset_close",
            "ETH",
            "above",
            5000.0,
        ),
    ],
)
def test_supported_question_families_parse_deterministically(
    question, family, subject, predicate, threshold
):
    parsed = parse_forecast_question(
        question, resolution_source="Official published source"
    )
    assert parsed.mapping_status == "eligible"
    assert parsed.family == family
    assert parsed.subject == subject
    assert parsed.predicate == predicate
    assert parsed.threshold == threshold
    assert parsed.target_date == date(2026, 12, 31)


def test_unsupported_and_ambiguous_questions_never_receive_mapping():
    unsupported = parse_forecast_question(
        "Will a celebrity release an album this year?",
        resolution_source="Official website",
    )
    ambiguous = parse_forecast_question(
        "Will CPI be high soon?",
        resolution_source=None,
    )
    assert unsupported.mapping_status == "unsupported"
    assert ambiguous.mapping_status == "ambiguous"
    assert "target_date" in (ambiguous.mapping_reason or "")


def _passing_calibration(**overrides) -> CalibrationEvidence:
    values = {
        "observations": 80,
        "brier_score": 0.15,
        "climatology_brier": 0.20,
        "expected_calibration_error": 0.08,
        "live_resolutions": 0,
        "live_window_days": 0,
        "live_brier_score": None,
    }
    values.update(overrides)
    return CalibrationEvidence(**values)


def _analogs(count: int = 20) -> list[AnalogObservation]:
    return [
        AnalogObservation(
            analog_id=f"analog-{index}",
            anchor_date=date(2000, 1, 1) + timedelta(days=index * 40),
            outcome_date=date(2000, 2, 1) + timedelta(days=index * 40),
            rhyme_score=1.0,
            observed_value=4.0 if index < count / 2 else 2.0,
            source="test",
        )
        for index in range(count)
    ]


def test_weighted_posterior_uses_prior_strength_and_effective_sample_20():
    question = parse_forecast_question(
        "Will CPI year-over-year be above 3% by December 2026?",
        resolution_source="BLS",
    )
    forecast = build_event_forecast(
        question,
        forecast_at=datetime(2026, 6, 14, tzinfo=timezone.utc),
        p_polymarket=0.70,
        p_base=0.40,
        analogs=_analogs(),
        calibration=_passing_calibration(),
    )
    assert forecast.forecast_status == "research"
    assert forecast.p_hr == pytest.approx((10 * 0.40 + 10) / 30)
    assert forecast.effective_sample_size == pytest.approx(20)
    assert forecast.signed_divergence == pytest.approx(0.70 - forecast.p_hr)
    assert forecast.posterior_lower < forecast.p_hr < forecast.posterior_upper
    assert forecast.research_only is True
    assert forecast.eligible_position_sizing is False


def test_no_lookahead_excludes_future_outcome_and_withholds_if_under_20():
    question = parse_forecast_question(
        "Will CPI year-over-year be above 3% by December 2026?",
        resolution_source="BLS",
    )
    analogs = _analogs(19)
    analogs.append(
        AnalogObservation(
            analog_id="future",
            anchor_date=date(2026, 6, 1),
            outcome_date=date(2026, 7, 1),
            rhyme_score=100,
            observed_value=10,
            source="invalid-future",
        )
    )
    forecast = build_event_forecast(
        question,
        forecast_at=datetime(2026, 6, 14, tzinfo=timezone.utc),
        p_polymarket=0.60,
        p_base=0.40,
        analogs=analogs,
        calibration=_passing_calibration(),
    )
    assert forecast.forecast_status == "withheld"
    assert forecast.null_reason == "fewer_than_20_no_lookahead_analog_outcomes"
    assert forecast.analog_count == 19


def test_stale_unsupported_and_uncalibrated_questions_are_withheld():
    eligible = parse_forecast_question(
        "Will US unemployment be above 5% by December 2026?",
        resolution_source="BLS",
    )
    unsupported = parse_forecast_question(
        "Will a movie win an award?",
        resolution_source="Academy",
    )
    stale = build_event_forecast(
        eligible,
        forecast_at=datetime.now(timezone.utc),
        p_polymarket=0.5,
        p_base=0.5,
        analogs=_analogs(),
        calibration=_passing_calibration(),
        inputs_stale=True,
    )
    uncalibrated = build_event_forecast(
        eligible,
        forecast_at=datetime.now(timezone.utc),
        p_polymarket=0.5,
        p_base=0.5,
        analogs=_analogs(),
        calibration=_passing_calibration(observations=49),
    )
    unsupported_result = build_event_forecast(
        unsupported,
        forecast_at=datetime.now(timezone.utc),
        p_polymarket=0.5,
        p_base=0.5,
        analogs=[],
        calibration=None,
    )
    assert stale.forecast_status == "stale"
    assert uncalibrated.forecast_status == "uncalibrated"
    assert unsupported_result.forecast_status == "unsupported"
    assert stale.p_hr is None
    assert uncalibrated.p_hr is None
    assert unsupported_result.p_hr is None


def test_walk_forward_gate_and_live_promotion_thresholds():
    observations = [
        WalkForwardObservation(
            forecast_at=datetime(2025, 1, 1, tzinfo=timezone.utc)
            + timedelta(days=index),
            probability=float(index % 2),
            outcome=float(index % 2),
        )
        for index in range(50)
    ]
    evidence = calibration_from_walk_forward(observations)
    assert evidence.offline_passes is True
    assert evidence.live_passes is False

    live = evidence.model_copy(
        update={
            "live_resolutions": 30,
            "live_window_days": 90,
            "live_brier_score": 0.21,
        }
    )
    assert live.live_passes is True


def test_forecast_can_leave_research_only_only_after_live_gate():
    question = parse_forecast_question(
        "Will US unemployment be above 5% by December 2026?",
        resolution_source="BLS",
    )
    forecast = build_event_forecast(
        question,
        forecast_at=datetime(2026, 6, 14, tzinfo=timezone.utc),
        p_polymarket=0.55,
        p_base=0.5,
        analogs=_analogs(),
        calibration=_passing_calibration(
            live_resolutions=30,
            live_window_days=90,
            live_brier_score=0.21,
        ),
    )
    assert forecast.research_only is False
    assert forecast.eligible_position_sizing is True


def _settings() -> PolymarketSettings:
    return PolymarketSettings(
        enabled=True,
        gamma_base_url="https://gamma.test",
        clob_base_url="https://clob.test",
        websocket_url="wss://ws.test",
        max_markets=25,
        discovery_seconds=900,
        reconcile_seconds=300,
        feature_seconds=60,
        connection_stale_seconds=30,
        market_stale_seconds=300,
        min_liquidity_usd=1000,
        max_spread_bps=1200,
        allow_tags=(),
        block_tags=(),
    )


def test_forecast_worker_persists_crowd_only_unsupported_receipt():
    class FakeRepository:
        def __init__(self):
            self.forecast = None

        def get_market(self, market_id):
            return {
                "market_id": market_id,
                "condition_id": "condition-1",
                "question": "Will a celebrity release an album this year?",
                "end_at": datetime(2026, 12, 31, tzinfo=timezone.utc),
                "resolution_source": "Official website",
                "yes_token_id": "yes-1",
                "no_token_id": "no-1",
                "liquidity_usd": 5000,
            }

        def upsert_question(self, market_id, parsed):
            assert parsed.mapping_status == "unsupported"
            return "question-1"

        def get_live_resolution_stats(self, family):
            raise AssertionError("unsupported family must not query calibration")

        def insert_forecast(self, question_id, forecast):
            self.forecast = forecast
            return "forecast-1"

    class NeverCalledProvider:
        def build_observations(self, *args, **kwargs):
            raise AssertionError("unsupported question must not retrieve analogs")

    published = []
    repository = FakeRepository()
    worker = PolymarketForecastWorker(
        _settings(),
        repository=repository,
        outcome_provider=NeverCalledProvider(),
        calibration_registry=CalibrationRegistry(),
        publisher=lambda topic, envelope, *, key: published.append(
            (topic, envelope, key)
        )
        or True,
    )
    feature = FeatureSnapshot(
        market_id="market-1",
        bucket_at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc),
        yes_probability=0.4,
        connection_stale=False,
        market_stale=False,
    )
    envelope = EventEnvelope(
        event_type="hr.polymarket.feature.snapshot",
        idempotency_key="feature-1",
        occurred_at=feature.bucket_at,
        payload=feature.model_dump(mode="json"),
    )
    result = worker.process_wire(envelope.to_wire())
    assert result.forecast_status == "unsupported"
    assert result.p_hr is None
    assert repository.forecast is result
    assert published[0][0] == worker.settings.forecasts_topic


def test_forecast_worker_builds_research_divergence_when_gates_pass():
    class FakeRepository:
        def get_market(self, market_id):
            return {
                "market_id": market_id,
                "condition_id": "condition-1",
                "question": "Will CPI year-over-year be above 3% by December 2026?",
                "end_at": datetime(2026, 12, 31, tzinfo=timezone.utc),
                "resolution_source": "BLS",
                "yes_token_id": "yes-1",
                "no_token_id": "no-1",
                "liquidity_usd": 5000,
            }

        def upsert_question(self, market_id, parsed):
            return "question-1"

        def get_live_resolution_stats(self, family):
            return {
                "live_resolutions": 0,
                "live_window_days": 0,
                "live_brier_score": None,
            }

        def insert_forecast(self, question_id, forecast):
            return "forecast-1"

    class FakeProvider:
        def build_observations(self, *args, **kwargs):
            return _analogs()

    registry = CalibrationRegistry(
        {
            "cpi_yoy": FamilyCalibration(
                p_base=0.4,
                evidence=_passing_calibration(),
                backtest_version="walk-forward-v1",
                generated_at="2026-06-14T00:00:00Z",
            )
        }
    )
    worker = PolymarketForecastWorker(
        _settings(),
        repository=FakeRepository(),
        outcome_provider=FakeProvider(),
        calibration_registry=registry,
        publisher=lambda *args, **kwargs: True,
    )
    feature = FeatureSnapshot(
        market_id="market-1",
        bucket_at=datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc),
        yes_probability=0.7,
        connection_stale=False,
        market_stale=False,
    )
    envelope = EventEnvelope(
        event_type="hr.polymarket.feature.snapshot",
        idempotency_key="feature-1",
        occurred_at=feature.bucket_at,
        payload=feature.model_dump(mode="json"),
    )
    result = worker.process_wire(envelope.to_wire())
    assert result.forecast_status == "research"
    assert result.p_hr is not None
    assert result.signed_divergence == pytest.approx(0.7 - result.p_hr)
