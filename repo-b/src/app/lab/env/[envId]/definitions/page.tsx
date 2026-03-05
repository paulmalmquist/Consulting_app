"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import WinstonInstitutionalShell from "@/components/winston/WinstonInstitutionalShell";
import {
  approveWinstonChangeRequest,
  createWinstonChangeRequest,
  getWinstonDefinitionDetail,
  listWinstonDefinitions,
  rejectWinstonChangeRequest,
  type KbDefinitionDetail,
  type KbDefinitionSummary,
} from "@/lib/winston-demo";

export default function WinstonDefinitionsPage({ params }: { params: { envId: string } }) {
  const envId = params.envId;
  const [definitions, setDefinitions] = useState<KbDefinitionSummary[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KbDefinitionDetail | null>(null);
  const [draftDefinition, setDraftDefinition] = useState("");
  const [draftFormula, setDraftFormula] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listWinstonDefinitions(envId);
      setDefinitions(rows);
      setSelectedDefinitionId((current) => current || rows[0]?.definition_id || null);
      return rows;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load definitions.");
      setDefinitions([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [envId]);

  const loadDetail = useCallback(async (definitionId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const nextDetail = await getWinstonDefinitionDetail(envId, definitionId);
      setDetail(nextDetail);
      setDraftDefinition(nextDetail.definition_text);
      setDraftFormula(nextDetail.formula_text || "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load definition detail.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [envId]);

  useEffect(() => {
    refreshDefinitions();
  }, [refreshDefinitions]);

  useEffect(() => {
    if (!selectedDefinitionId) return;
    loadDetail(selectedDefinitionId);
  }, [loadDetail, selectedDefinitionId]);

  const submitChangeRequest = async () => {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      await createWinstonChangeRequest(envId, detail.definition_id, {
        proposed_definition_text: draftDefinition,
        proposed_formula_text: draftFormula,
        created_by: "winston_user",
      });
      await loadDetail(detail.definition_id);
      await refreshDefinitions();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to create the change request.");
    } finally {
      setSaving(false);
    }
  };

  const approveRequest = async (changeRequestId: string) => {
    setSaving(true);
    setError(null);
    try {
      await approveWinstonChangeRequest(changeRequestId);
      const rows = await listWinstonDefinitions(envId);
      setDefinitions(rows);
      const nextCurrent = rows.find((item) => item.term === detail?.term) || rows[0] || null;
      if (nextCurrent) {
        setSelectedDefinitionId(nextCurrent.definition_id);
        await loadDetail(nextCurrent.definition_id);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Approval failed.");
    } finally {
      setSaving(false);
    }
  };

  const rejectRequest = async (changeRequestId: string) => {
    setSaving(true);
    setError(null);
    try {
      await rejectWinstonChangeRequest(changeRequestId);
      if (selectedDefinitionId) {
        await loadDetail(selectedDefinitionId);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Rejection failed.");
    } finally {
      setSaving(false);
    }
  };

  const pendingRequest = detail?.change_requests.find((item) => item.status === "pending") || null;

  return (
    <WinstonInstitutionalShell envId={envId} active="definitions">
      <div className="grid gap-4 xl:grid-cols-[380px,minmax(0,1fr)]">
        <section className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-bm-text">Definitions Registry</p>
              <p className="text-xs text-bm-muted">Versioned metric definitions with explicit downstream dependencies.</p>
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
          <div className="mt-4 space-y-2">
            {loading ? <p className="text-sm text-bm-muted">Loading definitions…</p> : null}
            {!loading && definitions.length === 0 ? (
              <p className="text-sm text-bm-muted">No definitions found. Seed the Meridian demo from the main demo page.</p>
            ) : null}
            {definitions.map((definition) => (
              <button
                key={definition.definition_id}
                type="button"
                onClick={() => setSelectedDefinitionId(definition.definition_id)}
                className={`block w-full rounded-md border px-3 py-3 text-left ${
                  selectedDefinitionId === definition.definition_id
                    ? "border-bm-accent/40 bg-bm-accent/10"
                    : "border-bm-border/60 bg-bm-surface/20"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-bm-text">{definition.term}</p>
                  <span className="text-xs text-bm-muted">v{definition.version}</span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-bm-muted">
                  <span>Owner: {definition.owner}</span>
                  <span>Status: {definition.status}</span>
                  <span>Dependencies: {definition.dependency_count}</span>
                  <span>Last Updated: {new Date(definition.approved_at || definition.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
            {detailLoading ? <p className="text-sm text-bm-muted">Loading definition detail…</p> : null}
            {!detailLoading && !detail ? (
              <p className="text-sm text-bm-muted">Select a definition to review its governance record.</p>
            ) : null}
            {detail ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-bm-text">
                    {detail.term}
                  </span>
                  <span className="rounded-full border border-bm-border/70 px-3 py-1 text-xs text-bm-muted">
                    Version {detail.version}
                  </span>
                  <span className="rounded-full border border-bm-border/70 px-3 py-1 text-xs text-bm-muted">
                    {detail.owner}
                  </span>
                  {detail.stale_dependencies.length > 0 ? (
                    <span className="rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
                      Definition Updated - Recompute Recommended
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">Definition Text</p>
                      <p className="mt-2 text-sm leading-6 text-bm-text">{detail.definition_text}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">Formula</p>
                      <p className="mt-2 text-sm leading-6 text-bm-text">{detail.formula_text || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">Structured Metric Mapping</p>
                      <p className="mt-2 text-sm text-bm-text">{detail.structured_metric_key || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-bm-muted">Source Citations</p>
                      <div className="mt-2 space-y-2">
                        {detail.sources.map((source) => (
                          <Link
                            key={source.chunk_id}
                            href={source.anchor_href}
                            className="block rounded-md border border-bm-border/60 bg-bm-surface/20 px-3 py-2"
                          >
                            <p className="text-sm font-medium text-bm-text">{source.title}</p>
                            <p className="mt-1 text-xs text-bm-muted">{source.quoted_snippet}</p>
                          </Link>
                        ))}
                        {detail.sources.length === 0 ? (
                          <p className="text-sm text-bm-muted">No cited sources linked yet.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4">
                    <p className="text-sm font-semibold text-bm-text">Downstream Dependencies</p>
                    <div className="mt-3 space-y-2">
                      {detail.dependencies.map((dependency) => (
                        <div
                          key={`${dependency.type}-${dependency.id}`}
                          className="rounded-md border border-bm-border/60 px-3 py-2 text-sm text-bm-text"
                        >
                          <p className="font-medium">{dependency.type}</p>
                          <p className="mt-1 text-xs text-bm-muted">{dependency.id}</p>
                        </div>
                      ))}
                    </div>
                    {detail.stale_dependencies.length > 0 ? (
                      <>
                        <p className="mt-4 text-sm font-semibold text-bm-text">Stale Outputs</p>
                        <div className="mt-2 space-y-2">
                          {detail.stale_dependencies.map((item) => (
                            <div
                              key={`${item.object_type}-${item.object_id}`}
                              className="rounded-md border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs text-amber-100"
                            >
                              {item.object_type}: {item.object_id}
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </aside>
                </div>
              </>
            ) : null}
          </div>

          {detail ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px]">
              <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
                <p className="text-sm font-semibold text-bm-text">Propose Change</p>
                <p className="mt-1 text-xs text-bm-muted">Submit a governed definition change request and run impact analysis immediately.</p>
                <div className="mt-4 space-y-3">
                  <textarea
                    value={draftDefinition}
                    onChange={(event) => setDraftDefinition(event.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  />
                  <textarea
                    value={draftFormula}
                    onChange={(event) => setDraftFormula(event.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-bm-border/70 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                  />
                  <button
                    type="button"
                    className="rounded-md border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-text"
                    onClick={submitChangeRequest}
                    disabled={saving}
                  >
                    {saving ? "Submitting..." : "Propose Change"}
                  </button>
                </div>
              </div>

              <aside className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-4">
                <p className="text-sm font-semibold text-bm-text">Pending Review</p>
                {pendingRequest ? (
                  <>
                    <p className="mt-2 text-xs text-bm-muted">{pendingRequest.impact_summary.message || "Impact analysis complete."}</p>
                    <div className="mt-3 space-y-2">
                      {(pendingRequest.impact_summary.summary_lines || []).map((line) => (
                        <div
                          key={line}
                          className="rounded-md border border-bm-border/60 bg-bm-surface/20 px-3 py-2 text-sm text-bm-text"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-emerald-300/40 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100"
                        onClick={() => approveRequest(pendingRequest.id)}
                        disabled={saving}
                      >
                        Approve Change
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-rose-300/40 bg-rose-300/10 px-3 py-2 text-sm text-rose-100"
                        onClick={() => rejectRequest(pendingRequest.id)}
                        disabled={saving}
                      >
                        Reject
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-bm-muted">No pending change requests for this definition.</p>
                )}
              </aside>
            </div>
          ) : null}
        </section>
      </div>
    </WinstonInstitutionalShell>
  );
}
