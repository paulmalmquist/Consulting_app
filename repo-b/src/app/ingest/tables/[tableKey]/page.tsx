"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBusinessContext } from "@/lib/business-context";
import IngestTableViewer from "@/components/ingest/IngestTableViewer";

export default function IngestTablePage() {
  const params = useParams();
  const tableKey = (params?.tableKey as string) || "";
  const { businessId } = useBusinessContext();

  if (!tableKey) {
    return <p className="text-sm text-bm-danger">Invalid table key.</p>;
  }

  if (!businessId) {
    return <p className="text-sm text-bm-muted2">Select or create a business first.</p>;
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link href="/ingest/tables" className="text-xs text-bm-muted2 underline">
          Back to tables
        </Link>
        <h1 className="text-xl font-bold mt-1">Table Viewer</h1>
      </div>
      <IngestTableViewer businessId={businessId} tableKey={tableKey} />
    </div>
  );
}
