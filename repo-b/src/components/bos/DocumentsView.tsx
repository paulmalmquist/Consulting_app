"use client";

import { useState, useEffect, useRef } from "react";
import {
  listDocuments,
  listDocumentVersions,
  getDownloadUrl,
  initUpload,
  completeUpload,
  computeSha256,
  DocumentItem,
  DocumentVersion,
} from "@/lib/bos-api";

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

  // Upload state
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
    setLoadingVersions(true);
    listDocumentVersions(doc.document_id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
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
      // 1. Init
      const initRes = await initUpload({
        business_id: businessId,
        department_id: departmentId || undefined,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        title: file.name,
      });

      // 2. Upload to signed URL
      const uploadRes = await fetch(initRes.signed_upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      // 3. Compute SHA-256 and complete
      const sha = await computeSha256(file);
      await completeUpload({
        document_id: initRes.document_id,
        version_id: initRes.version_id,
        sha256: sha,
        byte_size: file.size,
      });

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
      {/* Upload */}
      <div className="border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Upload Document</h3>
        <input
          ref={fileRef}
          type="file"
          onChange={handleUpload}
          disabled={uploading}
          className="w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 disabled:opacity-40"
        />
        {uploading && <p className="text-xs text-sky-400 mt-2">Uploading...</p>}
        {uploadError && <p className="text-xs text-red-400 mt-2">{uploadError}</p>}
        {uploadSuccess && <p className="text-xs text-emerald-400 mt-2">{uploadSuccess}</p>}
      </div>

      {/* Document detail overlay */}
      {selectedDoc && (
        <div className="border border-slate-600 rounded-lg p-4 bg-slate-900">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{selectedDoc.title}</h3>
            <button
              onClick={() => setSelectedDoc(null)}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-1">Status: {selectedDoc.status}</p>
          <p className="text-xs text-slate-500 mb-3">
            Created: {new Date(selectedDoc.created_at).toLocaleString()}
          </p>

          <h4 className="text-xs font-semibold text-slate-400 uppercase mb-2">Versions</h4>
          {loadingVersions ? (
            <div className="h-8 bg-slate-800 rounded animate-pulse" />
          ) : versions.length === 0 ? (
            <p className="text-sm text-slate-500">No versions found.</p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.version_id}
                  className="flex items-center justify-between border border-slate-800 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm">
                      v{v.version_number} &middot; {v.state}
                    </p>
                    <p className="text-xs text-slate-500">
                      {v.original_filename} &middot;{" "}
                      {v.size_bytes ? `${(v.size_bytes / 1024).toFixed(1)} KB` : "—"}
                    </p>
                  </div>
                  {v.state === "available" && (
                    <button
                      onClick={() => handleDownload(v.document_id, v.version_id)}
                      className="text-xs text-sky-400 hover:text-sky-300 px-2 py-1"
                    >
                      Download
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document list */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3">Documents</h3>
        {loading ? (
          <div className="space-y-2">
            <div className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-14 bg-slate-800 rounded-lg animate-pulse" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-900 rounded-lg p-4">No documents yet.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <button
                key={doc.document_id}
                onClick={() => handleSelectDoc(doc)}
                className="w-full text-left border border-slate-800 rounded-lg px-4 py-3 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{doc.title}</p>
                    <p className="text-xs text-slate-500">
                      v{doc.latest_version_number || 1} &middot; {doc.status} &middot;{" "}
                      {doc.latest_content_type || "unknown"}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
