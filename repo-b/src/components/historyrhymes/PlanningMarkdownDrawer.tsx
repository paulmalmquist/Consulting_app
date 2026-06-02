"use client";

import React, { useEffect, useState } from "react";
import { fetchPlanningMarkdown } from "@/lib/historyrhymes/client";

interface Props {
  candidateId: string | null;
  onClose: () => void;
}

export function PlanningMarkdownDrawer({ candidateId, onClose }: Props) {
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!candidateId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCopied(false);
    fetchPlanningMarkdown(candidateId)
      .then((res) => {
        if (cancelled) return;
        if (!res) setError("Plan not found.");
        else setMarkdown(res.planning_markdown);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (!candidateId) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    } catch {
      setError("Clipboard unavailable — select the text manually.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      data-testid="hr-plan-drawer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-neutral-950 border-l border-neutral-800 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <span className="text-sm font-semibold text-neutral-200">
            Planning-agent plan
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={loading || !markdown}
              className="text-xs px-3 py-1 rounded border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1 rounded border border-neutral-700 text-neutral-400 hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {loading && (
            <div className="text-xs text-neutral-500">Loading plan…</div>
          )}
          {error && <div className="text-xs text-red-400">{error}</div>}
          {!loading && !error && (
            <pre className="text-xs text-neutral-300 whitespace-pre-wrap break-words font-mono">
              {markdown}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
