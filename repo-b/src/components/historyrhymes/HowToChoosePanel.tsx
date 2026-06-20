"use client";

import type { Overview } from "@/lib/historyrhymes/mlDemo";
import { Panel } from "./mlUi";

export function HowToChoosePanel({ overview }: { overview: Overview }) {
  return (
    <Panel title="How to choose">
      <ul className="space-y-1.5">
        {overview.how_to_choose.map((row, i) => (
          <li key={i} className="text-xs">
            <span className="text-neutral-200 font-medium">{row.need}:</span>{" "}
            <span className="text-neutral-400">{row.use}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DemoScriptPanel({ overview }: { overview: Overview }) {
  const s = overview.demo_script;
  const Section = ({ title, items }: { title: string; items: string[] }) => (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">{title}</div>
      <ol className="list-decimal pl-4 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="text-xs text-neutral-400">{it}</li>
        ))}
      </ol>
    </div>
  );
  return (
    <Panel title="Demo script">
      <Section title="3-minute walkthrough" items={s.three_minute} />
      <Section title="8-minute walkthrough" items={s.eight_minute} />
      <Section title="Interview talk track" items={s.interview_talk_track} />
    </Panel>
  );
}
