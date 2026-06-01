"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import TelemetrySidebar from "./TelemetrySidebar";

export default function TelemetryShell({
  envId,
  children,
}: {
  envId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text">
      <div className="border-b border-bm-border/70 bg-bm-surface/30">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-3 lg:px-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-bm-muted2">
              Telemetry Anomaly Platform
            </p>
            <p className="text-xs text-bm-muted">Engine-test telemetry → automated go/no-go</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-bm-border/70 px-3 py-1.5 text-xs text-bm-muted hover:text-bm-text lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            Menu
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[240px,1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3">
              <TelemetrySidebar envId={envId} />
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[88vw] border-r border-bm-border/70 bg-bm-bg p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-bm-text">Navigate</p>
              <button
                type="button"
                className="rounded-md border border-bm-border/70 px-2 py-1 text-xs text-bm-muted hover:text-bm-text"
                onClick={() => setDrawerOpen(false)}
              >
                Close
              </button>
            </div>
            <TelemetrySidebar envId={envId} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
