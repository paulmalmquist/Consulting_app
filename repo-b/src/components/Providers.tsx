"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ToastProvider } from "@/components/ui/Toast";
import GlobalCommandBar from "@/components/commandbar/GlobalCommandBar";
import { applyThemeMode, getStoredThemeMode } from "@/lib/theme";
import { WinstonCompanionProvider } from "@/components/winston-companion/WinstonCompanionProvider";
import WinstonLoader from "@/components/ui/WinstonLoader";
import { winstonLoader } from "@/lib/loading-state";

/**
 * Listens for pathname changes and drives the global loader for route transitions.
 * Separate component so usePathname() subscribes inside Next.js's Suspense boundary.
 */
function RouteChangeListener() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  // Route landed — end the loading signal
  useEffect(() => {
    if (prevPath.current !== null && prevPath.current !== pathname) {
      winstonLoader.routeEnd();
    }
    prevPath.current = pathname;
  }, [pathname]);

  // Intercept anchor clicks to fire routeStart before the navigation commits.
  // Next.js 14 app router doesn't expose router-event hooks on the client.
  useEffect(() => {
    function onAnchorClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (target.target === "_blank") return;
      try {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname !== window.location.pathname) {
          winstonLoader.routeStart();
        }
      } catch {
        // ignore malformed hrefs
      }
    }
    document.addEventListener("click", onAnchorClick, { capture: true });
    return () => document.removeEventListener("click", onAnchorClick, { capture: true });
  }, []);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyThemeMode(getStoredThemeMode());
  }, []);

  return (
    <ToastProvider>
      <WinstonCompanionProvider>
        <RouteChangeListener />
        {children}
        <GlobalCommandBar />
        <WinstonLoader />
      </WinstonCompanionProvider>
    </ToastProvider>
  );
}
