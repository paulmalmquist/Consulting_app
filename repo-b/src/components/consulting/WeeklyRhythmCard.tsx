"use client";

import { Card, CardContent } from "@/components/ui/Card";

const DAYS = [
  { key: "mon", label: "Monday", focus: "Pipeline Review", target: "Review all deals · Promote 2-3 targets", metric: "Force deal review" },
  { key: "tue", label: "Tuesday", focus: "Proof Assets", target: "Draft or update 1 proof asset", metric: "1 asset shipped" },
  { key: "wed", label: "Wednesday", focus: "Outbound Push", target: "Send 10 outreach messages", metric: "10 messages sent" },
  { key: "thu", label: "Thursday", focus: "Demos + Feedback", target: "Run demos · Log objections", metric: "Demos completed" },
  { key: "fri", label: "Friday", focus: "Metrics Review", target: "Review conversion · Plan next week", metric: "Pipeline health check" },
] as const;

function getDayIndex(): number {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return -1;
  return day - 1;
}

export function WeeklyRhythmCard() {
  const todayIdx = getDayIndex();

  return (
    <section>
      <div className="mb-2">
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-semibold">Weekly Rhythm</p>
      </div>
      {/* Mobile: show only today. Desktop: show all days */}
      <div className="md:hidden">
        {todayIdx >= 0 ? (
          <Card>
            <CardContent className="py-3 px-4 ring-1 ring-bm-accent/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2.5 w-2.5 rounded-full bg-bm-accent animate-pulse" />
                <p className="text-xs uppercase tracking-wider font-bold text-bm-accent">
                  {DAYS[todayIdx].label} — {DAYS[todayIdx].focus}
                </p>
              </div>
              <p className="text-sm text-bm-text font-medium">{DAYS[todayIdx].target}</p>
              <p className="text-[10px] text-bm-muted2 mt-1">Goal: {DAYS[todayIdx].metric}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-sm text-bm-muted2">Weekend — rest or catch up on blocked items</p>
            </CardContent>
          </Card>
        )}
      </div>
      {/* Desktop: full week strip */}
      <div className="hidden md:grid md:grid-cols-5 gap-2">
        {DAYS.map((day, idx) => {
          const isToday = idx === todayIdx;
          const isPast = todayIdx >= 0 && idx < todayIdx;
          return (
            <Card key={day.key}>
              <CardContent className={`py-2.5 px-3 ${isToday ? "ring-1 ring-bm-accent/50" : ""}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    isToday ? "bg-bm-accent animate-pulse" : isPast ? "bg-emerald-500" : "bg-bm-muted2/30"
                  }`} />
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${
                    isToday ? "text-bm-accent" : "text-bm-muted2"
                  }`}>
                    {day.label.slice(0, 3)}
                  </p>
                </div>
                <p className={`text-xs font-medium ${isToday ? "text-bm-text" : isPast ? "text-bm-muted2 line-through" : "text-bm-muted2"}`}>
                  {day.focus}
                </p>
                <p className={`text-[10px] mt-0.5 ${isToday ? "text-bm-accent/70" : "text-bm-muted2/60"}`}>
                  {day.metric}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
