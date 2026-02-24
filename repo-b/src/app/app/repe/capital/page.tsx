"use client";

import Link from "next/link";
import { useRepeBasePath } from "@/lib/repe-context";

export default function RepeCapitalPage() {
  const basePath = useRepeBasePath();

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="re-capital-compat">
      <h2 className="text-lg font-semibold">Capital</h2>
      <p className="text-sm text-bm-muted2">
        Capital roll-forwards are now fund-scoped modules on each Fund homepage.
      </p>
      <Link href={`${basePath}/funds`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
        Open Funds
      </Link>
    </section>
  );
}
