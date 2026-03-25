"use client";

import { useCallback, useEffect, useState } from "react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import type {
  DashboardSpec,
  DashboardWidget,
  EntityScope,
  SavedDashboard,
} from "@/lib/dashboards/types";
import type { HintContext } from "@/lib/dashboards/hint-engine";
import DashboardPrompt from "@/components/repe/dashboards/DashboardPrompt";
import DashboardCanvas from "@/components/repe/dashboards/DashboardCanvas";
import DashboardToolbar from "@/components/repe/dashboards/DashboardToolbar";
import WidgetConfigPanel from "@/components/repe/dashboards/WidgetConfigPanel";

export default function SavedDashboardPage({
  params,
}: {
  params: { envId: string; dashboardId: string };
}) {
  const { businessId } = useReEnv();

  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);
  const [dashboardName, setDashboardName] = useState("Dashboard");
  const [promptText, setPromptText] = useState("");
  const [layoutArchetype, setLayoutArchetype] = useState("custom");
  const [entityScope, setEntityScope] = useState<EntityScope>({ entity_type: "asset" });
  const [quarter, setQuarter] = useState("2026Q1");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!businessId) return;

    const query = new URLSearchParams({
      env_id: params.envId,
      business_id: businessId,
    });

    setLoading(true);
    setLoadError(null);

    fetch(`/api/re/v2/dashboards/${params.dashboardId}?${query}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(typeof data?.error === "string" ? data.error : "Failed to load dashboard");
        }
        return data as SavedDashboard;
      })
      .then((dashboard) => {
        setDashboardName(dashboard.name);
        setPromptText(dashboard.prompt_text || "");
        setLayoutArchetype(dashboard.layout_archetype || "custom");
        setEntityScope(dashboard.entity_scope?.entity_type ? dashboard.entity_scope : { entity_type: "asset" });
        setQuarter(dashboard.quarter || "2026Q1");
        setDensity(dashboard.density === "compact" || dashboard.spec?.density === "compact" ? "compact" : "comfortable");
        setWidgets(Array.isArray(dashboard.spec?.widgets) ? dashboard.spec.widgets : []);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, [params.envId, params.dashboardId, businessId]);

  const hintContext: HintContext = { quarter, has_prompt: true, prompt_text: promptText };

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
          density,
        }),
      });
      const data = await res.json();
      if (data.spec?.widgets) {
        setWidgets(data.spec.widgets);
        setDashboardName(data.name || "Dashboard");
        setLayoutArchetype(data.layout_archetype || "custom");
        setEntityScope(data.entity_scope?.entity_type ? data.entity_scope : { entity_type: "asset" });
        setQuarter(data.quarter || quarter);
        setDensity(data.spec.density === "compact" ? "compact" : "comfortable");
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }, [params.envId, businessId, quarter, density]);

  const handleSave = useCallback(async (name: string) => {
    if (!businessId) return;

    setSaving(true);
    try {
      const spec: DashboardSpec = { widgets, density };
      const res = await fetch(`/api/re/v2/dashboards/${params.dashboardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: params.envId,
          business_id: businessId,
          name,
          description: promptText,
          layout_archetype: layoutArchetype,
          spec,
          prompt_text: promptText,
          entity_scope: entityScope,
          quarter,
          density,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDashboardName(data.name || name);
        setLayoutArchetype(data.layout_archetype || layoutArchetype);
        setQuarter(data.quarter || quarter);
        setDensity(data.density === "compact" || data.spec?.density === "compact" ? "compact" : "comfortable");
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [widgets, density, params.dashboardId, params.envId, businessId, promptText, layoutArchetype, entityScope, quarter]);

  const configWidget = configWidgetId ? widgets.find((w) => w.id === configWidgetId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-bm-muted2">Loading dashboard...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-y-auto px-6 py-6 space-y-6 ${configWidget ? "pr-0" : ""}`}>
        <DashboardPrompt
          onGenerate={handleGenerate}
          generating={generating}
          context={hintContext}
        />

        <DashboardToolbar
          dashboardId={params.dashboardId}
          dashboardName={dashboardName}
          isEditing={isEditing}
          onToggleEdit={() => setIsEditing(!isEditing)}
          onSave={handleSave}
          onRename={setDashboardName}
          saving={saving}
        />

        {widgets.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-bm-muted2">Density:</span>
            {(["comfortable", "compact"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDensity(value)}
                className={`rounded px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  density === value
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        )}

        <DashboardCanvas
          widgets={density === "compact"
            ? widgets.map((widget) => ({
              ...widget,
              layout: {
                ...widget.layout,
                h: Math.max(2, widget.layout.h - 1),
              },
            }))
            : widgets}
          envId={params.envId}
          businessId={businessId ?? ""}
          quarter={quarter}
          isEditing={isEditing}
          onWidgetsChange={setWidgets}
          onConfigureWidget={setConfigWidgetId}
        />
      </div>

      {configWidget && (
        <div className="w-80 shrink-0 border-l border-slate-200 bg-white dark:border-white/10 dark:bg-[rgba(15,23,42,0.92)]">
          <WidgetConfigPanel
            widget={configWidget}
            onUpdate={(updated) => {
              setWidgets((prev) => prev.map((widget) => (widget.id === updated.id ? updated : widget)));
              setConfigWidgetId(null);
            }}
            onRemove={() => {
              setWidgets((prev) => prev.filter((widget) => widget.id !== configWidgetId));
              setConfigWidgetId(null);
            }}
            onClose={() => setConfigWidgetId(null)}
          />
        </div>
      )}
    </div>
  );
}
