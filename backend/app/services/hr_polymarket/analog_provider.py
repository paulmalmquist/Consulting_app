"""No-lookahead analog retrieval and historical predicate observations."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from app.db import get_cursor
from app.services.history_rhymes_service import (
    _categorical_match,
    _freshness_multiplier,
    _load_current_state_vector,
    _pgvector_search,
    _rhyme_score,
    apply_hoyt_amplification,
    apply_structural_era_discount,
    hoyt_cycle_position,
)
from app.services.hr_polymarket.forecast import (
    AnalogObservation,
    ParsedForecastQuestion,
)


class HistoricalOutcomeError(RuntimeError):
    """Historical outcomes cannot be evaluated from auditable public data."""


def _read_secret_file(env_name: str) -> str:
    path = os.getenv(env_name, "").strip()
    if not path:
        return ""
    return Path(path).read_text(encoding="utf-8").strip()


@dataclass(frozen=True)
class RetrievedEpisode:
    episode_id: str
    anchor_date: date
    end_date: date
    rhyme_score: float


class HistoricalOutcomeProvider:
    def __init__(
        self,
        *,
        fred: "FredHistoricalClient | None" = None,
        prices: "PublicPriceHistoryClient | None" = None,
    ) -> None:
        self.fred = fred or FredHistoricalClient()
        self.prices = prices or PublicPriceHistoryClient()

    def build_observations(
        self,
        question: ParsedForecastQuestion,
        *,
        forecast_at: datetime,
        limit: int = 20,
    ) -> list[AnalogObservation]:
        if question.target_date is None or question.family is None:
            return []
        as_of_date = forecast_at.astimezone(timezone.utc).date()
        horizon_days = (question.target_date - as_of_date).days
        if horizon_days <= 0:
            return []

        episodes = retrieve_no_lookahead_episodes(
            as_of_date=as_of_date,
            k=max(limit * 4, 80),
        )
        candidates = [
            (
                episode,
                episode.anchor_date + timedelta(days=horizon_days),
            )
            for episode in episodes
            if episode.anchor_date + timedelta(days=horizon_days)
            <= episode.end_date
            and episode.anchor_date + timedelta(days=horizon_days) < as_of_date
        ]
        if not candidates:
            return []

        if question.family in {
            "fed_upper_bound",
            "fed_cuts",
            "cpi_yoy",
            "unemployment",
            "us_recession",
        }:
            values = self._fred_values(question, candidates)
        elif question.family == "asset_close":
            values = self._asset_values(question, candidates)
        else:
            return []

        observations = []
        for episode, outcome_date in candidates:
            value = values.get((episode.episode_id, outcome_date))
            if value is None:
                continue
            observations.append(
                AnalogObservation(
                    analog_id=episode.episode_id,
                    anchor_date=episode.anchor_date,
                    outcome_date=outcome_date,
                    rhyme_score=episode.rhyme_score,
                    observed_value=value,
                    source=(
                        "FRED"
                        if question.family != "asset_close"
                        else "Yahoo public chart"
                    ),
                    lineage={
                        "family": question.family,
                        "subject": question.subject,
                        "retrieval_cutoff": as_of_date.isoformat(),
                        "horizon_days": horizon_days,
                    },
                )
            )
            if len(observations) >= limit:
                break
        return observations

    def _fred_values(
        self,
        question: ParsedForecastQuestion,
        candidates: list[tuple[RetrievedEpisode, date]],
    ) -> dict[tuple[str, date], float]:
        series_id = {
            "fed_upper_bound": "DFEDTARU",
            "fed_cuts": "DFEDTARU",
            "cpi_yoy": "CPIAUCSL",
            "unemployment": "UNRATE",
            "us_recession": "USREC",
        }[question.family or ""]
        start = min(episode.anchor_date for episode, _ in candidates)
        if question.family == "cpi_yoy":
            start -= timedelta(days=400)
        end = max(outcome_date for _, outcome_date in candidates)
        series = self.fred.fetch_series(series_id, start=start, end=end)
        values: dict[tuple[str, date], float] = {}
        for episode, outcome_date in candidates:
            if question.family == "fed_cuts":
                path = [
                    value
                    for observed_at, value in series
                    if episode.anchor_date <= observed_at <= outcome_date
                ]
                if len(path) >= 2:
                    cuts = sum(
                        max(previous - current, 0.0) / 0.25
                        for previous, current in zip(path, path[1:], strict=False)
                    )
                    values[(episode.episode_id, outcome_date)] = cuts
                continue
            current = _value_at_or_before(series, outcome_date)
            if current is None:
                continue
            if question.family == "cpi_yoy":
                prior = _value_at_or_before(
                    series, outcome_date - timedelta(days=365)
                )
                if prior in (None, 0):
                    continue
                current = (current / prior - 1.0) * 100.0
            values[(episode.episode_id, outcome_date)] = current
        return values

    def _asset_values(
        self,
        question: ParsedForecastQuestion,
        candidates: list[tuple[RetrievedEpisode, date]],
    ) -> dict[tuple[str, date], float]:
        symbol = {
            "SPY": "SPY",
            "BTC": "BTC-USD",
            "ETH": "ETH-USD",
        }.get(question.subject or "")
        if symbol is None:
            return {}
        start = min(outcome_date for _, outcome_date in candidates) - timedelta(days=7)
        end = max(outcome_date for _, outcome_date in candidates) + timedelta(days=2)
        series = self.prices.fetch_closes(symbol, start=start, end=end)
        return {
            (episode.episode_id, outcome_date): value
            for episode, outcome_date in candidates
            if (value := _value_at_or_before(series, outcome_date)) is not None
        }


def retrieve_no_lookahead_episodes(
    *,
    as_of_date: date,
    k: int,
) -> list[RetrievedEpisode]:
    with get_cursor() as cur:
        current = _load_current_state_vector(cur, as_of_date)
        if current is None:
            return []
        rows = _pgvector_search(
            cur,
            current["vector"],
            k=k,
            end_date_lt=as_of_date,
        )

    current_hoyt = hoyt_cycle_position(as_of_date)
    freshness_hours = (
        datetime.combine(
            as_of_date,
            datetime.min.time(),
            tzinfo=timezone.utc,
        )
        - datetime.combine(
            current["signal_date"],
            datetime.min.time(),
            tzinfo=timezone.utc,
        )
    ).total_seconds() / 3600.0
    freshness_weight = _freshness_multiplier(freshness_hours)
    episodes: list[RetrievedEpisode] = []
    for row in rows:
        if row.get("start_date") is None or row.get("end_date") is None:
            continue
        cosine = max(0.0, 1.0 - float(row["cosine_distance"]))
        categorical = _categorical_match(row.get("regime_type"), None)
        score = _rhyme_score(cosine, None, categorical) * freshness_weight
        score = apply_structural_era_discount(
            score,
            row["start_date"].year,
            current["modalities"],
        )
        score = apply_hoyt_amplification(
            score,
            list(row.get("tags") or []),
            current_hoyt,
        )
        episodes.append(
            RetrievedEpisode(
                episode_id=str(row["episode_id"]),
                anchor_date=row["start_date"],
                end_date=row["end_date"],
                rhyme_score=max(score, 0.0),
            )
        )
    episodes.sort(key=lambda item: item.rhyme_score, reverse=True)
    return episodes[:k]


class FredHistoricalClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.api_key = (
            api_key
            or os.getenv("FRED_API_KEY", "")
            or _read_secret_file("FRED_API_KEY_FILE")
        ).strip()
        self.http = http_client or httpx.Client(timeout=30.0)

    def fetch_series(
        self,
        series_id: str,
        *,
        start: date,
        end: date,
    ) -> list[tuple[date, float]]:
        if not self.api_key:
            raise HistoricalOutcomeError("FRED_API_KEY is not configured")
        response = self.http.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "observation_start": start.isoformat(),
                "observation_end": end.isoformat(),
            },
        )
        response.raise_for_status()
        payload = response.json()
        observations = payload.get("observations") if isinstance(payload, dict) else None
        if not isinstance(observations, list):
            raise HistoricalOutcomeError("FRED response missing observations")
        rows = []
        for item in observations:
            if not isinstance(item, dict) or item.get("value") in (None, "."):
                continue
            try:
                rows.append(
                    (
                        date.fromisoformat(str(item["date"])),
                        float(item["value"]),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return rows


class PublicPriceHistoryClient:
    """Strict public Yahoo chart adapter used only for historical closes."""

    def __init__(self, *, http_client: httpx.Client | None = None) -> None:
        self.http = http_client or httpx.Client(timeout=30.0)

    def fetch_closes(
        self,
        symbol: str,
        *,
        start: date,
        end: date,
    ) -> list[tuple[date, float]]:
        period1 = int(
            datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc).timestamp()
        )
        period2 = int(
            datetime.combine(
                end + timedelta(days=1),
                datetime.min.time(),
                tzinfo=timezone.utc,
            ).timestamp()
        )
        response = self.http.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={
                "period1": period1,
                "period2": period2,
                "interval": "1d",
                "events": "history",
            },
        )
        response.raise_for_status()
        payload = response.json()
        try:
            result = payload["chart"]["result"][0]
            timestamps = result["timestamp"]
            closes = result["indicators"]["quote"][0]["close"]
        except (KeyError, IndexError, TypeError) as exc:
            raise HistoricalOutcomeError(
                "public price response missing closes"
            ) from exc
        rows = []
        for timestamp, close in zip(timestamps, closes, strict=False):
            if close is None:
                continue
            rows.append(
                (
                    datetime.fromtimestamp(timestamp, tz=timezone.utc).date(),
                    float(close),
                )
            )
        return rows


def _value_at_or_before(
    series: list[tuple[date, float]], target: date
) -> float | None:
    eligible = [item for item in series if item[0] <= target]
    return eligible[-1][1] if eligible else None
