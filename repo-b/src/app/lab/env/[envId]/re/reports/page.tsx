"use client";

/* ── Reports Landing Page ─────────────────────────────────────────
   Card-based navigation to sub-reports.
   ────────────────────────────────────────────────────────────────── */

import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { BarChart3, ChevronRight, FileText, TrendingUp, PieChart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RepeIndexScaffold } from "@/components/repe/RepeIndexScaffold";

interface ReportTemplate {
  report_key: string;
  name: string;
  description: string;
  entity_level: string;
}

const STATIC_REPORTS = [
  {
    slug: "uw-vs-actual",
    title: "UW vs Actual",
    description:
      "Compare underwritten projections against actual realized performance across the portfolio.",
    icon: BarChart3,
  },
] as const;

const ENTITY_ICONS: Record<string, typeof FileText> = {
  asset: FileText,
  investment: TrendingUp,
  fund: PieChart,
};

export default function ReportsLandingPage() {
  const { envId } = useReEnv();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);

  useEffect(() => {
    fetch("/api/re/v2/reports/catalog")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  return (
    <RepeIndexScaffold
      title="Reports"
      subtitle="Analytical reports for fund and investment performance."
      className="w-full"
    >
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="reports-landing-page">
        {STATIC_REPORTS.map((report) => {
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

        {templates.map((tmpl) => {
          const Icon = ENTITY_ICONS[tmpl.entity_level] || FileText;
          return (
            <Link
              key={tmpl.report_key}
              href={`/lab/env/${envId}/re/reports/${tmpl.report_key}`}
              className="group rounded-xl border border-bm-border/70 bg-bm-surface/12 p-5 transition-colors duration-100 hover:border-bm-border/90 hover:bg-bm-surface/22"
              data-testid={`report-card-${tmpl.report_key}`}
            >
              <div className="flex items-start justify-between">
                <div className="rounded-lg border border-bm-border/50 bg-bm-surface/25 p-2">
                  <Icon size={20} className="text-bm-accent" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-bm-surface/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-bm-muted2">
                    {tmpl.entity_level}
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-bm-muted2 transition-colors duration-100 group-hover:text-bm-text"
                  />
                </div>
              </div>
              <h2 className="mt-3 text-base font-semibold text-bm-text">{tmpl.name}</h2>
              <p className="mt-1 text-sm leading-relaxed text-bm-muted2">
                {tmpl.description}
              </p>
            </Link>
          );
        })}
      </section>
    </RepeIndexScaffold>
  );
}
