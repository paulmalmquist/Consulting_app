"use client";

import type { OutreachSnapshotData } from "@/lib/cro-api";

export default function OutreachSnapshot({ data }: { data: OutreachSnapshotData }) {
  const cells = [
    { label: "Sent (7d)", value: data.sent_7d },
    { label: "Replies", value: data.replies_7d },
    { label: "Reply Rate", value: `${(data.reply_rate_7d * 100).toFixed(0)}%` },
    { label: "Meetings", value: data.meetings_7d },
  ];

  return (
    <section>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bm-border/40">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          Outreach (7 Days)
        </span>
      </div>
      <div className="flex divide-x divide-bm-border/25">
        {cells.map((c) => (
          <div key={c.label} className="flex-1 px-3 py-2 text-center">
            <p className="text-base font-semibold text-bm-text tabular-nums">{c.value}</p>
            <p className="text-[10px] text-bm-muted2">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
