"use client";

import { useCallback, useEffect, useState } from "react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import type { DashboardWidget } from "@/lib/dashboards/types";
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
  const [quarter, setQuarter] = useState("2026Q1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [configWidgetId, setConfigWidgetId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Load dashboard
  useEffect(() => {
    fetch(`/api/re/v2/dashboards?env_id=${params.envId}&business_id=${businessId}`)
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return;
        // Find by ID from the list, or load directly
        // For now we need a direct GET endpoint — fallback to finding in list
        // This is a simplification; a proper GET by ID endpoint would be better
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Direct load attempt
    const pool = new URLSearchParams({ env_id: params.envId, business_id: businessId ?? "" });
    fetch(`/api/re/v2/dashboards?${pool}`)
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return;
        const found = list.find((d: { id: string }) => d.id === params.dashboardId);
        if (found) {
          setDashboardName(found.name);
          setPromptText(found.prompt_text || "");
          setQuarter(found.quarter || "2026Q1");
          // We need the full spec which includes widgets — if the list endpoint doesn't return it,
          // the widgets will need to be loaded separately
          if (found.spec?.widgets) {
            setWidgets(found.spec.widgets);
          }
        }
      })
      .catch(() => {})
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
        body: JSON.stringify({ prompt, env_id: params.envId, business_id: businessId, quarter }),
      });
      const data = await res.json();
      if (data.spec?.widgets) {
        setWidgets(data.spec.widgets);
        if (data.name) setDashboardName(data.name);
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }, [params.envId, businessId, quarter]);

  const handleSave = useCallback(async (name: string) => {
    setSaving(true);
    try {
      await fetch("/api/re/v2/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: params.envId,
          business_id: businessId,
          name,
          spec: { widgets },
          prompt_text: promptText,
          quarter,
        }),
      });
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [widgets, params.envId, businessId, promptText, quarter]);

  const configWidget = configWidgetId ? widgets.find((w) => w.id === configWidgetId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-bm-muted2">Loading dashboard...</p>
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

        <DashboardCanvas
          widgets={widgets}
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
              setWidgets((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
              setConfigWidgetId(null);
            }}
            onRemove={() => {
              setWidgets((prev) => prev.filter((w) => w.id !== configWidgetId));
              setConfigWidgetId(null);
            }}
            onClose={() => setConfigWidgetId(null)}
          />
        </div>
      )}
    </div>
  );
}
