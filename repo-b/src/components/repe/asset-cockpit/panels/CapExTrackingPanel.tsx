"use client";

import SectionHeader from "../shared/SectionHeader";
import { BRIEFING_CONTAINER, BRIEFING_CARD } from "../shared/briefing-colors";
import { getMockCapExProjects } from "../mock-data";
import { fmtMoney } from "../format-utils";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  planned: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  planned: "Planned",
};

export default function CapExTrackingPanel() {
  const projects = getMockCapExProjects();
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);

  return (
    <div className={BRIEFING_CONTAINER}>
      <SectionHeader
        eyebrow="CAPITAL EXPENDITURES"
        title="CapEx Program"
        description={`${fmtMoney(totalSpent)} of ${fmtMoney(totalBudget)} deployed`}
      />

      <div className={`mt-5 ${BRIEFING_CARD} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-[10px] uppercase tracking-[0.14em] text-bm-muted2 dark:border-white/10">
            <tr>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium text-right">Budget</th>
              <th className="px-4 py-3 font-medium text-right">Spent</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium w-32">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {projects.map((p) => (
              <tr key={p.name} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium text-bm-text">{p.name}</td>
                <td className="px-4 py-3 text-right tabular-nums text-bm-text">{fmtMoney(p.budget)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-bm-muted2">{fmtMoney(p.spent)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}
                  >
                    {STATUS_LABELS[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-bm-accent transition-all"
                      style={{ width: `${p.completion_pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
