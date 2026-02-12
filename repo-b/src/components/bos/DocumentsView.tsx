"use client";

import { useState, useEffect, useRef } from "react";
import {
  listDocuments,
  listDocumentVersions,
  getDownloadUrl,
  initUpload,
  completeUpload,
  computeSha256,
  initExtraction,
  runExtraction,
  ExtractedField,
  DocumentItem,
  DocumentVersion,
} from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function DocumentsView({
  businessId,
  departmentId,
}: {
  businessId: string;
  departmentId?: string;
}) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [extractingVersionId, setExtractingVersionId] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState("");
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<ExtractedField | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  function loadDocs() {
    setLoading(true);
    listDocuments(businessId, departmentId)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDocs();
  }, [businessId, departmentId]);

  function handleSelectDoc(doc: DocumentItem) {
    setSelectedDoc(doc);
    setFields([]);
    setSelectedEvidence(null);
    setLoadingVersions(true);
    listDocumentVersions(doc.document_id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }

  async function handleExtract(version: DocumentVersion) {
    if (!selectedDoc) return;
    setExtractingVersionId(version.version_id);
    setExtractionStatus("Starting extraction...");
    try {
      const extracted = await initExtraction({
        document_id: selectedDoc.document_id,
        version_id: version.version_id,
        extraction_profile: "loan_real_estate_v1",
      });
      setExtractionStatus("Running extraction...");
      const detail = await runExtraction({ extracted_document_id: extracted.id });
      setFields(detail.fields || []);
      setExtractionStatus(`Completed (${detail.fields.length} fields)`);
    } catch (err: unknown) {
      setExtractionStatus(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtractingVersionId(null);
    }
  }

  async function handleDownload(docId: string, versionId: string) {
    try {
      const { signed_download_url } = await getDownloadUrl(docId, versionId);
      window.open(signed_download_url, "_blank");
    } catch {
      alert("Failed to get download URL");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setUploadSuccess("");
    try {
      const initRes = await initUpload({
        business_id: businessId,
        department_id: departmentId || undefined,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
      });
      const uploadRes = await fetch(initRes.signed_upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
      const sha = await computeSha256(file);
      await completeUpload({ document_id: initRes.document_id, version_id: initRes.version_id, sha256: sha, byte_size: file.size });
      setUploadSuccess(`Uploaded ${file.name} successfully`);
      loadDocs();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <Card><CardContent><CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">Upload Document</CardTitle>
        <input ref={fileRef} type="file" onChange={handleUpload} disabled={uploading} className="mt-3 w-full text-sm text-bm-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-bm-border/70 file:bg-bm-surface/60 file:text-bm-text hover:file:bg-bm-surface2/60 disabled:opacity-40" />
        {uploading && <p className="text-xs text-bm-accent mt-2">Uploading...</p>}
        {uploadError && <p className="text-xs text-bm-danger mt-2">{uploadError}</p>}
        {uploadSuccess && <p className="text-xs text-bm-success mt-2">{uploadSuccess}</p>}
      </CardContent></Card>

      {selectedDoc && (<Card><CardContent>
        <div className="flex items-center justify-between mb-3"><h3 className="font-semibold">{selectedDoc.title}</h3><button onClick={() => setSelectedDoc(null)} className="text-sm text-bm-muted hover:text-bm-text">Close</button></div>
        <h4 className="text-xs font-semibold text-bm-muted2 uppercase tracking-[0.14em] mb-2">Versions</h4>
        {loadingVersions ? <div className="h-8 bg-bm-surface/60 border border-bm-border/60 rounded animate-pulse" /> : (
          <div className="space-y-2">{versions.map((v) => (<div key={v.version_id} className="flex items-center justify-between border border-bm-border/70 rounded-lg px-3 py-2 bg-bm-bg/15">
            <div><p className="text-sm">v{v.version_number} · {v.state}</p><p className="text-xs text-bm-muted2">{v.original_filename} · {v.mime_type || "—"}</p></div>
            <div className="flex gap-2">
              {v.state === "available" && <Button size="sm" variant="ghost" onClick={() => handleDownload(v.document_id, v.version_id)}>Download</Button>}
              {v.mime_type === "application/pdf" && <Button size="sm" onClick={() => handleExtract(v)} disabled={extractingVersionId === v.version_id}>{extractingVersionId === v.version_id ? "Extracting..." : "Extract terms"}</Button>}
            </div>
          </div>))}</div>
        )}
        {extractionStatus && <p className="text-xs mt-3 text-bm-muted2">Extraction status: {extractionStatus}</p>}
        {fields.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-bm-border/70 rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Extracted fields</p>
              <div className="space-y-1 max-h-64 overflow-auto">{fields.map((f) => (
                <button key={f.id} onClick={() => setSelectedEvidence(f)} className="w-full text-left text-xs bm-glass-interactive rounded p-2">{f.field_key}: {JSON.stringify(f.field_value_json)}</button>
              ))}</div>
            </div>
            <div className="border border-bm-border/70 rounded-lg p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2 mb-2">Evidence viewer</p>
              {selectedEvidence ? <p className="text-xs">Page {selectedEvidence.evidence_json?.page || "—"}: {selectedEvidence.evidence_json?.snippet || "No snippet"}</p> : <p className="text-xs text-bm-muted2">Click a field to view evidence.</p>}
            </div>
          </div>
        )}
      </CardContent></Card>)}

      <div><h3 className="text-sm font-semibold text-bm-muted2 uppercase tracking-[0.14em] mb-3">Documents</h3>
        {loading ? <div className="space-y-2"><div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" /><div className="h-14 bg-bm-surface/60 border border-bm-border/60 rounded-lg animate-pulse" /></div>
          : docs.length === 0 ? <p className="text-sm text-bm-muted2 bm-glass rounded-lg p-4">No documents yet.</p>
            : <div className="space-y-2">{docs.map((doc) => (<button key={doc.document_id} onClick={() => handleSelectDoc(doc)} className="w-full text-left bm-glass-interactive rounded-lg px-4 py-3"><div className="flex items-center justify-between"><div><p className="text-sm font-medium">{doc.title}</p><p className="text-xs text-bm-muted2">v{doc.latest_version_number || 1} · {doc.status} · {doc.latest_content_type || "unknown"}</p></div><span className="text-xs text-bm-muted2">{new Date(doc.created_at).toLocaleDateString()}</span></div></button>))}</div>}
      </div>
    </div>
  );
}
