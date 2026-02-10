"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";

export default function BosAppShell({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const deptKey = (params?.deptKey as string) || null;
  const capKey = (params?.capKey as string) || null;
  const { setActiveDeptKey } = useBusinessContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Sync route params to context
  useEffect(() => {
    if (deptKey) {
      setActiveDeptKey(deptKey);
    }
  }, [deptKey, setActiveDeptKey]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [deptKey, capKey]);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-bm-bg text-bm-text flex flex-col">
      <TopBar
        activeDeptKey={deptKey}
        onHamburgerClick={() => setSidebarOpen(true)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeDeptKey={deptKey}
          activeCapKey={capKey}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-safe">
          {children}
        </main>
      </div>
    </div>
  );
}
