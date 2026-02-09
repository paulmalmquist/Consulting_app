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
    }
  }, [departments, loadingDepartments, router]);

  if (!businessId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">No Business Configured</h2>
        <p className="text-slate-400 text-sm mb-6">Set up your business to get started.</p>
        <a
          href="/onboarding"
          className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          Start Setup
        </a>
      </div>
    );
  }

  if (loadingDepartments) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded" />
        <div className="h-32 bg-slate-800 rounded-lg" />
        <div className="h-32 bg-slate-800 rounded-lg" />
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">No Departments Provisioned</h2>
        <p className="text-slate-400 text-sm mb-6">
          Your business has no enabled departments. Update your configuration.
        </p>
        <a
          href="/onboarding"
          className="bg-sky-600 hover:bg-sky-500 text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          Reconfigure
        </a>
      </div>
    );
  }

  return null;
}
