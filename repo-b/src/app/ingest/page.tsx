import Link from "next/link";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function IngestLandingPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-bold">Data Ingestion</h1>
      <p className="text-sm text-bm-muted">
        Upload loose CSV/XLSX files, map columns to target schemas, validate, and run deterministic ingestion pipelines.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/ingest/sources">
          <Card className="hover:bg-bm-surface/40 transition">
            <CardContent>
              <CardTitle className="text-base">Sources</CardTitle>
              <p className="text-sm text-bm-muted2 mt-1">
                Upload and configure ingestion sources.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/ingest/tables">
          <Card className="hover:bg-bm-surface/40 transition">
            <CardContent>
              <CardTitle className="text-base">Tables</CardTitle>
              <p className="text-sm text-bm-muted2 mt-1">
                Browse canonical and custom ingested tables.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
