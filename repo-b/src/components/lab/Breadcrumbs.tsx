"use client";

/**
 * Breadcrumbs — global "where am I" strip.
 *
 * Format: Winston → {Environment} → {Module}
 *
 * Renders everywhere inside `/lab/env/{envId}/...`. Reads pathname +
 * environment from the existing `useEnv()` context. No backend call,
 * no new API.
 *
 * Module label resolution order:
 *   1. VERTICAL_LABELS (hand-curated for domain routes: re, pds, credit, etc.)
 *   2. LAB_DEPARTMENT_BY_KEY (covers lab department keys: finance, crm, etc.)
 *   3. title-cased raw segment (fallback — always legible)
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEnv } from "@/components/EnvProvider";
import { LAB_DEPARTMENT_BY_KEY } from "@/lib/lab/DepartmentRegistry";

// Vertical route segments are NOT in LAB_DEPARTMENT_BY_KEY — they are the
// top-level industry/module paths used by the vertical shells.
const VERTICAL_LABELS: Record<string, string> = {
  re: "Real Estate",
  repe: "Real Estate PE",
  pds: "PDS",
  credit: "Credit",
  consulting: "Consulting",
  operator: "Operator",
  "opportunity-engine": "Opportunity Engine",
  ecc: "Executive Command",
  demo: "Demo",
  documents: "Documents",
  definitions: "Definitions",
  resume: "Resume",
  markets: "Markets",
  ncf: "NCF Reporting",
  legal: "Legal",
  medical: "Medical",
  content: "Content",
  blueprint: "Blueprint",
  analytics: "Analytics",
  "case-factory": "Case Factory",
  copilot: "Copilot",
  "data-chaos": "Data Chaos",
  "data-studio": "Data Studio",
  discovery: "Discovery",
  funds: "Funds",
  impact: "Impact Estimator",
  "metric-dict": "Metric Dictionary",
  "pattern-intel": "Pattern Intelligence",
  pilot: "Pilot",
  pipeline: "Pipeline",
  outputs: "Outputs",
  system: "System",
};

function titleCase(segment: string): string {
  return segment
    .split(/[-_]/)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function labelForSegment(segment: string): string {
  const vertical = VERTICAL_LABELS[segment];
  if (vertical) return vertical;
  const dept = LAB_DEPARTMENT_BY_KEY[segment as keyof typeof LAB_DEPARTMENT_BY_KEY];
  if (dept) return dept.label;
  return titleCase(segment);
}

type Props = {
  envId: string;
  className?: string;
};

type Crumb = {
  label: string;
  href: string | null;
  testId: string;
};

export default function Breadcrumbs({ envId, className }: Props) {
  const pathname = usePathname() || "";
  const { selectedEnv } = useEnv();

  const prefix = `/lab/env/${envId}`;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
  const segments = rest.split("/").filter(Boolean);

  const envLabel =
    selectedEnv?.env_id === envId ? selectedEnv.client_name : "Environment";

  const crumbs: Crumb[] = [
    { label: "Winston", href: "/app", testId: "crumb-winston" },
    { label: envLabel, href: prefix, testId: "crumb-env" },
  ];

  if (segments.length > 0) {
    crumbs.push({
      label: labelForSegment(segments[0]),
      href: segments.length === 1 ? null : `${prefix}/${segments[0]}`,
      testId: "crumb-module",
    });
  }

  // Only emit a sub-page crumb if the URL clearly names a named capability.
  // Heuristic: /{module}/capability/{key} or /{module}/{subpage} where subpage is a word, not a UUID.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (segments.length >= 2) {
    const sub = segments[1] === "capability" && segments[2] ? segments[2] : segments[1];
    if (sub && !UUID_RE.test(sub)) {
      crumbs.push({ label: labelForSegment(sub), href: null, testId: "crumb-sub" });
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="winston-breadcrumbs"
      className={className ?? "mb-3 flex items-center gap-1.5 text-xs text-bm-muted"}
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${crumb.testId}-${idx}`} className="flex items-center gap-1.5">
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                data-testid={crumb.testId}
                className="rounded px-1.5 py-0.5 transition-colors hover:bg-bm-surface/50 hover:text-bm-text"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                data-testid={crumb.testId}
                className={isLast ? "px-1.5 py-0.5 font-medium text-bm-text" : "px-1.5 py-0.5"}
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
            {!isLast ? (
              <span aria-hidden="true" className="text-bm-muted2">
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
