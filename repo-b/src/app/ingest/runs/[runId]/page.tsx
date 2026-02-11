"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import IngestRunDetailView from "@/components/ingest/IngestRunDetailView";

export default function IngestRunPage() {
  const params = useParams();
  const runId = (params?.runId as string) || "";

  if (!runId) {
    return <p className="text-sm text-bm-danger">Invalid run ID.</p>;
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href="/ingest/sources" className="text-xs text-bm-muted2 underline">
          Back to sources
        </Link>
        <h1 className="text-xl font-bold mt-1">Ingest Run Details</h1>
      </div>
      <IngestRunDetailView runId={runId} />
    </div>
  );
}
