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

function domainFromPath(pathname: string): "pds" | "credit" | "legal" | "medical" {
  if (pathname.startsWith("/app/pds")) return "pds";
  if (pathname.startsWith("/app/credit")) return "credit";
  if (pathname.startsWith("/app/legal")) return "legal";
  return "medical";
}

export default function LegacyDomainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const domain = domainFromPath(pathname);
    const suffix = pathname.replace(new RegExp(`^/app/${domain}`), "") || "";

    void (async () => {
      const envId = await resolveEnvId();
      if (cancelled) return;
      if (!envId) {
        router.replace("/lab/environments");
        return;
      }
      router.replace(`/lab/env/${envId}/${domain}${suffix}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
