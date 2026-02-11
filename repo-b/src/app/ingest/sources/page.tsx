"use client";

import Link from "next/link";
import { useBusinessContext } from "@/lib/business-context";
import IngestSourcesView from "@/components/ingest/IngestSourcesView";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function IngestSourcesPage() {
  const { businessId } = useBusinessContext();

  if (!businessId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h2 className="text-xl font-semibold mb-2">No Business Configured</h2>
        <p className="text-bm-muted text-sm mb-6">Set up your business before using ingestion.</p>
        <Link href="/onboarding" className={buttonVariants({ variant: "primary" })}>
          Start Setup
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">Ingest Sources</h1>
      <p className="text-sm text-bm-muted">
        Create ingestion sources from manual CSV/XLSX uploads and existing documents.
      </p>
      <IngestSourcesView businessId={businessId} />
    </div>
  );
}
