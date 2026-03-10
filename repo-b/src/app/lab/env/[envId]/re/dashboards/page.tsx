"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import type { DashboardSpec, DashboardWidget, DataAvailability, WidgetQueryManifest } from "@/lib/dashboards/types";
import { listArchetypes } from "@/lib/dashboards/layout-archetypes";
import type { HintContext } from "@/lib/dashboards/hint-engine";
import DashboardPrompt from "@/components/repe/dashboards/DashboardPrompt";
import DashboardCanvas from "@/components/repe/dashboards/DashboardCanvas";
import DashboardToolbar from "@/components/repe/dashboards/DashboardToolbar";
import WidgetConfigPanel from "@/components/repe/dashboards/WidgetConfigPanel";

/* --------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------- */
interface SavedDashboardRow {
  id: string;
  name: string;
  description: string | null;
  layout_archetype: string;
  prompt_text: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------------------------------------------------
 * Page
 * -------------------------------------------------------------------------- */
export default function DashboardBuilderPage({
  params,
}: {
  params: { envId: string };
}) {
  const { businessId } = useReEnv();

  // Dashboard state
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [dashboardName, setDashboardName] = useState("New Dashboard");
  const [dashboardId, setDashboardId] = useState<string | undefined>();
  const [promptText, setPromptText] = useState("");
  const [layoutArchetype, setLayoutArchetype] = useState("executive_summary");
  const [quarter] = useState("2026Q1");

  // Generate response metadata
  const [dataAvailability, setDataAvailability] = useState<DataAvailability[]>([]);
  const [queryManifest, setQueryManifest] = useState<WidgetQueryManifest[]>([]);

  // UI state
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [savedDashboards, setSavedDashboards] = useState<SavedDashboardRow[]>([]);
  const [view, setView] = useState<"builder" | "gallery">("gallery");

  // Load saved dashboards
  useEffect(() => {
    if (!businessId) return;
    fetch(`/api/re/v2/dashboards?env_id=${params.envId}&business_id=${businessId}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSavedDashboards(data); })
      .catch(() => {});
  }, [params.envId, businessId]);

  // Hint context
  const hintContext: HintContext = {
    entity_type: null,
    quarter,
  };

  // Generate dashboard from prompt
  const handleGenerate = useCallback(async (prompt: string) => {
    setGenerating(true);
    setPromptText(prompt);
    try {
      const res = await fetch("/api/re/v2/dashboards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          env_id: params.envId,
          business_id: businessId,
          quarter,
        }),
      });
      const data = await res.json();
      console.log("[Dashboards] Generate response:", { name: data.name, widgetCount: data.spec?.widgets?.length, entity_scope: data.entity_scope, quarter: data.quarter });
      if (data.spec?.widgets) {
        setWidgets(data.spec.widgets);
        setDashboardName(data.name || "Generated Dashboard");
        setLayoutArchetype(data.layout_archetype || "custom");
        setView("builder");
        setIsEditing(true);
        setDataAvailability(data.data_availability || []);
        setQueryManifest(data.query_manifest || []);
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }, [params.envId, businessId, quarter]);

  // Save dashboard
  const handleSave = useCallback(async (name: string) => {
    if (!businessId) return;
    setSaving(true);
    try {
      const spec: DashboardSpec = { widgets };
      const res = await fetch("/api/re/v2/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: params.envId,
          business_id: businessId,
          name,
          description: promptText,
          layout_archetype: layoutArchetype,
          spec,
          prompt_text: promptText,
          quarter,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setDashboardId(data.id);
        // Refresh gallery
        const listRes = await fetch(`/api/re/v2/dashboards?env_id=${params.envId}&business_id=${businessId}`);
        const list = await listRes.json();
        if (Array.isArray(list)) setSavedDashboards(list);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [widgets, params.envId, businessId, promptText, layoutArchetype, quarter]);

  // Widget operations
  const handleConfigureWidget = useCallback((widgetId: string) => {
    setConfigWidgetId(widgetId);
  }, []);

  const handleUpdateWidget = useCallback((updated: DashboardWidget) => {
    setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setConfigWidgetId(null);
  }, []);

  const handleRemoveWidget = useCallback(() => {
    if (configWidgetId) {
      setWidgets((prev) => prev.filter((w) => w.id !== configWidgetId));
      setConfigWidgetId(null);
    }
  }, [configWidgetId]);

  const configWidget = configWidgetId ? widgets.find((w) => w.id === configWidgetId) : null;

  const archetypes = listArchetypes();

  // Gallery view
  if (view === "gallery" && widgets.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Header */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-bm-muted2">AI Dashboard Builder</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-bm-text">Dashboards</h1>
          <p className="mt-2 text-sm text-bm-muted2">
            Describe what you want to see and let AI compose a professional dashboard from approved metrics.
          </p>
        </div>

        {/* Prompt */}
        <DashboardPrompt
          onGenerate={handleGenerate}
          generating={generating}
          context={hintContext}
        />

        {/* Layout archetype cards */}
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-medium mb-3">
            Or start from a layout
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {archetypes.map((arch) => (
              <button
                key={arch.key}
                type="button"
                onClick={() => handleGenerate(`Build a ${arch.name.toLowerCase()} dashboard`)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-bm-accent/50 hover:shadow-md dark:border-white/10 dark:bg-[rgba(15,23,42,0.82)]"
              >
                <p className="text-sm font-semibold text-bm-text group-hover:text-bm-accent transition-colors">
                  {arch.name}
                </p>
                <p className="mt-1 text-xs text-bm-muted2 leading-relaxed">{arch.description}</p>
                <p className="mt-2 text-[10px] text-bm-muted2">{arch.slots.length} widgets</p>
              </button>
            ))}
          </div>
        </div>

        {/* Saved dashboards */}
        {savedDashboards.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-medium mb-3">
              Saved Dashboards
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {savedDashboards.map((d) => (
                <Link
                  key={d.id}
                  href={`/lab/env/${params.envId}/re/dashboards/${d.id}`}
                  className="group rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-bm-accent/50 hover:shadow-md dark:border-white/10 dark:bg-[rgba(15,23,42,0.82)]"
                >
                  <p className="text-sm font-semibold text-bm-text group-hover:text-bm-accent">
                    {d.name}
                  </p>
                  {d.prompt_text && (
                    <p className="mt-1 text-xs text-bm-muted2 line-clamp-2">{d.prompt_text}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-bm-surface/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-bm-muted2">
                      {d.layout_archetype}
                    </span>
                    <span className="text-[10px] text-bm-muted2">
                      {new Date(d.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Builder view
  return (
    <div className="flex h-full">
      {/* Main canvas area */}
      <div className={`flex-1 overflow-y-auto px-6 py-6 space-y-6 ${configWidget ? "pr-0" : ""}`}>
        {/* Prompt (collapsed in builder mode) */}
        <DashboardPrompt
          onGenerate={handleGenerate}
          generating={generating}
          context={hintContext}
        />

        {/* Toolbar */}
        <DashboardToolbar
          dashboardId={dashboardId}
          dashboardName={dashboardName}
          isEditing={isEditing}
          onToggleEdit={() => setIsEditing(!isEditing)}
          onSave={handleSave}
          onRename={setDashboardName}
          saving={saving}
        />

        {/* Canvas */}
        <DashboardCanvas
          widgets={widgets}
          envId={params.envId}
          businessId={businessId ?? ""}
          quarter={quarter}
          isEditing={isEditing}
          onWidgetsChange={setWidgets}
          onConfigureWidget={handleConfigureWidget}
          queryManifests={queryManifest}
          dataAvailabilities={dataAvailability}
        />

        {/* Back to gallery */}
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => { setView("gallery"); setWidgets([]); setDashboardId(undefined); }}
            className="text-xs text-bm-muted2 hover:text-bm-text"
          >
            Back to dashboard gallery
          </button>
        </div>
      </div>

      {/* Config panel (right rail) */}
      {configWidget && (
        <div className="w-80 shrink-0 border-l border-slate-200 bg-white dark:border-white/10 dark:bg-[rgba(15,23,42,0.92)]">
          <WidgetConfigPanel
            widget={configWidget}
            onUpdate={handleUpdateWidget}
            onRemove={handleRemoveWidget}
            onClose={() => setConfigWidgetId(null)}
          />
        </div>
      )}
    </div>
  );
}
