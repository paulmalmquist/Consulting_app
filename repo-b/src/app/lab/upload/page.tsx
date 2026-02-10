"use client";

import { useEffect, useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import EnvGate from "@/components/EnvGate";
import { API_BASE_URL } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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
    <EnvGate>
      <div className="grid lg:grid-cols-[1.2fr,1fr] gap-6">
        <Card>
          <CardContent>
            <CardTitle className="text-xl">Upload Documents</CardTitle>
            <CardDescription>
              Add PDFs, text, or markdown files to the selected environment.
            </CardDescription>
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <input
                type="file"
                name="file"
                accept=".pdf,.txt,.md"
                className="block w-full text-sm text-bm-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-bm-border/70 file:bg-bm-surface/60 file:text-bm-text hover:file:bg-bm-surface2/60"
                required
              />
              {status ? <p className="text-sm text-bm-success">{status}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? "Uploading..." : "Upload & Index"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {documents.length} documents indexed for this environment.
            </CardDescription>
            <div className="mt-4 space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.doc_id}
                  className="border border-bm-border/70 rounded-xl p-4 bg-bm-bg/15"
                >
                  <p className="font-medium">{doc.filename}</p>
                  <p className="text-xs text-bm-muted2">
                    {doc.mime_type} · {(doc.size_bytes / 1024).toFixed(1)} KB
                  </p>
                </div>
              ))}
              {documents.length === 0 ? (
                <p className="text-sm text-bm-muted2">No uploads yet.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </EnvGate>
  );
}
