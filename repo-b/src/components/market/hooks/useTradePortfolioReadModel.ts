"use client";

import { useEffect, useState } from "react";

import {
  getTradeClosedPortfolioPositions,
  getTradeOpenPortfolioPositions,
  getTradePortfolioAttribution,
  getTradePortfolioHistory,
  getTradePortfolioOverview,
} from "@/lib/bos-api";
import type {
  ClosedPortfolioPosition,
  OpenPortfolioPosition,
  PortfolioAttribution,
  PortfolioOverview,
  PortfolioSnapshotPoint,
} from "@/lib/trades/types";

export type PortfolioRangeKey = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

interface TradePortfolioReadModelState {
  loading: boolean;
  error: string | null;
  overview: PortfolioOverview | null;
  history: PortfolioSnapshotPoint[];
  openPositions: OpenPortfolioPosition[];
  closedPositions: ClosedPortfolioPosition[];
  attribution: PortfolioAttribution | null;
}

const EMPTY_ATTRIBUTION: PortfolioAttribution = {
  best_contributors: [],
  worst_contributors: [],
  realized_vs_unrealized: {},
  contribution_by_asset_class: [],
  contribution_by_strategy: [],
  largest_position_share_pct: 0,
  long_short_split: {},
};

export function useTradePortfolioReadModel(
  businessId: string | null,
  rangeKey: PortfolioRangeKey,
  accountMode = "paper",
): TradePortfolioReadModelState {
  const [state, setState] = useState<TradePortfolioReadModelState>({
    loading: false,
    error: null,
    overview: null,
    history: [],
    openPositions: [],
    closedPositions: [],
    attribution: EMPTY_ATTRIBUTION,
  });

  useEffect(() => {
    if (!businessId) {
      setState({
        loading: false,
        error: null,
        overview: null,
        history: [],
        openPositions: [],
        closedPositions: [],
        attribution: EMPTY_ATTRIBUTION,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    void Promise.all([
      getTradePortfolioOverview(businessId, { accountMode, rangeKey }),
      getTradePortfolioHistory(businessId, { accountMode, rangeKey }),
      getTradeOpenPortfolioPositions(businessId, { accountMode }),
      getTradeClosedPortfolioPositions(businessId, { accountMode }),
      getTradePortfolioAttribution(businessId, { accountMode }),
    ])
      .then(([overview, history, openPositions, closedPositions, attribution]) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: null,
          overview,
          history,
          openPositions,
          closedPositions,
          attribution,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load portfolio read model",
          overview: null,
          history: [],
          openPositions: [],
          closedPositions: [],
          attribution: EMPTY_ATTRIBUTION,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accountMode, businessId, rangeKey]);

  return state;
}
