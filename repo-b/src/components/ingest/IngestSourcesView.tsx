"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeUpload,
  computeSha256,
  createIngestSource,
  initUpload,
  listDocuments,
  listIngestSources,
  DocumentItem,
  IngestSource,
} from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

function fileTypeFromName(filename: string): "csv" | "xlsx" | null {
  const name = filename.toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  return null;
}

export default function IngestSourcesView({ businessId }: { businessId: string }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [sources, setSources] = useState<IngestSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string>("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [docRows, sourceRows] = await Promise.all([
        listDocuments(businessId),
        listIngestSources({ business_id: businessId }),
      ]);
      setDocuments(docRows);
      setSources(sourceRows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load ingestion sources");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const ingestEligibleDocs = useMemo(
    () => documents.filter((doc) => fileTypeFromName(doc.title) != null),
    [documents]
  );

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = fileTypeFromName(file.name);
    if (!fileType) {
      setError("Only .csv and .xlsx uploads are supported for ingestion.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const initRes = await initUpload({
        business_id: businessId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
      });

      const uploadRes = await fetch(initRes.signed_upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

      const sha = await computeSha256(file);
      await completeUpload({
        document_id: initRes.document_id,
        version_id: initRes.version_id,
        sha256: sha,
        byte_size: file.size,
      });

      const source = await createIngestSource({
        business_id: businessId,
        document_id: initRes.document_id,
        document_version_id: initRes.version_id,
        name: file.name,
        file_type: fileType,
      });

      setSuccess(`Created ingest source "${source.name}"`);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload and create ingest source");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleCreateFromDocument(doc: DocumentItem) {
    const fileType = fileTypeFromName(doc.title);
    if (!fileType) {
      setError("Document must be CSV or XLSX to create an ingest source.");
      return;
    }

    setBusyDocId(doc.document_id);
    setError("");
    setSuccess("");
    try {
      const source = await createIngestSource({
        business_id: businessId,
        document_id: doc.document_id,
        name: doc.title,
        file_type: fileType,
      });
      setSuccess(`Created ingest source "${source.name}"`);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ingest source from document");
    } finally {
      setBusyDocId("");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Upload CSV/XLSX</CardTitle>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleUpload}
            disabled={uploading}
            data-testid="ingest-upload"
            className="mt-3 w-full text-sm text-bm-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-bm-border/70 file:bg-bm-surface/60 file:text-bm-text hover:file:bg-bm-surface2/60 disabled:opacity-40"
          />
          {uploading && <p className="text-xs text-bm-accent mt-2">Uploading and creating source...</p>}
          {error && <p className="text-xs text-bm-danger mt-2">{error}</p>}
          {success && <p className="text-xs text-bm-success mt-2">{success}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Ingest Sources</CardTitle>
          {loading ? (
            <div className="space-y-2 mt-3">
              <div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
              <div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" />
            </div>
          ) : sources.length === 0 ? (
            <p className="text-sm text-bm-muted2 mt-3">No ingest sources yet.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {sources.map((source) => (
                <Link
                  key={source.id}
                  href={`/ingest/sources/${source.id}`}
                  className="block rounded-lg border border-bm-border/70 bg-bm-bg/15 px-4 py-3 hover:bg-bm-surface/40 transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-bm-text">{source.name}</p>
                      <p className="text-xs text-bm-muted2">
                        {source.file_type.toUpperCase()} • v{source.latest_version_num || 1} • {source.status}
                      </p>
                    </div>
                    <p className="text-xs text-bm-muted2">
                      {new Date(source.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Use Existing Documents</CardTitle>
          {ingestEligibleDocs.length === 0 ? (
            <p className="text-sm text-bm-muted2 mt-3">No existing CSV/XLSX documents found.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {ingestEligibleDocs.slice(0, 20).map((doc) => (
                <div
                  key={doc.document_id}
                  className="rounded-lg border border-bm-border/70 bg-bm-bg/15 px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-bm-muted2">v{doc.latest_version_number || 1}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleCreateFromDocument(doc)}
                    disabled={busyDocId === doc.document_id}
                  >
                    {busyDocId === doc.document_id ? "Creating..." : "Create Source"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
