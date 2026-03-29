export const SUPPORTED_ENVIRONMENT_SLUGS = [
  "novendor",
  "floyorker",
  "stone-pds",
  "meridian",
  "resume",
  "trading",
] as const;

export type EnvironmentSlug = (typeof SUPPORTED_ENVIRONMENT_SLUGS)[number];

export type EnvironmentAuthMode = "private" | "public" | "hybrid";
export type EnvironmentMembershipRole = "owner" | "admin" | "member" | "viewer";
export type EnvironmentMembershipStatus = "active" | "invited" | "suspended" | "revoked";

export type EnvironmentBranding = {
  slug: EnvironmentSlug;
  label: string;
  familyLabel: string;
  loginTitle: string;
  loginSubtitle: string;
  unauthorizedTitle: string;
  unauthorizedBody: string;
  accent: string;
  accentSoft: string;
  glow: string;
  shellGradient: string;
  panelGradient: string;
  buttonText: string;
};

export const environmentCatalog: Record<EnvironmentSlug, EnvironmentBranding> = {
  novendor: {
    slug: "novendor",
    label: "Novendor",
    familyLabel: "Winston Consulting",
    loginTitle: "Sign in to Novendor",
    loginSubtitle: "Client operating system for pipeline, delivery, and execution rhythm.",
    unauthorizedTitle: "Novendor access required",
    unauthorizedBody: "Your identity is valid, but this account is not currently allowed into the Novendor environment.",
    accent: "158 63% 46%",
    accentSoft: "166 68% 35%",
    glow: "16, 185, 129",
    shellGradient: "radial-gradient(circle at top left, rgba(16, 185, 129, 0.22), transparent 36%), radial-gradient(circle at bottom right, rgba(20, 184, 166, 0.18), transparent 34%)",
    panelGradient: "linear-gradient(180deg, rgba(9, 17, 21, 0.88), rgba(8, 13, 17, 0.94))",
    buttonText: "222 47% 9%",
  },
  floyorker: {
    slug: "floyorker",
    label: "Floyorker",
    familyLabel: "Winston Media",
    loginTitle: "Sign in to Floyorker",
    loginSubtitle: "Editorial workspace for publishing, rankings, and revenue-backed local content.",
    unauthorizedTitle: "Floyorker access required",
    unauthorizedBody: "This account is signed in, but it does not have Floyorker membership right now.",
    accent: "14 85% 60%",
    accentSoft: "32 84% 52%",
    glow: "249, 115, 22",
    shellGradient: "radial-gradient(circle at top left, rgba(249, 115, 22, 0.2), transparent 36%), radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.18), transparent 36%)",
    panelGradient: "linear-gradient(180deg, rgba(24, 14, 10, 0.88), rgba(17, 10, 7, 0.94))",
    buttonText: "24 100% 7%",
  },
  "stone-pds": {
    slug: "stone-pds",
    label: "Stone PDS",
    familyLabel: "Winston Delivery Systems",
    loginTitle: "Sign in to Stone PDS",
    loginSubtitle: "Project and development command environment for delivery risk, account coverage, and operational intervention.",
    unauthorizedTitle: "Stone PDS access required",
    unauthorizedBody: "This account is active, but it does not currently have membership for the Stone PDS environment.",
    accent: "174 72% 44%",
    accentSoft: "186 70% 36%",
    glow: "45, 212, 191",
    shellGradient: "radial-gradient(circle at top left, rgba(45, 212, 191, 0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.14), transparent 34%)",
    panelGradient: "linear-gradient(180deg, rgba(8, 18, 22, 0.9), rgba(6, 11, 16, 0.95))",
    buttonText: "182 57% 8%",
  },
  meridian: {
    slug: "meridian",
    label: "Meridian Capital Management",
    familyLabel: "Winston Institutional",
    loginTitle: "Sign in to Meridian",
    loginSubtitle: "Institutional investment environment for portfolio, underwriting, and real-estate operating context.",
    unauthorizedTitle: "Meridian access required",
    unauthorizedBody: "Your identity is valid, but this account is not currently allowed into the Meridian environment.",
    accent: "271 62% 63%",
    accentSoft: "257 54% 53%",
    glow: "167, 139, 250",
    shellGradient: "radial-gradient(circle at top left, rgba(167, 139, 250, 0.18), transparent 34%), radial-gradient(circle at bottom right, rgba(96, 165, 250, 0.14), transparent 34%)",
    panelGradient: "linear-gradient(180deg, rgba(16, 12, 25, 0.9), rgba(9, 9, 18, 0.95))",
    buttonText: "210 40% 98%",
  },
  resume: {
    slug: "resume",
    label: "My Resume",
    familyLabel: "Winston Portfolio",
    loginTitle: "Owner access for My Resume",
    loginSubtitle: "Public portfolio on the outside, private authoring and assistant tools on the inside.",
    unauthorizedTitle: "Owner access required",
    unauthorizedBody: "This resume has a public face, but the admin workspace is reserved for the owner or invited collaborators.",
    accent: "204 82% 58%",
    accentSoft: "210 68% 48%",
    glow: "56, 189, 248",
    shellGradient: "radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 36%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.16), transparent 34%)",
    panelGradient: "linear-gradient(180deg, rgba(10, 14, 22, 0.86), rgba(7, 10, 17, 0.94))",
    buttonText: "210 40% 98%",
  },
  trading: {
    slug: "trading",
    label: "Trading Platform",
    familyLabel: "Winston Markets",
    loginTitle: "Sign in to Trading Platform",
    loginSubtitle: "Higher-sensitivity market workspace with explicit tenant and session boundaries.",
    unauthorizedTitle: "Trading access required",
    unauthorizedBody: "This account does not have membership for the Trading Platform environment.",
    accent: "39 96% 53%",
    accentSoft: "0 78% 57%",
    glow: "245, 158, 11",
    shellGradient: "radial-gradient(circle at top left, rgba(245, 158, 11, 0.2), transparent 34%), radial-gradient(circle at bottom right, rgba(239, 68, 68, 0.16), transparent 34%)",
    panelGradient: "linear-gradient(180deg, rgba(21, 12, 10, 0.9), rgba(12, 8, 7, 0.95))",
    buttonText: "24 100% 7%",
  },
};

