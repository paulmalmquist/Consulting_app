"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  fetchMarketFeatureCards,
  fetchMarketSegments,
  formatCardStatus,
  formatGapCategory,
  type TradingFeatureCard,
  type MarketSegment,
} from "@/lib/market-intelligence/feature-cards";

type FilterState = {
  status?: string;
  gapCategory?: string;
  segmentId?: string;
};

export function MarketFeatureCardsPanel() {
  const [cards, setCards] = useState<TradingFeatureCard[]>([]);
  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cardsData, segmentsData] = await Promise.all([
        fetchMarketFeatureCards(filters),
        fetchMarketSegments(),
      ]);
      setCards(cardsData);
      setSegments(segmentsData);
    } catch (error) {
      console.error("Failed to load market feature data:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const uniqueStatuses = Array.from(new Set(cards.map((c) => c.status)));
  const uniqueCategories = Array.from(new Set(cards.map((c) => c.gap_category)));

  const filteredCards = cards.filter((card) => {
    if (filters.status && card.status !== filters.status) return false;
    if (filters.gapCategory && card.gap_category !== filters.gapCategory) return false;
    if (filters.segmentId && card.segment_id !== filters.segmentId) return false;
    return true;
  });

  const getSegmentName = (segmentId: string | null) => {
    if (!segmentId) return "Global";
    return segments.find((s) => s.segment_id === segmentId)?.segment_name || segmentId;
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 p-4 rounded">
        <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">
          Feature Gap Detection
        </h2>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-700 p-3 rounded animate-pulse h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded">
      <h2 className="text-sm font-mono uppercase tracking-wider text-green-400 mb-4">
        Feature Gap Detection
      </h2>

      {/* Filter Controls */}
      <div className="mb-4 p-3 bg-gray-700/50 rounded flex flex-wrap gap-3">
        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Status</label>
          <select
            value={filters.status || ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                status: e.target.value || undefined,
              })
            }
            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-100"
          >
            <option value="">All</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {formatCardStatus(status).label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Category</label>
          <select
            value={filters.gapCategory || ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                gapCategory: e.target.value || undefined,
              })
            }
            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-100"
          >
            <option value="">All</option>
            {uniqueCategories.map((category) => (
              <option key={category} value={category}>
                {formatGapCategory(category)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Segment</label>
          <select
            value={filters.segmentId || ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                segmentId: e.target.value || undefined,
              })
            }
            className="px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs font-mono text-gray-100"
          >
            <option value="">All Segments</option>
            {segments.map((segment) => (
              <option key={segment.segment_id} value={segment.segment_id}>
                {segment.segment_name}
              </option>
            ))}
          </select>
        </div>

        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => setFilters({})}
            className="px-2 py-1 bg-red-900/30 text-red-300 rounded text-xs hover:bg-red-900/50 self-end"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Cards List */}
      {filteredCards.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          No feature cards match the current filters.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredCards.map((card) => {
            const isExpanded = expandedCard === card.card_id;
            const statusInfo = formatCardStatus(card.status);
            const categoryLabel = formatGapCategory(card.gap_category);
            const segmentName = getSegmentName(card.segment_id);

            return (
              <div
                key={card.card_id}
                className="bg-gray-700 border border-gray-600 p-3 rounded hover:bg-gray-700/80 transition-colors"
              >
                <div
                  className="cursor-pointer"
                  onClick={() =>
                    setExpandedCard(isExpanded ? null : card.card_id || null)
                  }
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex-1">
                      <h3 className="text-xs font-mono font-bold text-blue-300 mb-1">
                        {card.title}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-gray-600 text-gray-300">
                          {categoryLabel}
                        </span>
                        {card.segment_id && (
                          <span className="px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300">
                            {segmentName}
                          </span>
                        )}
                        {card.cross_vertical_flag && (
                          <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-300">
                            Cross-Vertical
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {card.priority_score !== null && (
                        <div className="text-xs text-gray-400 mb-1">
                          Priority: <span className="font-mono text-green-400">{card.priority_score.toFixed(1)}</span>
                        </div>
                      )}
                      <span className="text-gray-500 text-xs">
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  {!isExpanded && card.description && (
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {card.description}
                    </p>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-600 space-y-2 text-xs">
                    {card.description && (
                      <div>
                        <div className="text-gray-500 font-mono uppercase text-xs mb-1">
                          Description
                        </div>
                        <p className="text-gray-300">{card.description}</p>
                      </div>
                    )}

                    {card.spec_json && Object.keys(card.spec_json).length > 0 && (
                      <div>
                        <div className="text-gray-500 font-mono uppercase text-xs mb-1">
                          Specification
                        </div>
                        <div className="bg-gray-800 p-2 rounded font-mono text-gray-400 text-xs max-h-32 overflow-y-auto">
                          <pre>{JSON.stringify(card.spec_json, null, 2)}</pre>
                        </div>
                      </div>
                    )}

                    {card.meta_prompt && (
                      <div>
                        <div className="text-gray-500 font-mono uppercase text-xs mb-1">
                          Build Prompt
                        </div>
                        <div className="bg-gray-800 p-2 rounded text-gray-300 text-xs max-h-24 overflow-y-auto">
                          {card.meta_prompt}
                        </div>
                      </div>
                    )}

                    {card.target_module && (
                      <div>
                        <span className="text-gray-500 font-mono uppercase text-xs">
                          Target Module:
                        </span>
                        <span className="text-gray-300 ml-2 text-xs font-mono">
                          {card.target_module}
                        </span>
                      </div>
                    )}

                    {card.lineage_note && (
                      <div>
                        <span className="text-gray-500 font-mono uppercase text-xs">
                          Note:
                        </span>
                        <p className="text-gray-300 text-xs mt-1">{card.lineage_note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500 border-t border-gray-600 pt-3">
        Showing {filteredCards.length} of {cards.length} cards
      </div>
    </div>
  );
}
