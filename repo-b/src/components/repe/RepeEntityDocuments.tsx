"use client";

import { useCallback, useEffect, useMemo, useRef, useState, DragEvent } from "react";
import {
  completeUpload,
  computeSha256,
  initUpload,
  listDocuments,
  DocumentItem,
} from "@/lib/bos-api";

type EntityType = "fund" | "investment" | "asset";

function segmentFor(type: EntityType): "fund" | "deal" | "asset" {
  if (type === "investment") return "deal";
  return type;
}

export default function RepeEntityDocuments({
  businessId,
  envId,
  entityType,
  entityId,
  title = "Attachments",
}: {
  businessId: string;
  envId: string;
  entityType: EntityType;
  entityId: string;
  title?: string;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const pathPrefix = useMemo(
    () => `re/env/${envId}/${segmentFor(entityType)}/${entityId}`,
    [envId, entityType, entityId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const scopedDocs = await listDocuments(businessId, undefined, {
        env_id: envId,
        entity_type: entityType,
        entity_id: entityId,
      });
      setRows(scopedDocs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attachments");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, envId, entityType, entityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadFile = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setStatus(null);
    try {
      const virtualPath = `${pathPrefix}/${file.name.replaceAll("/", "_")}`;
      const initRes = await initUpload({
        business_id: businessId,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
        virtual_path: virtualPath,
        entity_type: entityType,
        entity_id: entityId,
        env_id: envId,
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
        entity_type: entityType,
        entity_id: entityId,
        env_id: envId,
      });
      setStatus(`Uploaded ${file.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  };

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3" data-testid={`re-attachments-${entityType}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">{title}</h3>
        <span className="text-xs text-bm-muted2">{rows.length} files</span>
      </div>

      {/* Styled drop zone — hides the native file input */}
      <div
        role="button"
        aria-label="Upload file"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragOver
            ? "border-bm-accent bg-bm-accent/10"
            : "border-bm-border/70 hover:border-bm-accent/50 hover:bg-bm-surface/40"
        } ${uploading ? "pointer-events-none opacity-50" : ""}`}
      >
        <svg className="h-5 w-5 text-bm-muted2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-xs text-bm-muted">
          {uploading ? "Uploading…" : "Drag & drop or click to upload"}
        </p>
        <p className="text-[10px] text-bm-muted2">PDF, DOCX, XLSX, PNG — any format</p>
      </div>
      <input ref={fileRef} type="file" onChange={onInputChange} disabled={uploading} className="sr-only" tabIndex={-1} />

      {status ? <p className="text-xs text-bm-success">{status}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-bm-muted2">Loading attachments...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-bm-muted2">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((doc) => (
            <li key={doc.document_id} className="rounded-lg border border-bm-border/70 px-3 py-2 text-sm">
              <p className="font-medium">{doc.title}</p>
              <p className="text-xs text-bm-muted2">{doc.latest_content_type || "unknown"} · {new Date(doc.created_at).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
