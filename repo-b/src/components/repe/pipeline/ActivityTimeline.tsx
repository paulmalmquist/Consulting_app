"use client";

import { Clock, MessageSquare, Phone, Mail, FileText, AlertCircle } from "lucide-react";

type Activity = {
  activity_id?: string;
  activity_type: string;
  body: string;
  occurred_at: string;
  created_by?: string;
};

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  note: { label: "Note", color: "bg-blue-500/20 text-blue-300 border-blue-500/40", icon: MessageSquare },
  call: { label: "Call", color: "bg-green-500/20 text-green-300 border-green-500/40", icon: Phone },
  email: { label: "Email", color: "bg-purple-500/20 text-purple-300 border-purple-500/40", icon: Mail },
  meeting: { label: "Meeting", color: "bg-teal-500/20 text-teal-300 border-teal-500/40", icon: Clock },
  document: { label: "Document", color: "bg-orange-500/20 text-orange-300 border-orange-500/40", icon: FileText },
  status_change: { label: "Status Change", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", icon: AlertCircle },
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export default function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (!activities.length) {
    return (
      <div className="py-12 text-center text-sm text-bm-muted">
        No activity recorded yet.
      </div>
    );
  }

  const sorted = [...activities].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return (
    <div className="relative space-y-0">
      {/* vertical line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-bm-border" />

      {sorted.map((act, idx) => {
        const cfg = TYPE_CONFIG[act.activity_type] ?? {
          label: act.activity_type,
          color: "bg-bm-surface text-bm-muted border-bm-border",
          icon: MessageSquare,
        };
        const Icon = cfg.icon;

        return (
          <div key={act.activity_id ?? idx} className="relative flex gap-4 py-3 pl-10">
            {/* dot on timeline */}
            <div className="absolute left-2.5 top-4.5 flex h-3 w-3 items-center justify-center rounded-full bg-bm-surface ring-2 ring-bm-border" />

            <div className="flex-1 rounded-lg border border-bm-border bg-bm-surface/40 p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </span>
                <span className="text-xs text-bm-muted">{relativeTime(act.occurred_at)}</span>
                {act.created_by && (
                  <span className="text-xs text-bm-muted">by {act.created_by}</span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-bm-text">{act.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
