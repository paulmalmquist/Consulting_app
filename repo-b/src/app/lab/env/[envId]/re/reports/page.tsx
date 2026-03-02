"use client";

/* ── Reports Landing Page ─────────────────────────────────────────
   Card-based navigation to sub-reports.
   ────────────────────────────────────────────────────────────────── */

import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { BarChart3, ChevronRight } from "lucide-react";
import Link from "next/link";

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
    <section className="space-y-5" data-testid="reports-landing-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-bm-muted2">
          Analytical reports for fund and investment performance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.slug}
              href={`/lab/env/${envId}/re/reports/${report.slug}`}
              className="group rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 transition hover:border-bm-accent/50 hover:bg-bm-surface/30"
              data-testid={`report-card-${report.slug}`}
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/30 p-2">
                  <Icon size={20} className="text-bm-accent" />
                </div>
                <ChevronRight
                  size={16}
                  className="text-bm-muted2 transition group-hover:text-bm-accent"
                />
              </div>
              <h2 className="mt-3 text-base font-semibold">{report.title}</h2>
              <p className="mt-1 text-sm text-bm-muted2 leading-relaxed">
                {report.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
