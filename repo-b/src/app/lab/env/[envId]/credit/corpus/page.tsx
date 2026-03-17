"use client";

import { useEffect, useState } from "react";
import {
  listCreditCorpus,
  searchCreditCorpus,
  CreditCorpusDocument,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

export default function CreditCorpusPage() {
  const { envId, businessId } = useDomainEnv();
  const [documents, setDocuments] = useState<CreditCorpusDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<unknown[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/corpus`,
      surface: "credit",
      active_module: "credit",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listCreditCorpus(envId, businessId || undefined);
        setDocuments(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load corpus");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const results = await searchCreditCorpus(envId, query, businessId || undefined);
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Credit Corpus</h2>
        <p className="text-sm text-bm-muted2">Ingested policy documents, guidelines, and reference materials.</p>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search corpus passages..."
          className="flex-1 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg border border-bm-border px-4 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Search Results */}
      {searchResults !== null && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">
              Search Results ({searchResults.length})
            </h3>
            <button onClick={() => setSearchResults(null)} className="text-xs text-bm-muted2 hover:underline">Clear</button>
          </div>
          {searchResults.length === 0 ? (
            <p className="text-sm text-bm-muted2">No matching passages found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {searchResults.map((result: unknown, i: number) => {
                const r = result as Record<string, unknown>;
                return (
                  <div key={i} className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3 text-sm">
                    <p className="text-xs text-bm-muted2 mb-1">{String(r.document_title || r.title || `Result ${i + 1}`)} &middot; Score: {String(r.score || r.similarity || "—")}</p>
                    <p>{String(r.passage_text || r.text || r.content || JSON.stringify(r))}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Document Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Ref</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Passages</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ingested At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading corpus...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>No documents ingested.</td></tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.document_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{doc.document_ref}</td>
                  <td className="px-4 py-3">{doc.title}</td>
                  <td className="px-4 py-3 capitalize">{doc.document_type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">{doc.passage_count}</td>
                  <td className="px-4 py-3 capitalize">{doc.status}</td>
                  <td className="px-4 py-3">{new Date(doc.ingested_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
