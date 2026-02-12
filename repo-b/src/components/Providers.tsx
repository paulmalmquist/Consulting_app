"use client";

import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { applyThemeMode, getStoredThemeMode } from "@/lib/theme";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyThemeMode(getStoredThemeMode());
  }, []);

  return <ToastProvider>{children}</ToastProvider>;
}
