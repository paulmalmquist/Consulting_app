"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import IngestSourceWizard from "@/components/ingest/IngestSourceWizard";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function IngestSourceDetailPage() {
  const params = useParams();
  const sourceId = (params?.sourceId as string) || "";
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

  if (!sourceId) {
    return <p className="text-sm text-bm-danger">Invalid source ID.</p>;
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href="/ingest/sources" className="text-xs text-bm-muted2 underline">
          Back to sources
        </Link>
        <h1 className="text-xl font-bold mt-1">Ingestion Wizard</h1>
      </div>
      <IngestSourceWizard sourceId={sourceId} businessId={businessId} />
    </div>
  );
}
