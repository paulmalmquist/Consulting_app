"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type PipelineStats = {
  fund_exists: boolean;
  investment_count: number;
  asset_count: number;
  snapshot_exists: boolean;
  time_series_points: number;
  failure_reason: string | null;
  status: "PASS" | "FAIL";
} | null;

/**
 * Inner component that reads searchParams.
 * Must be wrapped in Suspense because useSearchParams() opts into client-side rendering.
 */
function DebugFooterInner({
  envId,
  fundId,
  businessId,
  quarter,
}: {
  envId?: string | null;
  fundId?: string | null;
  businessId?: string | null;
  quarter?: string | null;
}) {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";
  const [apiBase, setApiBase] = useState<string>("");
  const [lastApiStatus, setLastApiStatus] = useState<string>("idle");
  const [pipeline, setPipeline] = useState<PipelineStats>(null);
  const [pipelineLoading, setPipelineLoading] = useState(false);

  useEffect(() => {
    if (!debug) return;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    setApiBase(base);

    // Listen for fetch events to track last API call
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const res = await origFetch(...args);
        const raw = args[0];
        const url =
          typeof raw === "string"
            ? raw
            : raw instanceof URL
              ? raw.href
              : (raw as Request)?.url;
        if (url?.includes("/api/") || url?.includes("/bos/")) {
          setLastApiStatus(`${res.status} ${url.split("?")[0].split("/").slice(-3).join("/")}`);
        }
        return res;
      } catch (err) {
        setLastApiStatus(`ERR ${String(err).slice(0, 50)}`);
        throw err;
      }
    };

    return () => {
      window.fetch = origFetch;
    };
  }, [debug]);

  // Fetch pipeline diagnostics when debug=1 and we have the required IDs
  useEffect(() => {
    if (!debug || !fundId || !envId || !quarter) return;

    setPipelineLoading(true);
    const params = new URLSearchParams({ env_id: envId, quarter });
    fetch(`/api/re/v2/funds/${fundId}/pipeline-status?${params}`)
      .then((r) => r.json())
      .then((data) => setPipeline(data as PipelineStats))
      .catch(() => setPipeline(null))
      .finally(() => setPipelineLoading(false));
  }, [debug, fundId, envId, quarter]);

  if (!debug) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-300 text-[10px] px-4 py-1 flex flex-wrap gap-x-6 gap-y-1 z-50 font-mono"
      data-testid="debug-footer"
    >
      <span>
        envId: <strong className="text-white">{envId || "—"}</strong>
      </span>
      <span>
        fundId: <strong className="text-white">{fundId?.slice(0, 8) || "—"}</strong>
      </span>
      <span>
        businessId: <strong className="text-white">{businessId?.slice(0, 8) || "—"}</strong>
      </span>
      <span>
        period: <strong className="text-white">{quarter || "—"}</strong>
      </span>
      {pipelineLoading ? (
        <span className="text-gray-500">pipeline: loading…</span>
      ) : pipeline ? (
        <>
          <span>
            investments: <strong className="text-white">{pipeline.investment_count}</strong>
          </span>
          <span>
            assets: <strong className="text-white">{pipeline.asset_count}</strong>
          </span>
          <span>
            snapshots: <strong className={pipeline.snapshot_exists ? "text-green-400" : "text-red-400"}>
              {pipeline.snapshot_exists ? "✓" : "✗"}
            </strong>
          </span>
          <span>
            series: <strong className="text-white">{pipeline.time_series_points}</strong>
          </span>
          {pipeline.failure_reason && (
            <span>
              failure: <strong className="text-red-400">{pipeline.failure_reason}</strong>
            </span>
          )}
        </>
      ) : null}
      <span>
        API: <strong className="text-white">{apiBase || "same-origin"}</strong>
      </span>
      <span>
        last: <strong className="text-yellow-400">{lastApiStatus}</strong>
      </span>
    </div>
  );
}

/**
 * Debug footer activated by ?debug=1 in the URL.
 * Wrapped in Suspense because useSearchParams() requires it in Next.js App Router.
 */
export function DebugFooter(props: {
  envId?: string | null;
  fundId?: string | null;
  businessId?: string | null;
  quarter?: string | null;
}) {
  return (
    <Suspense fallback={null}>
      <DebugFooterInner {...props} />
    </Suspense>
  );
}
