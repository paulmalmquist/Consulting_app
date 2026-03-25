"use client";

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function defaultProps(props: IconProps): SVGProps<SVGSVGElement> {
  const { size = 18, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

/* ── Nav icons (AppShell sidebar) ─────────────────────────── */

export function LayoutDashboardIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}

export function HouseIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export function MessageCircleIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

export function ListTodoIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="3" y="5" width="6" height="6" rx="1" />
      <path d="M13 6h8" />
      <path d="M13 9h5" />
      <rect x="3" y="14" width="6" height="6" rx="1" />
      <path d="M13 15h8" />
      <path d="M13 18h5" />
    </svg>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

export function BarChart3Icon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

export function Columns3Icon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <rect x="16" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

export function PipeIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M8 3v18" />
      <path d="M16 3v18" />
      <path d="M8 6h8" />
      <path d="M8 18h8" />
    </svg>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/* ── Sidebar toggle icons ────────────────────────────────── */

export function ChevronsLeftIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

export function ChevronsRightIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <polyline points="13 17 18 12 13 7" />
      <polyline points="6 17 11 12 6 7" />
    </svg>
  );
}

/* ── Department icons ────────────────────────────────────── */

export function UsersIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function DollarSignIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ClipboardListIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </svg>
  );
}

export function CpuIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3" />
      <path d="M15 1v3" />
      <path d="M9 20v3" />
      <path d="M15 20v3" />
      <path d="M20 9h3" />
      <path d="M20 14h3" />
      <path d="M1 9h3" />
      <path d="M1 14h3" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function Trash2Icon(props: IconProps) {
  return (
    <svg {...defaultProps(props)}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/* ── Department icon lookup map ──────────────────────────── */

const DEPT_ICON_MAP: Record<string, React.FC<IconProps>> = {
  finance: DollarSignIcon,
  crm: UsersIcon,
  accounting: DollarSignIcon,
  operations: SettingsIcon,
  projects: ClipboardListIcon,
  it: CpuIcon,
  legal: ShieldIcon,
  hr: HeartIcon,
  executive: GaugeIcon,
  documents: FolderIcon,
  admin: LockIcon,
  waterfall: Columns3Icon,
  underwriting: ClipboardCheckIcon,
  reporting: BarChart3Icon,
  compliance: ShieldIcon,
  content: ClipboardListIcon,
  rankings: ListTodoIcon,
  analytics: BarChart3Icon,
  pipeline: PipeIcon,
  outreach: MessageCircleIcon,
  proposals: ClipboardListIcon,
  clients: UsersIcon,
  authority: SparklesIcon,
  revenue: DollarSignIcon,
};

export function DeptIcon({ deptKey, ...props }: IconProps & { deptKey: string }) {
  const Icon = DEPT_ICON_MAP[deptKey] || SettingsIcon;
  return <Icon {...props} />;
}

/* ── Nav icon lookup map ─────────────────────────────────── */

const NAV_ICON_MAP: Record<string, React.FC<IconProps>> = {
  home: HouseIcon,
  dashboard: LayoutDashboardIcon,
  environments: GlobeIcon,
  uploads: UploadIcon,
  chat: MessageCircleIcon,
  pipeline: Columns3Icon,
  audit: ClipboardCheckIcon,
  metrics: BarChart3Icon,
  ai: SparklesIcon,
  "market-intelligence": TrendingUpIcon,
};

export function NavIcon({ navKey, ...props }: IconProps & { navKey: string }) {
  const Icon = NAV_ICON_MAP[navKey] || LayoutDashboardIcon;
  return <Icon {...props} />;
}
