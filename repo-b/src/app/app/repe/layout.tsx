"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

async function resolveEnvId(): Promise<string | null> {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("demo_lab_env_id");
    if (stored) return stored;
  }
  try {
    const res = await fetch("/api/v1/environments", { credentials: "include" });
    if (!res.ok) return null;
    const json = (await res.json()) as { environments?: Array<{ env_id: string }> };
    return json.environments?.[0]?.env_id || null;
  } catch {
    return null;
  }
}

export default function RepeLegacyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const suffix = pathname.replace(/^\/app\/repe/, "") || "";
    void (async () => {
      const envId = await resolveEnvId();
      if (cancelled) return;
      if (!envId) {
        router.replace("/app");
        return;
      }
      const normalizedSuffix = suffix === "/portfolio" ? "" : suffix;
      router.replace(`/lab/env/${envId}/re${normalizedSuffix}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
