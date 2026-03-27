"use client";

import { useMemo } from "react";

interface Activity {
  crm_activity_id: string;
  activity_type: string;
  subject?: string;
  activity_at: string;
  payload_json?: Record<string, unknown>;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  email: "✉",
  call: "☎",
  meeting: "📅",
  note: "📝",
  task: "✓",
  other: "•",
};

const TYPE_COLORS: Record<string, string> = {
  email: "text-blue-400",
  call: "text-green-400",
  meeting: "text-purple-400",
  note: "text-yellow-400",
  task: "text-teal-400",
  other: "text-bm-muted2",
};

function relativeDate(d: string): string {
  const now = new Date();
  const dt = new Date(d);
  const diff = Math.floor((now.getTime() - dt.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return dt.toLocaleDateString();
}

export function ActivityTimeline({ activities, maxItems = 20 }: { activities: Activity[]; maxItems?: number }) {
  const items = useMemo(
    () => [...activities].sort((a, b) => new Date(b.activity_at).getTime() - new Date(a.activity_at).getTime()).slice(0, maxItems),
    [activities, maxItems],
  );

  if (items.length === 0) {
    return <div className="text-sm text-bm-muted2 text-center py-4">No activity yet</div>;
  }

  return (
    <div className="space-y-1">
      {items.map((act) => {
        const icon = TYPE_ICONS[act.activity_type] || TYPE_ICONS.other;
        const color = TYPE_COLORS[act.activity_type] || TYPE_COLORS.other;
        const body = (act.payload_json as Record<string, string>)?.body;
        return (
          <div key={act.crm_activity_id} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-bm-surface/30">
            <span className={`mt-0.5 text-sm ${color}`}>{icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-bm-text truncate">
                  {act.subject || act.activity_type}
                </p>
                <span className="text-[11px] text-bm-muted2 whitespace-nowrap">{relativeDate(act.activity_at)}</span>
              </div>
              {body ? <p className="mt-0.5 text-xs text-bm-muted2 line-clamp-2">{body}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
