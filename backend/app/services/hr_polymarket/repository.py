"""Postgres persistence and read models for Polymarket feature state."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app import db
from app.services.hr_polymarket.forecast import (
    EventForecast,
    ParsedForecastQuestion,
)
from app.services.hr_polymarket.models import FeatureSnapshot, MarketDefinition


class PolymarketRepositoryError(RuntimeError):
    """Database operation failed for the Polymarket lane."""


class PolymarketRepository:
    def upsert_market(self, market: MarketDefinition) -> None:
        values = market.model_dump(mode="json")
        try:
            with db.get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hr_polymarket_markets (
                        market_id, event_id, condition_id, question, slug, category,
                        tags, end_at, resolution_source, yes_token_id, no_token_id,
                        gamma_yes_price, gamma_no_price, liquidity_usd, volume_usd,
                        active, closed, accepting_orders, enable_order_book, raw,
                        first_seen_at, last_seen_at
                    ) VALUES (
                        %(market_id)s, %(event_id)s, %(condition_id)s, %(question)s,
                        %(slug)s, %(category)s, %(tags)s::jsonb, %(end_at)s,
                        %(resolution_source)s, %(yes_token_id)s, %(no_token_id)s,
                        %(yes_price)s, %(no_price)s, %(liquidity_usd)s, %(volume_usd)s,
                        %(active)s, %(closed)s, %(accepting_orders)s,
                        %(enable_order_book)s, %(raw)s::jsonb, now(), now()
                    )
                    ON CONFLICT (market_id) DO UPDATE SET
                        event_id = EXCLUDED.event_id,
                        condition_id = EXCLUDED.condition_id,
                        question = EXCLUDED.question,
                        slug = EXCLUDED.slug,
                        category = EXCLUDED.category,
                        tags = EXCLUDED.tags,
                        end_at = EXCLUDED.end_at,
                        resolution_source = EXCLUDED.resolution_source,
                        yes_token_id = EXCLUDED.yes_token_id,
                        no_token_id = EXCLUDED.no_token_id,
                        gamma_yes_price = EXCLUDED.gamma_yes_price,
                        gamma_no_price = EXCLUDED.gamma_no_price,
                        liquidity_usd = EXCLUDED.liquidity_usd,
                        volume_usd = EXCLUDED.volume_usd,
                        active = EXCLUDED.active,
                        closed = EXCLUDED.closed,
                        accepting_orders = EXCLUDED.accepting_orders,
                        enable_order_book = EXCLUDED.enable_order_book,
                        raw = EXCLUDED.raw,
                        last_seen_at = now();
                    """,
                    {
                        **values,
                        "tags": _json(values["tags"]),
                        "raw": _json(values["raw"]),
                    },
                )
        except Exception as exc:
            raise PolymarketRepositoryError("market upsert failed") from exc

    def upsert_feature(self, snapshot: FeatureSnapshot) -> None:
        values = snapshot.model_dump(mode="json")
        try:
            with db.get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hr_polymarket_feature_snapshots (
                        market_id, bucket_at, observed_at,
                        connection_last_message_at, market_last_event_at,
                        yes_probability, price_basis, last_trade_price,
                        best_bid, best_ask, midpoint, spread, spread_bps,
                        bid_notional_1pt, ask_notional_1pt,
                        bid_notional_5pt, ask_notional_5pt, book_imbalance,
                        probability_change_5m, probability_change_1h,
                        probability_change_24h, liquidity_confidence, shock_score,
                        connection_stale, market_stale, thin_liquidity_flag,
                        ambiguity_flag, null_reason, source_event_ids, provenance
                    ) VALUES (
                        %(market_id)s, %(bucket_at)s, %(observed_at)s,
                        %(connection_last_message_at)s, %(market_last_event_at)s,
                        %(yes_probability)s, %(price_basis)s, %(last_trade_price)s,
                        %(best_bid)s, %(best_ask)s, %(midpoint)s, %(spread)s,
                        %(spread_bps)s, %(bid_notional_1pt)s, %(ask_notional_1pt)s,
                        %(bid_notional_5pt)s, %(ask_notional_5pt)s,
                        %(book_imbalance)s, %(probability_change_5m)s,
                        %(probability_change_1h)s, %(probability_change_24h)s,
                        %(liquidity_confidence)s, %(shock_score)s,
                        %(connection_stale)s, %(market_stale)s,
                        %(thin_liquidity_flag)s, %(ambiguity_flag)s,
                        %(null_reason)s, %(source_event_ids)s::jsonb,
                        %(provenance)s::jsonb
                    )
                    ON CONFLICT (market_id, bucket_at) DO UPDATE SET
                        observed_at = EXCLUDED.observed_at,
                        connection_last_message_at = EXCLUDED.connection_last_message_at,
                        market_last_event_at = EXCLUDED.market_last_event_at,
                        yes_probability = EXCLUDED.yes_probability,
                        price_basis = EXCLUDED.price_basis,
                        last_trade_price = EXCLUDED.last_trade_price,
                        best_bid = EXCLUDED.best_bid,
                        best_ask = EXCLUDED.best_ask,
                        midpoint = EXCLUDED.midpoint,
                        spread = EXCLUDED.spread,
                        spread_bps = EXCLUDED.spread_bps,
                        bid_notional_1pt = EXCLUDED.bid_notional_1pt,
                        ask_notional_1pt = EXCLUDED.ask_notional_1pt,
                        bid_notional_5pt = EXCLUDED.bid_notional_5pt,
                        ask_notional_5pt = EXCLUDED.ask_notional_5pt,
                        book_imbalance = EXCLUDED.book_imbalance,
                        probability_change_5m = EXCLUDED.probability_change_5m,
                        probability_change_1h = EXCLUDED.probability_change_1h,
                        probability_change_24h = EXCLUDED.probability_change_24h,
                        liquidity_confidence = EXCLUDED.liquidity_confidence,
                        shock_score = EXCLUDED.shock_score,
                        connection_stale = EXCLUDED.connection_stale,
                        market_stale = EXCLUDED.market_stale,
                        thin_liquidity_flag = EXCLUDED.thin_liquidity_flag,
                        ambiguity_flag = EXCLUDED.ambiguity_flag,
                        null_reason = EXCLUDED.null_reason,
                        source_event_ids = EXCLUDED.source_event_ids,
                        provenance = EXCLUDED.provenance;
                    """,
                    {
                        **values,
                        "source_event_ids": _json(values["source_event_ids"]),
                        "provenance": _json(values["provenance"]),
                    },
                )
        except Exception as exc:
            raise PolymarketRepositoryError("feature upsert failed") from exc

    def update_stream_status(
        self,
        component: str,
        *,
        status: str,
        connection_last_message_at: datetime | None = None,
        market_last_event_at: datetime | None = None,
        last_discovery_at: datetime | None = None,
        last_reconciliation_at: datetime | None = None,
        last_snapshot_at: datetime | None = None,
        reconnect_count: int = 0,
        subscribed_market_count: int = 0,
        consumer_offsets: dict[str, Any] | None = None,
        last_error: str | None = None,
    ) -> None:
        try:
            with db.get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hr_polymarket_stream_status (
                        component, status, connection_last_message_at,
                        market_last_event_at, last_discovery_at,
                        last_reconciliation_at, last_snapshot_at, reconnect_count,
                        subscribed_market_count, consumer_offsets, last_error,
                        updated_at
                    ) VALUES (
                        %(component)s, %(status)s, %(connection_last_message_at)s,
                        %(market_last_event_at)s, %(last_discovery_at)s,
                        %(last_reconciliation_at)s, %(last_snapshot_at)s,
                        %(reconnect_count)s, %(subscribed_market_count)s,
                        %(consumer_offsets)s::jsonb, %(last_error)s, now()
                    )
                    ON CONFLICT (component) DO UPDATE SET
                        status = EXCLUDED.status,
                        connection_last_message_at = EXCLUDED.connection_last_message_at,
                        market_last_event_at = EXCLUDED.market_last_event_at,
                        last_discovery_at = COALESCE(
                            EXCLUDED.last_discovery_at,
                            hr_polymarket_stream_status.last_discovery_at
                        ),
                        last_reconciliation_at = COALESCE(
                            EXCLUDED.last_reconciliation_at,
                            hr_polymarket_stream_status.last_reconciliation_at
                        ),
                        last_snapshot_at = COALESCE(
                            EXCLUDED.last_snapshot_at,
                            hr_polymarket_stream_status.last_snapshot_at
                        ),
                        reconnect_count = EXCLUDED.reconnect_count,
                        subscribed_market_count = EXCLUDED.subscribed_market_count,
                        consumer_offsets = EXCLUDED.consumer_offsets,
                        last_error = EXCLUDED.last_error,
                        updated_at = now();
                    """,
                    {
                        "component": component,
                        "status": status,
                        "connection_last_message_at": connection_last_message_at,
                        "market_last_event_at": market_last_event_at,
                        "last_discovery_at": last_discovery_at,
                        "last_reconciliation_at": last_reconciliation_at,
                        "last_snapshot_at": last_snapshot_at,
                        "reconnect_count": reconnect_count,
                        "subscribed_market_count": subscribed_market_count,
                        "consumer_offsets": _json(consumer_offsets or {}),
                        "last_error": last_error,
                    },
                )
        except Exception as exc:
            raise PolymarketRepositoryError("stream status upsert failed") from exc

    def get_health(self) -> dict[str, Any] | None:
        return self._fetch_one(
            """
            SELECT *
            FROM hr_polymarket_stream_status
            WHERE component = 'materializer';
            """
        )

    def get_market(self, market_id: str) -> dict[str, Any] | None:
        return self._fetch_one(
            """
            SELECT *
            FROM hr_polymarket_markets
            WHERE market_id = %s;
            """,
            (market_id,),
        )

    def upsert_question(
        self,
        market_id: str,
        question: ParsedForecastQuestion,
    ) -> str:
        try:
            with db.get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hr_forecast_questions (
                        market_id, family, subject, predicate, threshold,
                        target_date, timezone, resolution_source, mapping_status,
                        mapping_reason, parser_version, parsed_json, updated_at
                    ) VALUES (
                        %(market_id)s, %(family)s, %(subject)s, %(predicate)s,
                        %(threshold)s, %(target_date)s, %(timezone)s,
                        %(resolution_source)s, %(mapping_status)s,
                        %(mapping_reason)s, %(parser_version)s,
                        %(parsed_json)s::jsonb, now()
                    )
                    ON CONFLICT (market_id) DO UPDATE SET
                        family = EXCLUDED.family,
                        subject = EXCLUDED.subject,
                        predicate = EXCLUDED.predicate,
                        threshold = EXCLUDED.threshold,
                        target_date = EXCLUDED.target_date,
                        timezone = EXCLUDED.timezone,
                        resolution_source = EXCLUDED.resolution_source,
                        mapping_status = EXCLUDED.mapping_status,
                        mapping_reason = EXCLUDED.mapping_reason,
                        parser_version = EXCLUDED.parser_version,
                        parsed_json = EXCLUDED.parsed_json,
                        updated_at = now()
                    RETURNING question_id;
                    """,
                    {
                        "market_id": market_id,
                        **question.model_dump(mode="json", exclude={"question"}),
                        "parsed_json": _json(question.parsed_json),
                    },
                )
                row = cur.fetchone()
                if row is None:
                    raise PolymarketRepositoryError(
                        "question upsert returned no identifier"
                    )
                return str(row["question_id"])
        except PolymarketRepositoryError:
            raise
        except Exception as exc:
            raise PolymarketRepositoryError("question upsert failed") from exc

    def insert_forecast(self, question_id: str, forecast: EventForecast) -> str:
        values = forecast.model_dump(mode="json")
        try:
            with db.get_cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hr_event_forecasts (
                        question_id, forecast_at, p_polymarket, p_hr,
                        posterior_lower, posterior_upper, signed_divergence,
                        p_base, analog_count, effective_sample_size, analog_sample,
                        calibration, forecast_status, null_reason, model_version,
                        data_lineage, research_only, eligible_position_sizing
                    ) VALUES (
                        %(question_id)s, %(forecast_at)s, %(p_polymarket)s,
                        %(p_hr)s, %(posterior_lower)s, %(posterior_upper)s,
                        %(signed_divergence)s, %(p_base)s, %(analog_count)s,
                        %(effective_sample_size)s, %(analog_sample)s::jsonb,
                        %(calibration)s::jsonb, %(forecast_status)s,
                        %(null_reason)s, %(model_version)s,
                        %(data_lineage)s::jsonb, %(research_only)s,
                        %(eligible_position_sizing)s
                    )
                    ON CONFLICT (question_id, forecast_at) DO UPDATE SET
                        p_polymarket = EXCLUDED.p_polymarket,
                        p_hr = EXCLUDED.p_hr,
                        posterior_lower = EXCLUDED.posterior_lower,
                        posterior_upper = EXCLUDED.posterior_upper,
                        signed_divergence = EXCLUDED.signed_divergence,
                        p_base = EXCLUDED.p_base,
                        analog_count = EXCLUDED.analog_count,
                        effective_sample_size = EXCLUDED.effective_sample_size,
                        analog_sample = EXCLUDED.analog_sample,
                        calibration = EXCLUDED.calibration,
                        forecast_status = EXCLUDED.forecast_status,
                        null_reason = EXCLUDED.null_reason,
                        model_version = EXCLUDED.model_version,
                        data_lineage = EXCLUDED.data_lineage,
                        research_only = EXCLUDED.research_only,
                        eligible_position_sizing = EXCLUDED.eligible_position_sizing
                    RETURNING id;
                    """,
                    {
                        "question_id": question_id,
                        **values,
                        "analog_sample": _json(values["analog_sample"]),
                        "calibration": _json(values["calibration"]),
                        "data_lineage": _json(values["data_lineage"]),
                    },
                )
                row = cur.fetchone()
                if row is None:
                    raise PolymarketRepositoryError(
                        "forecast insert returned no identifier"
                    )
                return str(row["id"])
        except PolymarketRepositoryError:
            raise
        except Exception as exc:
            raise PolymarketRepositoryError("forecast insert failed") from exc

    def get_live_resolution_stats(self, family: str) -> dict[str, Any]:
        row = self._fetch_one(
            """
            SELECT
                count(*)::integer AS live_resolutions,
                COALESCE(
                    (max(ef.resolution_at)::date - min(ef.resolution_at)::date),
                    0
                )::integer AS live_window_days,
                avg(ef.brier_score)::double precision AS live_brier_score
            FROM hr_event_forecasts ef
            JOIN hr_forecast_questions fq ON fq.question_id = ef.question_id
            WHERE fq.family = %s
              AND ef.resolution_at IS NOT NULL
              AND ef.actual_outcome IS NOT NULL
              AND ef.brier_score IS NOT NULL
              AND ef.resolution_at >= now() - interval '90 days';
            """,
            (family,),
        )
        return row or {
            "live_resolutions": 0,
            "live_window_days": 0,
            "live_brier_score": None,
        }

    def list_markets(self, *, limit: int = 25) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT
                m.*,
                f.bucket_at AS as_of,
                f.yes_probability,
                f.price_basis,
                f.liquidity_confidence,
                f.connection_stale,
                f.market_stale,
                f.thin_liquidity_flag,
                f.ambiguity_flag,
                f.null_reason,
                f.provenance
            FROM hr_polymarket_markets m
            LEFT JOIN LATERAL (
                SELECT *
                FROM hr_polymarket_feature_snapshots x
                WHERE x.market_id = m.market_id
                ORDER BY x.bucket_at DESC
                LIMIT 1
            ) f ON true
            WHERE m.active = true AND m.closed = false
            ORDER BY m.liquidity_usd DESC
            LIMIT %s;
            """,
            (limit,),
        )

    def get_pulse(self, *, limit: int = 25) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT
                m.market_id, m.question, m.slug, m.category, m.end_at,
                f.bucket_at AS as_of, f.yes_probability, f.price_basis,
                f.probability_change_5m, f.probability_change_1h,
                f.probability_change_24h, f.liquidity_confidence,
                f.shock_score, f.connection_stale, f.market_stale,
                f.thin_liquidity_flag, f.ambiguity_flag, f.null_reason,
                f.provenance,
                ef.p_hr, ef.signed_divergence, ef.forecast_status,
                ef.null_reason AS forecast_null_reason, ef.model_version
            FROM hr_polymarket_markets m
            JOIN LATERAL (
                SELECT *
                FROM hr_polymarket_feature_snapshots x
                WHERE x.market_id = m.market_id
                ORDER BY x.bucket_at DESC
                LIMIT 1
            ) f ON true
            LEFT JOIN hr_forecast_questions fq ON fq.market_id = m.market_id
            LEFT JOIN LATERAL (
                SELECT *
                FROM hr_event_forecasts y
                WHERE y.question_id = fq.question_id
                ORDER BY y.forecast_at DESC
                LIMIT 1
            ) ef ON true
            WHERE m.active = true AND m.closed = false
            ORDER BY f.shock_score DESC, m.liquidity_usd DESC
            LIMIT %s;
            """,
            (limit,),
        )

    def get_divergence(self, *, limit: int = 25) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT
                m.market_id, m.question, f.bucket_at AS as_of,
                f.yes_probability, f.price_basis, f.liquidity_confidence,
                f.connection_stale, f.market_stale, f.thin_liquidity_flag,
                ef.p_hr, ef.posterior_lower, ef.posterior_upper,
                ef.signed_divergence, ef.forecast_status, ef.null_reason,
                ef.model_version, ef.data_lineage
            FROM hr_event_forecasts ef
            JOIN hr_forecast_questions fq ON fq.question_id = ef.question_id
            JOIN hr_polymarket_markets m ON m.market_id = fq.market_id
            JOIN LATERAL (
                SELECT *
                FROM hr_polymarket_feature_snapshots x
                WHERE x.market_id = m.market_id
                ORDER BY x.bucket_at DESC
                LIMIT 1
            ) f ON true
            WHERE ef.p_hr IS NOT NULL
            ORDER BY abs(ef.signed_divergence) DESC, ef.forecast_at DESC
            LIMIT %s;
            """,
            (limit,),
        )

    def get_market_history(
        self, market_id: str, *, limit: int = 1_440
    ) -> list[dict[str, Any]]:
        return self._fetch_all(
            """
            SELECT *
            FROM hr_polymarket_feature_snapshots
            WHERE market_id = %s
            ORDER BY bucket_at DESC
            LIMIT %s;
            """,
            (market_id, limit),
        )

    def get_forecast(self, question_id: str) -> dict[str, Any] | None:
        return self._fetch_one(
            """
            SELECT
                fq.*, m.question, f.price_basis, f.bucket_at AS as_of,
                ef.id AS forecast_id, ef.forecast_at,
                ef.p_polymarket, ef.p_hr, ef.posterior_lower,
                ef.posterior_upper, ef.signed_divergence, ef.p_base,
                ef.analog_count, ef.effective_sample_size, ef.analog_sample,
                ef.calibration, ef.forecast_status, ef.null_reason,
                ef.model_version, ef.data_lineage, ef.research_only,
                ef.eligible_position_sizing
            FROM hr_forecast_questions fq
            JOIN hr_polymarket_markets m ON m.market_id = fq.market_id
            LEFT JOIN LATERAL (
                SELECT *
                FROM hr_polymarket_feature_snapshots x
                WHERE x.market_id = m.market_id
                ORDER BY x.bucket_at DESC
                LIMIT 1
            ) f ON true
            LEFT JOIN LATERAL (
                SELECT *
                FROM hr_event_forecasts y
                WHERE y.question_id = fq.question_id
                ORDER BY y.forecast_at DESC
                LIMIT 1
            ) ef ON true
            WHERE fq.question_id = %s;
            """,
            (question_id,),
        )

    def _fetch_one(
        self, sql: str, params: tuple[Any, ...] | None = None
    ) -> dict[str, Any] | None:
        try:
            with db.get_cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchone()
        except Exception as exc:
            raise PolymarketRepositoryError("database read failed") from exc

    def _fetch_all(
        self, sql: str, params: tuple[Any, ...] | None = None
    ) -> list[dict[str, Any]]:
        try:
            with db.get_cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall()
        except Exception as exc:
            raise PolymarketRepositoryError("database read failed") from exc


def _json(value: Any) -> str:
    import json

    return json.dumps(value, separators=(",", ":"), default=str)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
