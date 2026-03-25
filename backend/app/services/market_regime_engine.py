"""Market Regime Engine — Multi-Asset Regime Classifier.

Computes a composite market regime label (risk_on / risk_off / transitional / stress)
from four asset-class signal pillars: equities, rates, credit, crypto.

Data sources:
- fact_market_timeseries (existing table, additive reads only)
- public.market_regime_snapshot (new table, additive writes only)

Scoring methodology:
- Each asset class scored 0.0–1.0 (0=bearish/stress, 1=bullish/risk-on)
- Weighted composite: equities 0.30, rates 0.25, credit 0.25, crypto 0.20
- Regime thresholds:
    composite >= 0.65  → risk_on
    composite >= 0.50  → transitional
    composite >= 0.35  → risk_off
    composite <  0.35  → stress
- Confidence = distance from nearest threshold × 100 (clamped 0–100)
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.db import get_cursor


# ── Data classes ─────────────────────────────────────────────────────────────


@dataclass
class AssetClassSignal:
    score: float          # 0.0–1.0
    weight: float         # contribution weight
    signals: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class RegimeSnapshot:
    snapshot_id: str
    calculated_at: str
    regime_label: str
    confidence: float
    signal_breakdown: dict[str, Any]
    cross_vertical_implications: dict[str, str]
    source_metrics: dict[str, Any]


# ── Scoring helpers ──────────────────────────────────────────────────────────


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _regime_from_composite(composite: float) -> tuple[str, float]:
    """Return (regime_label, confidence_pct) from composite score 0–1."""
    thresholds = [
        (0.65, "risk_on"),
        (0.50, "transitional"),
        (0.35, "risk_off"),
        (0.00, "stress"),
    ]
    for threshold, label in thresholds:
        if composite >= threshold:
            # Distance to nearest boundary as confidence
            upper = 1.0
            for prev_t, _ in thresholds:
                if prev_t > threshold:
                    upper = prev_t
                    break
            margin = composite - threshold
            window = upper - threshold if upper > threshold else 0.35
            confidence = _clamp((margin / window) * 100, 0.0, 100.0)
            return label, round(confidence, 2)
    return "stress", 0.0


def _cross_vertical_implications(regime: str) -> dict[str, str]:
    """Generate cross-vertical context string for REPE / Credit / PDS."""
    implications = {
        "risk_on": {
            "repe": "Risk-On regime supports cap rate compression and deal flow. Monitor for overheating in gateway markets.",
            "credit": "Risk-On conditions support normal underwriting standards. Monitor leverage creep.",
            "pds": "Construction pipeline demand remains elevated. Watch labor/material cost pressures.",
        },
        "transitional": {
            "repe": "Transitional regime — mixed signals on cap rate direction. Apply conservative underwriting assumptions.",
            "credit": "Transitional conditions warrant monitoring. Maintain standard underwriting thresholds.",
            "pds": "Construction demand mixed. Pipeline health check recommended.",
        },
        "risk_off": {
            "repe": "Risk-Off regime signals cap rate expansion pressure. CMBS spreads elevated — stress-test assumptions.",
            "credit": "Risk-Off conditions recommend tighter underwriting thresholds. Flag elevated DTI and LTV.",
            "pds": "Construction pipeline demand may soften. Watch housing starts and permit data.",
        },
        "stress": {
            "repe": "Stress regime — significant cap rate expansion risk. Prioritize defensive assets; avoid speculative ground-up.",
            "credit": "Stress regime triggers maximum underwriting conservatism. Hard caps on DTI/LTV recommended.",
            "pds": "Construction sector stress likely. Review pipeline for cancellation/deferral risk.",
        },
    }
    return implications.get(regime, implications["transitional"])


# ── Signal computation ───────────────────────────────────────────────────────


def _compute_equities_score(cur) -> AssetClassSignal:
    """
    Signals:
    - SPX price vs. 200-day MA (above = bullish)
    - VIX level (< 15 = risk-on, > 30 = stress)
    - SPX 20-day return momentum
    """
    signals: list[dict[str, Any]] = []
    scores: list[float] = []

    try:
        cur.execute(
            """
            SELECT ticker, metric, value, as_of_date
            FROM fact_market_timeseries
            WHERE ticker IN ('SPX', 'VIX')
              AND metric IN ('close', 'ma_200', 'rsi_14', 'return_20d')
              AND as_of_date = (
                SELECT MAX(as_of_date)
                FROM fact_market_timeseries
                WHERE ticker = 'SPX'
              )
            ORDER BY ticker, metric
            """,
        )
        rows = cur.fetchall()
        data: dict[tuple[str, str], float] = {
            (r["ticker"], r["metric"]): float(r["value"])
            for r in rows
            if r.get("value") is not None
        }

        spx_close = data.get(("SPX", "close"))
        spx_ma200 = data.get(("SPX", "ma_200"))
        vix = data.get(("VIX", "close"))
        rsi = data.get(("SPX", "rsi_14"))
        ret20 = data.get(("SPX", "return_20d"))

        if spx_close and spx_ma200:
            ratio = spx_close / spx_ma200
            s = _clamp((ratio - 0.85) / 0.30)  # 0.85 → 0, 1.15 → 1
            scores.append(s)
            signals.append({"name": "SPX vs MA200", "value": round(ratio, 4), "score": round(s, 3)})

        if vix:
            # VIX 12 → 1.0 (calm), VIX 40 → 0.0 (panic)
            s = _clamp((40.0 - vix) / 28.0)
            scores.append(s)
            signals.append({"name": "VIX level", "value": round(vix, 2), "score": round(s, 3)})

        if rsi:
            # RSI 30 → 0.0, RSI 70 → 1.0
            s = _clamp((rsi - 30.0) / 40.0)
            scores.append(s * 0.5 + 0.25)  # moderate influence, bias toward middle
            signals.append({"name": "SPX RSI(14)", "value": round(rsi, 2), "score": round(s, 3)})

        if ret20:
            s = _clamp((ret20 + 0.15) / 0.30)  # -15% → 0, +15% → 1
            scores.append(s)
            signals.append({"name": "SPX 20d return", "value": round(ret20, 4), "score": round(s, 3)})

    except Exception:
        pass

    composite = sum(scores) / len(scores) if scores else 0.5
    return AssetClassSignal(
        score=round(_clamp(composite), 4),
        weight=0.30,
        signals=signals,
    )


def _compute_rates_score(cur) -> AssetClassSignal:
    """
    Signals:
    - 2s10s yield spread (positive = normal curve, bullish; inverted = stress)
    - 10Y vs. 12-month MA (above = rates rising, bearish for duration)
    """
    signals: list[dict[str, Any]] = []
    scores: list[float] = []

    try:
        cur.execute(
            """
            SELECT ticker, metric, value
            FROM fact_market_timeseries
            WHERE ticker IN ('US2Y', 'US10Y', 'FEDFUNDS')
              AND metric IN ('yield', 'ma_252')
              AND as_of_date = (
                SELECT MAX(as_of_date)
                FROM fact_market_timeseries
                WHERE ticker = 'US10Y'
              )
            ORDER BY ticker, metric
            """,
        )
        rows = cur.fetchall()
        data: dict[tuple[str, str], float] = {
            (r["ticker"], r["metric"]): float(r["value"])
            for r in rows
            if r.get("value") is not None
        }

        us2y = data.get(("US2Y", "yield"))
        us10y = data.get(("US10Y", "yield"))
        us10y_ma = data.get(("US10Y", "ma_252"))

        if us2y and us10y:
            spread = us10y - us2y
            # 2s10s: +1.5 = normal/bullish, -0.5 = deeply inverted/stress
            s = _clamp((spread + 0.5) / 2.0)
            scores.append(s)
            signals.append({
                "name": "2s10s spread",
                "value": round(spread * 100, 1),
                "unit": "bps",
                "score": round(s, 3),
            })

        if us10y and us10y_ma:
            # 10Y above MA = rates rising trend → somewhat bearish for risk assets
            ratio = us10y / us10y_ma
            s = _clamp(1.0 - abs(ratio - 1.0) * 5.0)  # near MA = neutral
            scores.append(s * 0.5 + 0.25)
            signals.append({
                "name": "10Y vs MA252",
                "value": round(ratio, 4),
                "score": round(s, 3),
            })

    except Exception:
        pass

    composite = sum(scores) / len(scores) if scores else 0.5
    return AssetClassSignal(
        score=round(_clamp(composite), 4),
        weight=0.25,
        signals=signals,
    )


def _compute_credit_score(cur) -> AssetClassSignal:
    """
    Signals:
    - HY spread level (low = risk-on, high = risk-off)
    - IG spread level
    Falls back to neutral (0.5) if no data available.
    """
    signals: list[dict[str, Any]] = []
    scores: list[float] = []

    try:
        cur.execute(
            """
            SELECT ticker, metric, value
            FROM fact_market_timeseries
            WHERE ticker IN ('HYG_SPREAD', 'IG_SPREAD', 'CDX_IG')
              AND metric = 'spread_bps'
              AND as_of_date = (
                SELECT MAX(as_of_date)
                FROM fact_market_timeseries
                WHERE ticker = 'HYG_SPREAD'
              )
            ORDER BY ticker
            """,
        )
        rows = cur.fetchall()
        for r in rows:
            if r.get("value") is None:
                continue
            spread = float(r["value"])
            ticker = r["ticker"]
            if ticker == "HYG_SPREAD":
                # HY spreads: 300bps = risk-on (1.0), 800bps = stress (0.0)
                s = _clamp((800.0 - spread) / 500.0)
                scores.append(s)
                signals.append({
                    "name": "HY OAS spread",
                    "value": round(spread, 0),
                    "unit": "bps",
                    "score": round(s, 3),
                })
            elif ticker in ("IG_SPREAD", "CDX_IG"):
                # IG spreads: 80bps = calm (1.0), 200bps = stress (0.0)
                s = _clamp((200.0 - spread) / 120.0)
                scores.append(s)
                signals.append({
                    "name": "IG OAS spread",
                    "value": round(spread, 0),
                    "unit": "bps",
                    "score": round(s, 3),
                })
    except Exception:
        pass

    composite = sum(scores) / len(scores) if scores else 0.5
    return AssetClassSignal(
        score=round(_clamp(composite), 4),
        weight=0.25,
        signals=signals,
    )


def _compute_crypto_score(cur) -> AssetClassSignal:
    """
    Signals:
    - BTC 30-day return
    - BTC dominance trend
    """
    signals: list[dict[str, Any]] = []
    scores: list[float] = []

    try:
        cur.execute(
            """
            SELECT ticker, metric, value
            FROM fact_market_timeseries
            WHERE ticker IN ('BTC', 'BTC_DOMINANCE')
              AND metric IN ('return_30d', 'pct', 'close')
              AND as_of_date = (
                SELECT MAX(as_of_date)
                FROM fact_market_timeseries
                WHERE ticker = 'BTC'
              )
            ORDER BY ticker, metric
            """,
        )
        rows = cur.fetchall()
        data: dict[tuple[str, str], float] = {
            (r["ticker"], r["metric"]): float(r["value"])
            for r in rows
            if r.get("value") is not None
        }

        btc_ret = data.get(("BTC", "return_30d"))
        btc_dom = data.get(("BTC_DOMINANCE", "pct"))

        if btc_ret is not None:
            s = _clamp((btc_ret + 0.30) / 0.60)  # -30% → 0, +30% → 1
            scores.append(s)
            signals.append({
                "name": "BTC 30d return",
                "value": round(btc_ret * 100, 2),
                "unit": "%",
                "score": round(s, 3),
            })

        if btc_dom is not None:
            # BTC dominance 40% = high dominance (fear, risk-off for altcoins)
            # 60% = normalized; treat neutral
            s = 0.5  # neutral signal for now
            signals.append({
                "name": "BTC dominance",
                "value": round(btc_dom, 1),
                "unit": "%",
                "score": s,
            })

    except Exception:
        pass

    composite = sum(scores) / len(scores) if scores else 0.5
    return AssetClassSignal(
        score=round(_clamp(composite), 4),
        weight=0.20,
        signals=signals,
    )


# ── Core computation ─────────────────────────────────────────────────────────


def compute_regime_snapshot(tenant_id: UUID | None = None) -> RegimeSnapshot:
    """
    Compute a new regime snapshot from live signal data and persist it.
    Returns the persisted RegimeSnapshot.
    """
    with get_cursor() as cur:
        eq = _compute_equities_score(cur)
        ra = _compute_rates_score(cur)
        cr = _compute_credit_score(cur)
        cy = _compute_crypto_score(cur)

        composite = (
            eq.score * eq.weight
            + ra.score * ra.weight
            + cr.score * cr.weight
            + cy.score * cy.weight
        )
        regime_label, confidence = _regime_from_composite(composite)

        signal_breakdown = {
            "equities": {"score": eq.score, "weight": eq.weight, "signals": eq.signals},
            "rates":    {"score": ra.score, "weight": ra.weight, "signals": ra.signals},
            "credit":   {"score": cr.score, "weight": cr.weight, "signals": cr.signals},
            "crypto":   {"score": cy.score, "weight": cy.weight, "signals": cy.signals},
        }
        cross_vertical = _cross_vertical_implications(regime_label)
        source_metrics = {
            "composite_score": round(composite, 4),
            "pillars_with_data": sum(
                1 for p in [eq, ra, cr, cy] if p.signals
            ),
        }

        cur.execute(
            """
            INSERT INTO public.market_regime_snapshot
              (tenant_id, regime_label, confidence, signal_breakdown,
               cross_vertical_implications, source_metrics)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            RETURNING snapshot_id, calculated_at
            """,
            (
                str(tenant_id) if tenant_id else None,
                regime_label,
                confidence,
                json.dumps(signal_breakdown),
                json.dumps(cross_vertical),
                json.dumps(source_metrics),
            ),
        )
        row = cur.fetchone()

    return RegimeSnapshot(
        snapshot_id=str(row["snapshot_id"]),
        calculated_at=row["calculated_at"].isoformat(),
        regime_label=regime_label,
        confidence=confidence,
        signal_breakdown=signal_breakdown,
        cross_vertical_implications=cross_vertical,
        source_metrics=source_metrics,
    )


def get_latest_regime(tenant_id: UUID | None = None) -> RegimeSnapshot | None:
    """Return the most recent regime snapshot (no recompute)."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_id, calculated_at, regime_label, confidence,
                   signal_breakdown, cross_vertical_implications, source_metrics
            FROM public.market_regime_snapshot
            WHERE (tenant_id = %s OR tenant_id IS NULL)
            ORDER BY calculated_at DESC
            LIMIT 1
            """,
            (str(tenant_id) if tenant_id else None,),
        )
        row = cur.fetchone()
    if not row:
        return None
    return RegimeSnapshot(
        snapshot_id=str(row["snapshot_id"]),
        calculated_at=row["calculated_at"].isoformat(),
        regime_label=row["regime_label"],
        confidence=float(row["confidence"]),
        signal_breakdown=row["signal_breakdown"] or {},
        cross_vertical_implications=row["cross_vertical_implications"] or {},
        source_metrics=row["source_metrics"] or {},
    )


def list_regime_history(
    tenant_id: UUID | None = None,
    days: int = 90,
) -> list[RegimeSnapshot]:
    """Return up to `days` worth of daily regime snapshots, newest first."""
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT snapshot_id, calculated_at, regime_label, confidence,
                   signal_breakdown, cross_vertical_implications, source_metrics
            FROM public.market_regime_snapshot
            WHERE (tenant_id = %s OR tenant_id IS NULL)
              AND calculated_at >= NOW() - (%s || ' days')::interval
            ORDER BY calculated_at DESC
            LIMIT 180
            """,
            (str(tenant_id) if tenant_id else None, days),
        )
        rows = cur.fetchall()
    return [
        RegimeSnapshot(
            snapshot_id=str(r["snapshot_id"]),
            calculated_at=r["calculated_at"].isoformat(),
            regime_label=r["regime_label"],
            confidence=float(r["confidence"]),
            signal_breakdown=r["signal_breakdown"] or {},
            cross_vertical_implications=r["cross_vertical_implications"] or {},
            source_metrics=r["source_metrics"] or {},
        )
        for r in rows
    ]
