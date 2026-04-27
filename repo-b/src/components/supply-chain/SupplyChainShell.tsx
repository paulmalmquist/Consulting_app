"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import SupplyChainSidebar from "./SupplyChainSidebar";
import SupplyChainTopBar from "./SupplyChainTopBar";

export default function SupplyChainShell({
  envId,
  children,
}: {
  envId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on route change.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while mobile drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text">
      <SupplyChainTopBar envId={envId} onOpenSidebar={() => setDrawerOpen(true)} />
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-[68px] rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3">
              <SupplyChainSidebar envId={envId} />
            </div>
          </aside>
          <main className="min-w-0">{children}</main>
        </div>
      </div>

      {drawerOpen ? (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            className="absolute left-0 top-0 h-full w-72 max-w-[88vw] border-r border-bm-border/70 bg-bm-bg p-4"
            role="dialog"
            aria-modal="true"
            data-testid="supply-chain-drawer"
          >
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
            <SupplyChainSidebar envId={envId} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
