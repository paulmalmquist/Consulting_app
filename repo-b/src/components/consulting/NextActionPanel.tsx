"use client";

import { useState } from "react";
import { completeNextAction, skipNextAction, type NextAction } from "@/lib/cro-api";

const ACTION_ICONS: Record<string, string> = {
  email: "✉",
  call: "☎",
  meeting: "📅",
  research: "🔍",
  follow_up: "↩",
  proposal: "📄",
  linkedin: "💼",
  task: "✓",
  other: "•",
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-l-red-500 bg-red-500/5",
  high: "border-l-orange-400 bg-orange-400/5",
  normal: "border-l-bm-border",
  low: "border-l-bm-border/40",
};

function ActionItem({
  action,
  businessId,
  onUpdate,
}: {
  action: NextAction;
  businessId: string;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const icon = ACTION_ICONS[action.action_type] || ACTION_ICONS.other;
  const style = PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.normal;

  const handleComplete = async () => {
    setLoading(true);
    try {
      await completeNextAction(action.id, businessId);
      onUpdate();
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await skipNextAction(action.id, businessId);
      onUpdate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 ${style}`}>
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-bm-text truncate">{action.description}</p>
        <p className="text-[11px] text-bm-muted2">
          {action.entity_name || action.entity_type} · {action.action_type}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleComplete}
          disabled={loading}
          className="rounded px-2 py-1 text-[11px] text-green-400 hover:bg-green-400/10 disabled:opacity-50"
        >
          Done
        </button>
        <button
          onClick={handleSkip}
          disabled={loading}
          className="rounded px-2 py-1 text-[11px] text-bm-muted2 hover:bg-bm-surface/40 disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export function NextActionPanel({
  title,
  actions,
  businessId,
  onUpdate,
  variant = "default",
}: {
  title: string;
  actions: NextAction[];
  businessId: string;
  onUpdate: () => void;
  variant?: "default" | "overdue";
}) {
  if (actions.length === 0) return null;

  const borderColor = variant === "overdue" ? "border-red-500/30" : "border-bm-border/70";
  const headerColor = variant === "overdue" ? "text-red-400" : "text-bm-muted2";

  return (
    <div className={`rounded-xl border ${borderColor} bg-bm-surface/20 p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-xs font-semibold uppercase tracking-[0.12em] ${headerColor}`}>
          {title}
        </h3>
        <span className="text-xs text-bm-muted2">{actions.length} items</span>
      </div>
      <div className="space-y-1">
        {actions.map((action) => (
          <ActionItem key={action.id} action={action} businessId={businessId} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}
