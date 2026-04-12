"use client";

import React from "react";
import { usePathname } from "next/navigation";
import AccountMenu from "@/components/AccountMenu";
import { cn } from "@/lib/cn";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isImmersiveRoute = /^\/lab\/env\/[^/]+\/(markets|consulting\/pipeline)(\/|$)/.test(pathname);
  // Pipeline needs a proper flex column chain so the kanban fills remaining viewport height.
  const isPipelineRoute = /^\/lab\/env\/[^/]+\/consulting\/pipeline(\/|$)/.test(pathname);

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex flex-col">
      {!isImmersiveRoute ? (
        <header className="absolute top-0 right-0 z-50 p-4">
          <AccountMenu homePath="/app" />
        </header>
      ) : null}
      <main
        className={cn(
          "flex-1",
          isPipelineRoute
            ? "flex flex-col overflow-hidden"
            : isImmersiveRoute
              ? "overflow-y-auto"
              : "p-6 pt-14",
        )}
      >
        {children}
      </main>
    </div>
  );
}
