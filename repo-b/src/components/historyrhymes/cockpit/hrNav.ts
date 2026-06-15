// Single source of truth for History Rhymes navigation. The desktop rail and
// the mobile drawer (HistoryRhymesShell) both consume this list, so adding a
// section means adding one entry here. Later PRs append entries: Admin (PR 6),
// Research (PR 14), Episodes + Calibration (PR 15).

export type HrNavItem = {
  slug: string;
  label: string;
  testId: string;
};

export const HR_NAV: HrNavItem[] = [
  { slug: "", label: "Cockpit", testId: "hr-nav-cockpit" },
  { slug: "morning-book", label: "Morning Book", testId: "hr-nav-morning-book" },
  { slug: "planning", label: "Planning", testId: "hr-nav-planning" },
];

export function hrHref(envId: string, slug: string): string {
  const base = `/lab/env/${envId}/historyrhymes`;
  return slug ? `${base}/${slug}` : base;
}

// Cockpit is active for both the index route and the /routine compatibility alias.
export function isHrItemActive(pathname: string, envId: string, slug: string): boolean {
  const base = `/lab/env/${envId}/historyrhymes`;
  if (!slug) return pathname === base || pathname === `${base}/routine` || pathname.startsWith(`${base}/routine/`);
  const href = `${base}/${slug}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function hrSectionLabel(pathname: string, envId: string): string {
  const match = HR_NAV.find((n) => n.slug && isHrItemActive(pathname, envId, n.slug));
  return match?.label ?? "Cockpit";
}
