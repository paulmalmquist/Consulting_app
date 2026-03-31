"use client";

import { Card, CardContent } from "@/components/ui/Card";

const DAYS = [
  { key: "mon", label: "Monday", focus: "Pipeline + Targets", activities: ["Review target queue", "Promote 2-3 leads", "Update pipeline stages"] },
  { key: "tue", label: "Tuesday", focus: "Proof Assets", activities: ["Draft or update proof asset", "Review case study progress", "Check demo readiness"] },
  { key: "wed", label: "Wednesday", focus: "Outbound", activities: ["Send Touch 1 emails", "Follow up on sequences", "Log outreach in CRM"] },
  { key: "thu", label: "Thursday", focus: "Demos + Feedback", activities: ["Run scheduled demos", "Log objections heard", "Update lead hypotheses"] },
  { key: "fri", label: "Friday", focus: "Review + Reprioritize", activities: ["Review pipeline metrics", "Rescore stale leads", "Plan next week targets"] },
] as const;

function getDayIndex(): number {
  const day = new Date().getDay();
  // 0 = Sunday, 1 = Monday ... 5 = Friday, 6 = Saturday
  if (day === 0 || day === 6) return -1; // weekend
  return day - 1; // 0-based Mon-Fri
}

export function WeeklyRhythmCard() {
  const todayIdx = getDayIndex();

  return (
    <section>
      <div className="mb-2">
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Weekly Rhythm</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {DAYS.map((day, idx) => {
          const isToday = idx === todayIdx;
          const isPast = todayIdx >= 0 && idx < todayIdx;
          return (
            <Card key={day.key}>
              <CardContent className={`py-3 px-3 ${isToday ? "ring-1 ring-bm-accent/50" : ""}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    isToday ? "bg-bm-accent animate-pulse" : isPast ? "bg-emerald-500" : "bg-bm-muted2/30"
                  }`} />
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${
                    isToday ? "text-bm-accent" : "text-bm-muted2"
                  }`}>
                    {day.label.slice(0, 3)}
                  </p>
                </div>
                <p className={`text-xs font-medium mb-1.5 ${isToday ? "text-bm-text" : "text-bm-muted2"}`}>
                  {day.focus}
                </p>
                <ul className="space-y-1">
                  {day.activities.map((activity) => (
                    <li key={activity} className={`text-[10px] leading-tight ${
                      isPast ? "text-bm-muted2 line-through" : "text-bm-muted2"
                    }`}>
                      {activity}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
