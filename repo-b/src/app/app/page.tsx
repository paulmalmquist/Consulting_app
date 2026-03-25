"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";

export default function AppIndexPage() {
  const router = useRouter();
  const { businessId, departments, loadingDepartments } = useBusinessContext();

  useEffect(() => {
    if (loadingDepartments) return;

    if (departments.length > 0) {
      router.replace(`/app/${departments[0].key}`);
      return;
    }

    // No business or no departments — redirect to env home or environments list
    const envId =
      typeof window !== "undefined"
        ? localStorage.getItem("demo_lab_env_id")
        : null;

    if (envId) {
      router.replace(`/lab/env/${envId}`);
    } else {
      router.replace("/lab/environments");
    }
  }, [departments, loadingDepartments, businessId, router]);

  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-bm-surface/60 border border-bm-border/60 rounded" />
      <div className="h-32 bg-bm-surface/60 border border-bm-border/60 rounded-lg" />
      <div className="h-32 bg-bm-surface/60 border border-bm-border/60 rounded-lg" />
    </div>
  );
}
