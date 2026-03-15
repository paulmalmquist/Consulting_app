import type { ComponentType } from "react";
import {
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  Bookmark,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  FileBarChart,
  FileText,
  Landmark,
  LayoutDashboard,
  Leaf,
  LineChart,
  Radar,
  ReceiptText,
  Scale,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import type { MobileNavItem } from "@/components/repe/workspace/MobileBottomNav";

type NavIcon = ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;

export type RepeNavItem = {
  href: string;
  label: string;
  isBase: boolean;
  icon: NavIcon;
  matchPrefixes?: string[];
};

export type RepeNavGroup = {
  label: string;
  key: string;
  icon: NavIcon;
  items: RepeNavItem[];
};

export function isRepePathActive(
  pathname: string,
  href: string,
  isBase: boolean,
  matchPrefixes: string[] = [],
): boolean {
  if (isBase) {
    if (pathname === href) return true;
    if (pathname.startsWith(`${href}/funds`)) return true;
    if (pathname.startsWith(`${href}/portfolio`)) return true;
  } else if (pathname === href || pathname.startsWith(`${href}/`)) {
    return true;
  }

  return matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isRepeNavItemActive(pathname: string, item: Pick<RepeNavItem, "href" | "isBase" | "matchPrefixes">): boolean {
  return isRepePathActive(pathname, item.href, item.isBase, item.matchPrefixes);
}

export function getActiveRepeGroupKey(pathname: string, navGroups: RepeNavGroup[]): string | null {
  return navGroups.find((group) => group.items.some((item) => isRepeNavItemActive(pathname, item)))?.key ?? null;
}

export function buildRepeNavGroups({
  base,
  showIntelligence,
  showSustainability,
}: {
  base: string;
  showIntelligence: boolean;
  showSustainability: boolean;
}): RepeNavGroup[] {
  return [
    {
      label: "Acquisitions",
      key: "acquisitions",
      icon: Radar,
      items: [
        { href: `${base}/pipeline`, label: "Pipeline", isBase: false, icon: Radar },
      ],
    },
    {
      label: "Portfolio",
      key: "portfolio",
      icon: Landmark,
      items: [
        { href: base, label: "Funds", isBase: true, icon: Landmark, matchPrefixes: [`${base}/capital`] },
        { href: `${base}/deals`, label: "Investments", isBase: false, icon: TrendingUp },
        { href: `${base}/assets`, label: "Assets", isBase: false, icon: Building2 },
      ],
    },
    {
      label: "Investor Management",
      key: "investor-management",
      icon: Users,
      items: [
        { href: `${base}/investors`, label: "Investors", isBase: false, icon: Users },
        { href: `${base}/capital-calls`, label: "Capital Calls", isBase: false, icon: ArrowUpCircle },
        { href: `${base}/distributions`, label: "Distributions", isBase: false, icon: ArrowDownCircle },
      ],
    },
    {
      label: "Accounting",
      key: "accounting",
      icon: ReceiptText,
      items: [
        { href: `${base}/fees`, label: "Fees", isBase: false, icon: WalletCards },
        { href: `${base}/period-close`, label: "Period Close", isBase: false, icon: CalendarCheck2 },
        { href: `${base}/variance`, label: "Variance", isBase: false, icon: Scale },
      ],
    },
    {
      label: "Insights",
      key: "insights",
      icon: BarChart3,
      items: [
        { href: `${base}/dashboards`, label: "Dashboards", isBase: false, icon: LayoutDashboard },
        { href: `${base}/reports`, label: "Reports", isBase: false, icon: FileBarChart },
        { href: `${base}/saved-analyses`, label: "Saved Views", isBase: false, icon: Bookmark },
        { href: `${base}/models`, label: "Models", isBase: false, icon: LineChart },
        ...(showIntelligence
          ? [{ href: `${base}/intelligence`, label: "Intelligence", isBase: false, icon: Activity }]
          : []),
        ...(showSustainability
          ? [{ href: `${base}/sustainability`, label: "Sustainability", isBase: false, icon: Leaf }]
          : []),
      ],
    },
    {
      label: "Governance",
      key: "governance",
      icon: FileText,
      items: [
        { href: `${base}/documents`, label: "Documents", isBase: false, icon: FileText },
        {
          href: `${base}/approvals`,
          label: "Approvals",
          isBase: false,
          icon: CheckCircle2,
          matchPrefixes: [`${base}/controls`],
        },
      ],
    },
    {
      label: "Automation",
      key: "automation",
      icon: Sparkles,
      items: [
        { href: `${base}/winston`, label: "Winston", isBase: false, icon: Sparkles },
      ],
    },
  ];
}

export function buildRepeMobileNavItems(base: string): MobileNavItem[] {
  return [
    { href: `${base}/pipeline`, label: "Pipeline", icon: "pipeline", matchPrefix: true },
    { href: base, label: "Funds", icon: "funds", matchPrefix: false },
    { href: `${base}/winston`, label: "Winston", icon: "winston", matchPrefix: true },
    { href: `${base}/investors`, label: "Investors", icon: "investors", matchPrefix: true },
    { href: `${base}/reports`, label: "Reports", icon: "reports", matchPrefix: true },
  ];
}
