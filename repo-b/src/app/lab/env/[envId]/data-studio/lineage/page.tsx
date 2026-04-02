"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type Account = { account_id: string; account_name: string };
type System = { system_id: string; system_name: string; system_type?: string };
type EntityMapping = {
  entity_mapping_id: string;
  source_table: string;
  entity_name?: string;
  entity_id: string;
  system_id?: string;
  system_name?: string;
  confidence_score?: number;
};
type Entity = { entity_id: string; entity_name: string; field_count?: number };

export default function DataLineagePage() {
  const { envId, businessId } = useDomainEnv();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [systems, setSystems] = useState<System[]>([]);
  const [mappings, setMappings] = useState<EntityMapping[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const qs = () => {
    const p = new URLSearchParams({ env_id: envId });
    if (businessId) p.set("business_id", businessId);
    return p.toString();
  };

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

  useEffect(() => {
    if (!selectedAccount) {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sysRes, mapRes, entRes] = await Promise.all([
          fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/systems?${qs()}`),
          fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entity-mappings?${qs()}`),
          fetch(`${API_BASE}/api/data-studio/v1/accounts/${selectedAccount}/entities?${qs()}`),
        ]);

        if (sysRes.ok) {
          const d = await sysRes.json();
          setSystems(d.systems ?? d ?? []);
        } else {
          setSystems([]);
        }

        if (mapRes.ok) {
          const d = await mapRes.json();
          setMappings(d.entity_mappings ?? d.mappings ?? d ?? []);
        } else {
          setMappings([]);
        }

        if (entRes.ok) {
          const d = await entRes.json();
          setEntities(d.entities ?? d ?? []);
        } else {
          setEntities([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lineage data");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, selectedAccount]);

  // Build lineage connections
  const entityMap = new Map(entities.map((e) => [e.entity_id, e]));
  const systemMap = new Map(systems.map((s) => [s.system_id, s]));

  // Group mappings by entity for the flow view
  const mappingsByEntity = new Map<string, EntityMapping[]>();
  for (const m of mappings) {
    const key = m.entity_id;
    if (!mappingsByEntity.has(key)) mappingsByEntity.set(key, []);
    mappingsByEntity.get(key)!.push(m);
  }

  return (
    <section className="space-y-5" data-testid="data-studio-lineage">
      <div>
        <h2 className="text-2xl font-semibold">Data Lineage</h2>
        <p className="text-sm text-bm-muted2">Trace data flow from source systems through mappings to canonical entities.</p>
      </div>

      {/* Account Selector */}
      <div className="flex items-center gap-3">
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

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-bm-muted2">Loading lineage data...</p>}

      {!loading && (
        <div className="grid grid-cols-3 gap-0 items-start">
          {/* Column 1: Source Systems */}
          <div className="space-y-2">
            <div className="px-3 py-2 text-xs uppercase tracking-[0.1em] text-bm-muted2 font-semibold">
              Source Systems
            </div>
            {systems.length === 0 ? (
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2">
                <p className="text-sm text-bm-muted2">No systems registered.</p>
              </div>
            ) : (
              systems.map((s) => (
                <div
                  key={s.system_id}
                  className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2"
                >
                  <p className="text-sm font-medium">{s.system_name}</p>
                  {s.system_type && (
                    <p className="text-xs text-bm-muted2 mt-0.5">{s.system_type}</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Column 2: Entity Mappings */}
          <div className="space-y-2">
            <div className="px-3 py-2 text-xs uppercase tracking-[0.1em] text-bm-muted2 font-semibold">
              Entity Mappings
            </div>
            {mappings.length === 0 ? (
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2">
                <p className="text-sm text-bm-muted2">No mappings defined.</p>
              </div>
            ) : (
              mappings.map((m) => {
                const pct = Math.round((m.confidence_score ?? 0) * 100);
                const arrowColor =
                  pct >= 80 ? "text-green-400" : pct >= 50 ? "text-amber-400" : "text-red-400";
                return (
                  <div
                    key={m.entity_mapping_id}
                    className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2 relative"
                  >
                    {/* Left arrow */}
                    <span className={`absolute -left-4 top-1/2 -translate-y-1/2 text-lg ${arrowColor}`}>
                      &larr;
                    </span>
                    <p className="text-sm font-medium">{m.source_table}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-bm-muted2">
                        {m.system_name ?? systemMap.get(m.system_id ?? "")?.system_name ?? "unknown"}
                      </p>
                      <span className="text-xs text-bm-muted2">{pct}%</span>
                    </div>
                    {/* Right arrow */}
                    <span className={`absolute -right-4 top-1/2 -translate-y-1/2 text-lg ${arrowColor}`}>
                      &rarr;
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Column 3: Canonical Entities */}
          <div className="space-y-2">
            <div className="px-3 py-2 text-xs uppercase tracking-[0.1em] text-bm-muted2 font-semibold">
              Canonical Entities
            </div>
            {entities.length === 0 ? (
              <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2">
                <p className="text-sm text-bm-muted2">No entities defined.</p>
              </div>
            ) : (
              entities.map((e) => {
                const sourceCount = mappingsByEntity.get(e.entity_id)?.length ?? 0;
                return (
                  <div
                    key={e.entity_id}
                    className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 mx-2"
                  >
                    <p className="text-sm font-medium">{e.entity_name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-bm-muted2">{sourceCount} source{sourceCount !== 1 ? "s" : ""}</span>
                      {e.field_count != null && (
                        <span className="text-xs text-bm-muted2">{e.field_count} fields</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && mappings.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-bm-muted2 pt-2 border-t border-bm-border/40">
          <span>Arrow color indicates confidence:</span>
          <span className="text-green-400">High (&ge;80%)</span>
          <span className="text-amber-400">Medium (50-79%)</span>
          <span className="text-red-400">Low (&lt;50%)</span>
        </div>
      )}
    </section>
  );
}
