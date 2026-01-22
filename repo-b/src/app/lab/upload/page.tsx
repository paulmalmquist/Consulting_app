"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { API_BASE_URL } from "@/lib/api";

type DocumentItem = {
  doc_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export default function UploadPage() {
  const { selectedEnv } = useEnv();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDocuments = async () => {
    if (!selectedEnv) return;
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/environments/${selectedEnv.env_id}/documents`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to load documents");
      }
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [selectedEnv?.env_id]);

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEnv) return;
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return;

    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/v1/environments/${selectedEnv.env_id}/upload`,
        {
          method: "POST",
          credentials: "include",
          body: formData
        }
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Upload failed");
      }
      setStatus("Upload complete and indexed.");
      event.currentTarget.reset();
      await fetchDocuments();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1.2fr,1fr] gap-6">
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Upload Documents</h1>
        <p className="text-sm text-slate-400 mt-2">
          Add PDFs, text, or markdown files to the selected environment.
        </p>
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <input
            type="file"
            name="file"
            accept=".pdf,.txt,.md"
            className="block w-full text-sm text-slate-300"
            required
          />
          {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold"
          >
            {loading ? "Uploading..." : "Upload & Index"}
          </button>
        </form>
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Documents</h2>
        <p className="text-sm text-slate-400 mt-2">
          {documents.length} documents indexed for this environment.
        </p>
        <div className="mt-4 space-y-3">
          {documents.map((doc) => (
            <div key={doc.doc_id} className="border border-slate-800 rounded-xl p-4">
              <p className="font-medium">{doc.filename}</p>
              <p className="text-xs text-slate-500">
                {doc.mime_type} · {(doc.size_bytes / 1024).toFixed(1)} KB
              </p>
            </div>
          ))}
          {documents.length === 0 ? (
            <p className="text-sm text-slate-500">No uploads yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
