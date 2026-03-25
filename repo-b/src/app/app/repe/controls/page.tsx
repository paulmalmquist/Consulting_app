"use client";

import Link from "next/link";
import { useRepeBasePath } from "@/lib/repe-context";

export default function RepeControlsPage() {
  const basePath = useRepeBasePath();

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="re-controls-compat">
      <h2 className="text-lg font-semibold">Controls</h2>
      <p className="text-sm text-bm-muted2">
        Operational controls and approvals are shown in each entity module (Audit and workflow status).
      </p>
      <Link href={`${basePath}`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
        Return to RE Home
      </Link>
    </section>
  );
}
