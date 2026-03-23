"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import WinstonInstitutionalShell from "@/components/winston/WinstonInstitutionalShell";
import {
  getWinstonDocumentChunks,
  getWinstonDocumentDetail,
  listWinstonDocuments,
  MERIDIAN_DEMO_FUND_ID,
  searchWinstonDocuments,
  uploadWinstonDocument,
  type KbDocumentChunk,
  type KbDocumentDetail,
  type KbDocumentSummary,
  type KbSearchResult,
} from "@/lib/winston-demo";

function prettyLabel(value: string) {
  return value.replace(/_/g, " ");
}

export default function WinstonDocumentsPage({ params }: { params: { envId: string } }) {
  const envId = params.envId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<KbDocumentSummary[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<KbDocumentDetail | null>(null);
  const [chunks, setChunks] = useState<KbDocumentChunk[]>([]);
  const [results, setResults] = useState<KbSearchResult[]>([]);
  const [searchTerm, setSearchTerm] = useState("NOI");
  const [docTypeFilter, setDocTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedChunkId = searchParams.get("chunkId");
  const selectedDocumentId = searchParams.get("documentId");

  const refreshDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listWinstonDocuments(envId, {
        doc_type: docTypeFilter || undefined,
        asset_id: assetFilter || undefined,
        verification_status: statusFilter || undefined,
      });
      setDocuments(rows);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load documents.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [assetFilter, docTypeFilter, envId, statusFilter]);

  const loadDocument = useCallback(async (documentId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const [detail, nextChunks] = await Promise.all([
        getWinstonDocumentDetail(envId, documentId),
        getWinstonDocumentChunks(envId, documentId),
      ]);
      setSelectedDocument(detail);
      setChunks(nextChunks);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load the selected document.");
      setSelectedDocument(null);
      setChunks([]);
    } finally {
      setDetailLoading(false);
    }
  }, [envId]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (selectedDocumentId) {
      loadDocument(selectedDocumentId);
      return;
    }
    if (!selectedDocument && documents.length > 0) {
      loadDocument(documents[0].document_id);
    }
  }, [documents, loadDocument, selectedDocument, selectedDocumentId]);

  const runSearch = async () => {
    if (!searchTerm.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const hits = await searchWinstonDocuments(envId, searchTerm, {
        doc_type: docTypeFilter || undefined,
        asset_id: assetFilter || undefined,
        verified_only: statusFilter === "verified",
        limit: 10,
      });
      setResults(hits);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Search failed.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const onUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.name) {
      setError("Choose a file before uploading.");
      return;
    }
    const docType = String(form.get("doc_type") || "Imported Document");
    const author = String(form.get("author") || "Winston Demo User");
    const verificationStatus = String(form.get("verification_status") || "draft");
    const linkedAssetId = String(form.get("asset_id") || "").trim();

    setUploading(true);
    setError(null);
    try {
      await uploadWinstonDocument(envId, {
        file,
        doc_type: docType,
        author,
        verification_status: verificationStatus,
        source_type: "upload",
        linked_entities: [
          { type: "fund", id: MERIDIAN_DEMO_FUND_ID },
          ...(linkedAssetId ? [{ type: "asset", id: linkedAssetId }] : []),
        ],
      });
      event.currentTarget.reset();
      await refreshDocuments();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <WinstonInstitutionalShell envId={envId} active="documents">
      <div className="grid gap-4 xl:grid-cols-[360px,minmax(0,1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            <p className="text-sm font-semibold text-bm-text">Upload Document</p>
            <p className="mt-1 text-xs text-bm-muted">Upload PDFs, DOCX, TXT, CSV, and transcript files into the governed corpus.</p>
            <form className="mt-4 space-y-3" onSubmit={onUpload}>
              <input
                name="file"
                type="file"
                accept=".pdf,.docx,.txt,.csv,.vtt"
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
              />
              <input
                name="doc_type"
                type="text"
                placeholder="Document type"
                defaultValue="Operating Call Transcript"
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
              />
              <input
                name="author"
                type="text"
                placeholder="Author"
                defaultValue="Winston Demo User"
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
              />
              <input
                name="asset_id"
                type="text"
                placeholder="Optional asset_id"
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
              />
              <select
                name="verification_status"
                defaultValue="draft"
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
              >
                <option value="draft">Draft</option>
                <option value="verified">Verified</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-md border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text"
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload and Process"}
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            <p className="text-sm font-semibold text-bm-text">Search Corpus</p>
            <div className="mt-3 space-y-3">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                placeholder="Search by term, metric, or asset..."
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  value={docTypeFilter}
                  onChange={(event) => setDocTypeFilter(event.target.value)}
                  className="rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  placeholder="doc_type"
                />
                <input
                  value={assetFilter}
                  onChange={(event) => setAssetFilter(event.target.value)}
                  className="rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  placeholder="asset_id"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                >
                  <option value="">Any status</option>
                  <option value="draft">Draft</option>
                  <option value="verified">Verified</option>
                </select>
              </div>
              <button
                type="button"
                className="w-full rounded-md border border-bm-border/70 px-4 py-2 text-sm text-bm-text"
                onClick={runSearch}
                disabled={searching}
              >
                {searching ? "Searching..." : "Run Hybrid Search"}
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {results.map((result) => (
                <button
                  key={result.chunk_id}
                  type="button"
                  className="block w-full rounded-md border border-bm-border/60 bg-bm-surface/20 px-3 py-2 text-left"
                  onClick={() => {
                    router.push(result.anchor_href);
                    loadDocument(result.document_id);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-bm-text">{result.title}</span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-bm-muted">{result.doc_type}</span>
                  </div>
                  <p className="mt-1 text-xs text-bm-muted">{result.snippet}</p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-bm-text">Documents Hub</p>
                <p className="text-xs text-bm-muted">Upload, version, search, and inspect chunk-level citations.</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-bm-border/70 px-3 py-2 text-xs text-bm-text"
                onClick={() => window.dispatchEvent(new Event("winston-open-audit"))}
              >
                Audit Trail
              </button>
            </div>
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-bm-muted">
                    <th className="px-2 py-2 font-medium">Title</th>
                    <th className="px-2 py-2 font-medium">Type</th>
                    <th className="px-2 py-2 font-medium">Version</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-bm-muted">
                        Loading documents…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && documents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-bm-muted">
                        No documents found. Seed the demo from the main demo page or upload a file here.
                      </td>
                    </tr>
                  ) : null}
                  {documents.map((document) => (
                    <tr
                      key={document.document_id}
                      className="cursor-pointer border-t border-bm-border/40 text-bm-text hover:bg-bm-surface/20"
                      onClick={() => {
                        router.push(`/lab/env/${envId}/documents?documentId=${document.document_id}`);
                        loadDocument(document.document_id);
                      }}
                    >
                      <td className="px-2 py-2">{document.title}</td>
                      <td className="px-2 py-2">{document.doc_type}</td>
                      <td className="px-2 py-2">
                        <select
                          defaultValue={String(document.latest_version.version_number)}
                          disabled
                          className="rounded-md border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-xs text-bm-text"
                        >
                          <option value={String(document.latest_version.version_number)}>
                            v{document.latest_version.version_number}
                          </option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded-full border border-bm-border/70 px-2 py-1 text-[11px] uppercase tracking-[0.14em] text-bm-muted">
                          {document.verification_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
            <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-bm-text">Chunk Viewer</p>
                  <p className="text-xs text-bm-muted">
                    {selectedDocument ? selectedDocument.title : "Select a document to inspect its citation chunks."}
                  </p>
                </div>
                {selectedDocument ? (
                  <Link
                    href={`/lab/env/${envId}/documents?documentId=${selectedDocument.document_id}`}
                    className="text-xs text-bm-muted underline"
                  >
                    Reset Anchor
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 space-y-3">
                {detailLoading ? <p className="text-sm text-bm-muted">Loading document detail…</p> : null}
                {!detailLoading && chunks.length === 0 ? (
                  <p className="text-sm text-bm-muted">No chunks available for the current selection.</p>
                ) : null}
                {chunks.map((chunk) => (
                  <div
                    key={chunk.chunk_id}
                    className={`rounded-md border px-3 py-3 ${
                      selectedChunkId === chunk.chunk_id
                        ? "border-bm-accent/40 bg-bm-accent/10"
                        : "border-bm-border/60 bg-bm-surface/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.14em] text-bm-muted">{chunk.anchor_label}</span>
                      <span className="text-xs text-bm-muted">Page {chunk.page_number}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-bm-text">{chunk.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
              <p className="text-sm font-semibold text-bm-text">Extracted Fields</p>
              {selectedDocument ? (
                <div className="mt-4 space-y-3 text-sm">
                  <Field label="Doc Type" value={selectedDocument.doc_type} />
                  <Field label="Author" value={selectedDocument.author || "—"} />
                  <Field label="Status" value={selectedDocument.verification_status} />
                  <Field label="Version" value={`v${selectedDocument.latest_version.version_number}`} />
                  <Field
                    label="Detected Definitions"
                    value={selectedDocument.analysis.detected_definitions.join(", ") || "—"}
                  />
                  <Field
                    label="Detected Metrics"
                    value={selectedDocument.analysis.detected_metrics.join(", ") || "—"}
                  />
                  <Field
                    label="Structured Refs"
                    value={
                      selectedDocument.analysis.linked_structured_refs.length
                        ? JSON.stringify(selectedDocument.analysis.linked_structured_refs)
                        : "—"
                    }
                  />
                  <Field
                    label="Detected Tables"
                    value={
                      selectedDocument.analysis.detected_tables.length
                        ? JSON.stringify(selectedDocument.analysis.detected_tables)
                        : "—"
                    }
                  />
                  <div>
                    <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">Linked Entities</p>
                    <div className="mt-2 space-y-2">
                      {selectedDocument.linked_entities.map((entity) => (
                        <div
                          key={`${entity.type}-${entity.id}`}
                          className="rounded-md border border-bm-border/60 bg-bm-surface/20 px-2 py-1 text-xs text-bm-text"
                        >
                          {entity.type}: {entity.id}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-bm-muted">No document selected.</p>
              )}
            </aside>
          </div>
        </section>
      </div>
    </WinstonInstitutionalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">{label}</p>
      <p className="mt-1 text-sm text-bm-text">{prettyLabel(value)}</p>
    </div>
  );
}
