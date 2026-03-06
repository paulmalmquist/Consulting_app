"use client";

/* ── Reports Landing Page ─────────────────────────────────────────
   Card-based navigation to sub-reports.
   ────────────────────────────────────────────────────────────────── */

import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { BarChart3, ChevronRight } from "lucide-react";
import Link from "next/link";
import { RepeIndexScaffold } from "@/components/repe/RepeIndexScaffold";

const REPORTS = [
  {
    slug: "uw-vs-actual",
    title: "UW vs Actual",
    description:
      "Compare underwritten projections against actual realized performance across the portfolio.",
    icon: BarChart3,
  },
] as const;

export default function ReportsLandingPage() {
  const { envId } = useReEnv();

  return (
    <RepeIndexScaffold
      title="Reports"
      subtitle="Analytical reports for fund and investment performance."
      className="w-full"
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="reports-landing-page">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.slug}
              href={`/lab/env/${envId}/re/reports/${report.slug}`}
              className="group rounded-xl border border-bm-border/70 bg-bm-surface/12 p-5 transition-colors duration-100 hover:border-bm-border/90 hover:bg-bm-surface/22"
              data-testid={`report-card-${report.slug}`}
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/25 p-2">
                  <Icon size={20} className="text-bm-accent" />
                </div>
                <ChevronRight
                  size={16}
                  className="text-bm-muted2 transition-colors duration-100 group-hover:text-bm-text"
                />
              </div>
              <h2 className="mt-3 text-base font-semibold text-bm-text">{report.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-bm-muted2">
                {report.description}
              </p>
            </Link>
          );
        })}
      </section>
    </RepeIndexScaffold>
  );
}
