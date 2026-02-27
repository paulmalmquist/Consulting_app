"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Inner component that reads searchParams.
 * Must be wrapped in Suspense because useSearchParams() opts into client-side rendering.
 */
function DebugFooterInner({
  envId,
  fundId,
  businessId,
}: {
  envId?: string | null;
  fundId?: string | null;
  businessId?: string | null;
}) {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";
  const [apiBase, setApiBase] = useState<string>("");
  const [lastApiStatus, setLastApiStatus] = useState<string>("idle");

  useEffect(() => {
    if (!debug) return;
    const base =
      process.env.NEXT_PUBLIC_BOS_API_BASE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    setApiBase(base);

    // Listen for fetch events to track last API call
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const res = await origFetch(...args);
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        if (url.includes("/api/") || url.includes("/bos/")) {
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

  if (!debug) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-300 text-[10px] px-4 py-1 flex gap-6 z-50 font-mono"
      data-testid="debug-footer"
    >
      <span>
        envId: <strong className="text-white">{envId || "—"}</strong>
      </span>
      <span>
        fundId: <strong className="text-white">{fundId || "—"}</strong>
      </span>
      <span>
        businessId: <strong className="text-white">{businessId?.slice(0, 8) || "—"}</strong>
      </span>
      <span>
        API: <strong className="text-white">{apiBase || "same-origin"}</strong>
      </span>
      <span>
        supabase: <strong className="text-white">ozboonlsplroialdwuxj</strong>
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
}) {
  return (
    <Suspense fallback={null}>
      <DebugFooterInner {...props} />
    </Suspense>
  );
}