export function isEnvironmentSlug(value: string | null | undefined): value is EnvironmentSlug {
  return SUPPORTED_ENVIRONMENT_SLUGS.includes(value as EnvironmentSlug);
}

export function environmentLoginPath(slug: EnvironmentSlug) {
  return `/${slug}/login`;
}

export function environmentUnauthorizedPath(slug: EnvironmentSlug) {
  return `/${slug}/unauthorized`;
}

export function environmentLogoutPath(slug: EnvironmentSlug) {
  return `/${slug}/logout`;
}

export function environmentCallbackPath(slug: EnvironmentSlug) {
  return `/${slug}/auth/callback`;
}

export function environmentHomePath(args: {
  envId: string;
  slug: EnvironmentSlug;
  role?: EnvironmentMembershipRole | null;
}): string {
  switch (args.slug) {
    case "novendor":
      return `/lab/env/${args.envId}/consulting`;
    case "floyorker":
      return `/lab/env/${args.envId}/content`;
    case "stone-pds":
      return `/lab/env/${args.envId}/pds`;
    case "meridian":
      return `/lab/env/${args.envId}/re`;
    case "resume":
      return `/lab/env/${args.envId}/resume`;
    case "trading":
      return `/lab/env/${args.envId}/markets`;
    default:
      return `/lab/env/${args.envId}`;
  }
}

export function environmentDisplayHomePath(slug: EnvironmentSlug) {
  if (slug === "resume") return "/resume";
  return `/${slug}`;
}

export function isEnvironmentManagerRole(role: string | null | undefined): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

export function sanitizeReturnTo(input: string | null | undefined): string | null {
  if (!input) return null;
  if (!input.startsWith("/")) return null;
  if (input.startsWith("//")) return null;
  return input;
}
