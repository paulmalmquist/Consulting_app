"use client";

import Link from "next/link";
import { useRepeBasePath } from "@/lib/repe-context";

export default function RepeDocumentsPage() {
  const basePath = useRepeBasePath();

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="re-documents-compat">
      <h2 className="text-lg font-semibold">Attachments</h2>
      <p className="text-sm text-bm-muted2">
        Documents are attached at the Fund, Investment, and Asset levels. Open an entity homepage to upload evidence.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={`${basePath}/funds`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Browse Funds
        </Link>
        <Link href={`${basePath}/deals`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Browse Investments
        </Link>
        <Link href={`${basePath}/assets`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Browse Assets
        </Link>
      </div>
    </section>
  );
}
