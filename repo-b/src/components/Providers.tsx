"use client";

import { ToastProvider } from "@/components/ui/Toast";
import GlobalCommandBar from "@/components/commandbar/GlobalCommandBar";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <GlobalCommandBar />
    </ToastProvider>
  );
}
