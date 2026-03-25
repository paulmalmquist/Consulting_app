"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type Account = { account_id: string; account_name: string };
type Artifact = { artifact_id: string; filename: string };
type SchemaColumn = { column_name: string; inferred_type: string; nullable: boolean };
type ColumnProfile = {
  column_name: string;
  distinct_count?: number;
  null_rate?: number;
  sample_values?: string[];
};
type ArtifactDetail = {
  artifact_id: string;
  filename: string;
  schema_inferred?: SchemaColumn[] | null;
  column_profile?: ColumnProfile[] | null;
};

export default function SchemaViewerPage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string>("");
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = () => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    return p.toString();
  };

  // Load accounts
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/discovery/v1/accounts?${qs()}`);
        if (!res.ok) throw new Error("Failed to load accounts");
        const data = await res.json();
        const list: Account[] = data.accounts ?? data ?? [];
        setAccounts(list);
        if (list.length > 0) setSelectedAccount(list[0].account_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  // Load artifacts for account
  useEffect(() => {
    if (!selectedAccount) return;
    async function load() {
      try {
        const res = await fetch(
          `${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/artifacts?${qs()}`
        );
        if (!res.ok) throw new Error("Failed to load artifacts");
        const data = await res.json();
        const list: Artifact[] = (data.artifacts ?? data ?? []).map((a: Artifact) => ({
          artifact_id: a.artifact_id,
          filename: a.filename,
        }));
        setArtifacts(list);
        setSelectedArtifact(list.length > 0 ? list[0].artifact_id : "");
        setDetail(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load artifacts");
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  // Load artifact detail (schema + profile)
  useEffect(() => {
    if (!selectedArtifact) {
      setDetail(null);
      return;
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/data-studio/v1/artifacts/${selectedArtifact}?${qs()}`
        );
        if (!res.ok) throw new Error("Failed to load artifact schema");
        setDetail(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load schema");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedArtifact]);

  const schema = detail?.schema_inferred ?? [];
  const profile = detail?.column_profile ?? [];

  return (
    <section className="space-y-5" data-testid="data-studio-schema">
      <div>
        <h2 className="text-2xl font-semibold">Schema Viewer</h2>
        <p className="text-sm text-bm-muted2">Inspect inferred schemas and column profiles for data artifacts.</p>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-bm-muted2">Account</label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          >
            {accounts.length === 0 && <option value="">No accounts</option>}
            {accounts.map((a) => (
              <option key={a.account_id} value={a.account_id}>{a.account_name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-bm-muted2">Artifact</label>
          <select
            value={selectedArtifact}
            onChange={(e) => setSelectedArtifact(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          >
            {artifacts.length === 0 && <option value="">No artifacts</option>}
            {artifacts.map((a) => (
              <option key={a.artifact_id} value={a.artifact_id}>{a.filename}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-bm-muted2">Loading schema...</p>}

      {!loading && detail && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Inferred Schema */}
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
              <h3 className="text-sm font-semibold">Inferred Schema</h3>
            </div>
            {schema.length === 0 ? (
              <p className="px-4 py-5 text-sm text-bm-muted2">No schema inferred yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-2 font-medium">Column</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Nullable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {schema.map((col, i) => (
                    <tr key={i} className="hover:bg-bm-surface/20">
                      <td className="px-4 py-2 font-medium">{col.column_name}</td>
                      <td className="px-4 py-2 text-bm-muted2">{col.inferred_type}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${col.nullable ? "bg-amber-500/15 text-amber-400" : "bg-green-500/15 text-green-400"}`}>
                          {col.nullable ? "yes" : "no"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Column Profile */}
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <div className="border-b border-bm-border/50 px-4 py-3 bg-bm-surface/30">
              <h3 className="text-sm font-semibold">Column Profile</h3>
            </div>
            {profile.length === 0 ? (
              <p className="px-4 py-5 text-sm text-bm-muted2">No column profile available.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-2 font-medium">Column</th>
                    <th className="px-4 py-2 font-medium">Distinct</th>
                    <th className="px-4 py-2 font-medium">Null Rate</th>
                    <th className="px-4 py-2 font-medium">Samples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {profile.map((col, i) => (
                    <tr key={i} className="hover:bg-bm-surface/20">
                      <td className="px-4 py-2 font-medium">{col.column_name}</td>
                      <td className="px-4 py-2 text-bm-muted2">{col.distinct_count ?? "--"}</td>
                      <td className="px-4 py-2 text-bm-muted2">
                        {col.null_rate != null ? `${(col.null_rate * 100).toFixed(1)}%` : "--"}
                      </td>
                      <td className="px-4 py-2 text-bm-muted2 text-xs max-w-[200px] truncate">
                        {col.sample_values?.join(", ") ?? "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!loading && !detail && !error && selectedArtifact && (
        <p className="text-sm text-bm-muted2">Select an artifact to view its schema.</p>
      )}
    </section>
  );
}
