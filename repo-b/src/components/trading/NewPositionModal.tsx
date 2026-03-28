"use client";

import React, { useState } from "react";
import type { TradingHypothesis, AssetClass, PositionDirection } from "@/lib/trading-lab/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  hypotheses: TradingHypothesis[];
  theme: any; // buildTheme() returns nested object with chart sub-object
}

const ASSET_CLASSES: AssetClass[] = [
  "equity", "etf", "index", "crypto", "bond", "commodity", "option", "reit", "other",
];

export function NewPositionModal({ open, onClose, onCreated, hypotheses, theme: t }: Props) {
  const [ticker, setTicker] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("crypto");
  const [direction, setDirection] = useState<PositionDirection>("long");
  const [hypothesisId, setHypothesisId] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [size, setSize] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const notional =
    entryPrice && size ? (parseFloat(entryPrice) * parseFloat(size)).toFixed(2) : "0.00";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!ticker || !assetName || !hypothesisId || !entryPrice || !size) {
      setError("Ticker, asset name, hypothesis, entry price, and size are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/trading/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypothesis_id: hypothesisId,
          ticker: ticker.toUpperCase(),
          asset_name: assetName,
          asset_class: assetClass,
          direction,
          entry_price: parseFloat(entryPrice),
          size: parseFloat(size),
          notional: parseFloat(notional),
          stop_loss: stopLoss ? parseFloat(stopLoss) : undefined,
          take_profit: takeProfit ? parseFloat(takeProfit) : undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create position");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${t.cardBg} border ${t.cardBorder} rounded-lg shadow-xl w-full max-w-lg p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>New Position</h2>
          <button onClick={onClose} className={`${t.textMuted} hover:${t.textPrimary} text-xl leading-none`}>
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-500/20 text-red-400 text-xs rounded">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          {/* Hypothesis */}
          <div>
            <label className={`block mb-1 ${t.textSecondary}`}>Hypothesis</label>
            <select
              value={hypothesisId}
              onChange={(e) => setHypothesisId(e.target.value)}
              className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
            >
              <option value="">Select hypothesis...</option>
              {hypotheses.filter(h => h.status === "active" || h.status === "draft").map((h) => (
                <option key={h.hypothesis_id} value={h.hypothesis_id}>
                  {h.thesis.slice(0, 60)}
                </option>
              ))}
            </select>
          </div>

          {/* Ticker + Asset Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Ticker</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="BTC-USD"
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Asset Name</label>
              <input
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="Bitcoin"
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
          </div>

          {/* Asset Class + Direction */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Asset Class</label>
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              >
                {ASSET_CLASSES.map((ac) => (
                  <option key={ac} value={ac}>{ac}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Direction</label>
              <div className="flex gap-2 mt-1">
                {(["long", "short"] as PositionDirection[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`flex-1 py-1.5 rounded text-xs font-bold border ${
                      direction === d
                        ? d === "long"
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-red-600 text-white border-red-600"
                        : `${t.cardBg} ${t.cardBorder} ${t.textMuted}`
                    }`}
                  >
                    {d.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Entry Price + Size */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Entry Price</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Size</label>
              <input
                type="number"
                step="any"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Notional</label>
              <div className={`px-2 py-1.5 rounded border ${t.inputBg} ${t.textMuted}`}>
                ${notional}
              </div>
            </div>
          </div>

          {/* Stop Loss + Take Profit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Stop Loss</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
            <div>
              <label className={`block mb-1 ${t.textSecondary}`}>Take Profit</label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={`block mb-1 ${t.textSecondary}`}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Trade rationale..."
              className={`w-full px-2 py-1.5 rounded border ${t.inputBg}`}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded text-sm border ${t.cardBorder} ${t.textSecondary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Open Position"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
