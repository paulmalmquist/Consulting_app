"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { WorkspaceContextLoader } from "@/components/ui/WinstonLoader";
import { OperatorUnavailableState } from "@/components/operator/OperatorUnavailableState";
import { publishAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import {
  getOperatorSiteDecision,
  postOperatorSiteAssignDiligence,
  postOperatorSiteDecisionMemo,
  type OperatorSiteDecision,
  type OperatorSiteDecisionRisk,
} from "@/lib/bos-api";
import { ExecutiveCommandBand } from "./ExecutiveCommandBand";
import { ScenarioBlock } from "./ScenarioBlock";
import { RiskCard } from "./RiskCard";
import { EventLog } from "./EventLog";
import { PortfolioFit } from "./PortfolioFit";
import { DeliveryHub } from "./DeliveryHub";
import { EvidencePanel } from "./EvidencePanel";
import { DecisionDrawer } from "./DecisionDrawer";

type TabKey = "decision" | "portfolio" | "delivery" | "evidence";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "decision", label: "Decision" },
  { key: "portfolio", label: "Portfolio fit" },
  { key: "delivery", label: "Delivery" },
  { key: "evidence", label: "Evidence" },
];

export function SiteDecisionSurface({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const { envId, businessId } = useDomainEnv();
  const [data, setData] = useState<OperatorSiteDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("decision");

  // Drawer state
  const [assignTarget, setAssignTarget] = useState<OperatorSiteDecisionRisk | null>(null);
  const [memoMarkdown, setMemoMarkdown] = useState<string | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [assignForm, setAssignForm] = useState({
    title: "",
    owner: "",
    description: "",
    due_date: "",
  });
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const decisionRef = useRef<HTMLDivElement | null>(null);
  const risksRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getOperatorSiteDecision(siteId, envId, businessId || undefined);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site decision");
    } finally {
      setLoading(false);
    }
  }, [siteId, envId, businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    publishAssistantPageContext({
      route: pathname,
      surface: "operator_site_decision",
      active_module: "operator",
      page_entity_type: "development_site",
      page_entity_id: data.site.site_id,
      page_entity_name: data.site.name || data.site.site_id,
      selected_entities: [
        {
          entity_type: "development_site",
          entity_id: data.site.site_id,
          name: data.site.name || data.site.site_id,
          source: "page",
          metadata: {
            risk_level: data.site.risk_level,
            target_project_type: data.site.target_project_type,
            status: data.site.status,
          },
        },
      ],
      visible_data: {
        metrics: {
          recommendation: data.recommendation,
          conviction: data.conviction,
          fail_condition: data.fail_condition,
          base_irr_pct: data.kpis.find((k) => k.key === "base_irr_vs_hurdle")?.value_pct ?? null,
          top_downside_risk_bps:
            data.kpis.find((k) => k.key === "top_downside_risk")?.irr_impact_bps ?? null,
        },
        notes: [data.decision_summary],
        decision: data,
      },
    });
  }, [data, pathname]);

  const openAssignDrawer = useCallback(
    (risk: OperatorSiteDecisionRisk | null) => {
      const prefill = risk
        ? {
            title: `Diligence: ${risk.label}`.slice(0, 120),
            owner: risk.owner || data?.recommendation_owner || "Acquisitions Lead",
            description: risk.required_action,
            due_date: risk.due_date || "",
          }
        : {
            title: "Diligence task",
            owner: data?.recommendation_owner || "Acquisitions Lead",
            description: "",
            due_date: "",
          };
      setAssignTarget(risk);
      setAssignForm(prefill);
    },
    [data],
  );

  const submitAssign = useCallback(async () => {
    if (!data) return;
    setAssignSubmitting(true);
    try {
      const result = await postOperatorSiteAssignDiligence(
        siteId,
        {
          title: assignForm.title,
          owner: assignForm.owner,
          description: assignForm.description || undefined,
          due_date: assignForm.due_date || undefined,
          risk_id: assignTarget?.risk_id || null,
          priority: "high",
        },
        envId,
        businessId || undefined,
      );
      // Patch in the context_task_id on the matching risk so the card flips state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          risks: prev.risks.map((r) =>
            r.risk_id === (assignTarget?.risk_id ?? "")
              ? { ...r, context_task_id: result.task_id }
              : r,
          ),
        };
      });
      setAssignTarget(null);
    } catch (err) {
      // Surface error inline without fabricating success
      setError(err instanceof Error ? err.message : "Failed to assign diligence");
    } finally {
      setAssignSubmitting(false);
    }
  }, [data, siteId, envId, businessId, assignForm, assignTarget]);

  const openMemo = useCallback(async () => {
    setMemoLoading(true);
    setMemoMarkdown("");
    try {
      const res = await postOperatorSiteDecisionMemo(siteId, envId, businessId || undefined);
      setMemoMarkdown(res.memo_markdown);
    } catch (err) {
      setMemoMarkdown(
        `**Failed to generate memo** — ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setMemoLoading(false);
    }
  }, [siteId, envId, businessId]);

  const handleAction = useCallback(
    (action: "assumptions" | "risks" | "assign" | "comps" | "memo") => {
      if (action === "assumptions") {
        setTab("decision");
        decisionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "risks") {
        setTab("decision");
        risksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (action === "comps") {
        setTab("evidence");
      } else if (action === "assign") {
        openAssignDrawer(null);
      } else if (action === "memo") {
        void openMemo();
      }
    },
    [openAssignDrawer, openMemo],
  );

  const topOfTab = useMemo(() => {
    if (!data) return null;
    if (tab === "decision") {
      return (
        <div className="space-y-4">
          <div ref={decisionRef}>
            <ScenarioBlock
              scenarios={data.scenarios}
              failCondition={data.fail_condition}
              failNullReason={data.fail_condition_null_reason}
            />
          </div>
          <div ref={risksRef} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-bm-muted2">
                Top risks
              </h3>
              <span className="text-[11px] text-bm-muted2">
                {data.risks.length} of max 5
              </span>
            </div>
            {data.risks.length ? (
              <div className="space-y-2">
                {data.risks.map((r) => (
                  <RiskCard key={r.risk_id} risk={r} onAssign={openAssignDrawer} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-bm-muted2">
                No material risks surfaced for this site.
              </div>
            )}
          </div>
          <EventLog events={data.event_log} />
        </div>
      );
    }
    if (tab === "portfolio") {
      return <PortfolioFit fit={data.portfolio_fit} siteId={data.site.site_id} />;
    }
    if (tab === "delivery") {
      return <DeliveryHub workstreams={data.workstreams} />;
    }
    return <EvidencePanel site={data.site} evidence={data.evidence} />;
  }, [data, tab, openAssignDrawer]);

  if (loading) return <WorkspaceContextLoader label="Loading decision surface" />;
  if (error || !data) {
    return (
      <OperatorUnavailableState
        title="Decision surface unavailable"
        detail={error || "No data returned."}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="sticky top-0 z-20 -mx-4 bg-gradient-to-b from-bm-bg via-bm-bg to-transparent px-4 pt-4 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-0">
        <ExecutiveCommandBand data={data} onAction={handleAction} />
      </div>

      <nav className="sticky top-[calc(100vh)] z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-white/10 bg-bm-bg/95 px-4 pb-1 backdrop-blur-sm sm:static sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition ${
              tab === t.key
                ? "border-emerald-400 text-bm-text"
                : "border-transparent text-bm-muted2 hover:text-bm-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div>{topOfTab}</div>

      {/* Sticky mobile action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-white/10 bg-bm-bg/95 p-3 backdrop-blur-sm sm:hidden">
        <button
          type="button"
          onClick={() => openAssignDrawer(null)}
          className="flex-1 rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs text-bm-text"
        >
          Assign
        </button>
        <button
          type="button"
          onClick={() => void openMemo()}
          className="flex-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
        >
          Export memo
        </button>
      </div>

      {/* Drawers */}
      <DecisionDrawer
        open={assignTarget !== null || assignForm.title === "Diligence task"}
        title={assignTarget ? "Assign diligence from risk" : "New diligence task"}
        onClose={() => {
          setAssignTarget(null);
          setAssignForm({ title: "", owner: "", description: "", due_date: "" });
        }}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAssignTarget(null);
                setAssignForm({ title: "", owner: "", description: "", due_date: "" });
              }}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-bm-muted2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitAssign()}
              disabled={assignSubmitting || !assignForm.title || !assignForm.owner}
              className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-100 disabled:opacity-40"
            >
              {assignSubmitting ? "Assigning…" : "Create task"}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {assignTarget ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Linked risk: {assignTarget.label}
            </div>
          ) : null}
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-bm-muted2">Title</span>
            <input
              type="text"
              value={assignForm.title}
              onChange={(e) =>
                setAssignForm((f) => ({ ...f, title: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-bm-text"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-bm-muted2">Owner</span>
            <input
              type="text"
              value={assignForm.owner}
              onChange={(e) =>
                setAssignForm((f) => ({ ...f, owner: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-bm-text"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-bm-muted2">Due date</span>
            <input
              type="date"
              value={assignForm.due_date}
              onChange={(e) =>
                setAssignForm((f) => ({ ...f, due_date: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-bm-text"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-bm-muted2">Description</span>
            <textarea
              value={assignForm.description}
              onChange={(e) =>
                setAssignForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={4}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-bm-text"
            />
          </label>
        </div>
      </DecisionDrawer>

      <DecisionDrawer
        open={memoMarkdown !== null}
        title="IC decision memo"
        onClose={() => setMemoMarkdown(null)}
      >
        {memoLoading ? (
          <div className="text-sm text-bm-muted2">Generating memo…</div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs text-bm-text">
            {memoMarkdown}
          </pre>
        )}
      </DecisionDrawer>
    </div>
  );
}
