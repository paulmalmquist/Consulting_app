"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEnv } from "@/components/EnvProvider";

export default function MarketIntelligenceRedirect() {
  const router = useRouter();
  const { selectedEnv } = useEnv();

  useEffect(() => {
    if (selectedEnv) {
      router.replace(`/lab/env/${selectedEnv.env_id}/markets`);
    }
  }, [selectedEnv, router]);

  if (selectedEnv) {
    return (
      <div className="flex h-64 items-center justify-center text-bm-muted text-sm">
        Redirecting to Trading Lab…
      </div>
    );
  }

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm">
      <p className="text-bm-muted">Select an environment to open Trading Lab.</p>
      <Link
        href="/app"
        className="rounded-md bg-bm-accent px-4 py-2 text-white text-sm font-medium hover:opacity-90"
      >
        Go to Workspace Access
      </Link>
    </div>
  );
}
