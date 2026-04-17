// Context-preserving routing for the in-env WorkspaceSwitcher.
//
// Rule (plan Loop 2): never attempt to preserve a deep entity-scoped path
// across environments — fund ids, asset ids, deal ids are env-scoped and
// will 404 or render a wrong-tenant error in the target.
//
// Preservation policy:
//   1. Extract the current top-level module (segment after /lab/env/{id}/).
//   2. If the module equals the target environment's primary-landing module
//      (derived from `environmentHomePath`), preserve at the module root:
//      `/lab/env/{target}/{module}`.
//   3. If the module is a known shared/utility module that every env renders
//      (e.g. `documents`, `executive`, `analytics`), preserve at the module
//      root.
//   4. Otherwise, fall back to the target environment's home path.
//
// No deeper path is ever carried across — the module's own landing handles
// further navigation, and deep entity sub-paths are stripped even when the
// module is preserved.

import {
  environmentHomePath,
  isEnvironmentSlug,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";

export type SwitchTarget = {
  path: string;
  preservesModule: boolean;
  reason: "same-module" | "shared-module" | "landing-fallback";
};

export type SwitchEnv = {
  env_id: string;
  slug?: string | null;
};

const SHARED_MODULES = new Set<string>([
  "documents",
  "executive",
  "analytics",
  "admin",
  "audit",
]);

/** Return the first path segment after `/lab/env/{envId}/` or null if there is none. */
export function extractTopModule(currentPath: string): string | null {
  const trimmed = currentPath.replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = trimmed.split("/");
  if (parts.length < 3 || parts[0] !== "lab" || parts[1] !== "env") {
    return null;
  }
  return parts[3] ?? null;
}

/** Derive the target environment's primary module from its `environmentHomePath`. */
export function primaryModuleForSlug(slug: EnvironmentSlug, envId: string): string | null {
  const home = environmentHomePath({ envId, slug });
  return extractTopModule(home);
}

/** Resolve the navigation target when switching from the current path to `targetEnv`. */
export function resolveSwitchTarget(
  currentPath: string,
  targetEnv: SwitchEnv,
): SwitchTarget {
  const targetSlug = targetEnv.slug && isEnvironmentSlug(targetEnv.slug)
    ? targetEnv.slug
    : null;

  const fallbackHome = targetSlug
    ? environmentHomePath({ envId: targetEnv.env_id, slug: targetSlug })
    : `/lab/env/${targetEnv.env_id}`;

  const currentModule = extractTopModule(currentPath);
  if (!currentModule) {
    return { path: fallbackHome, preservesModule: false, reason: "landing-fallback" };
  }

  const targetPrimary = targetSlug
    ? primaryModuleForSlug(targetSlug, targetEnv.env_id)
    : null;

  if (targetPrimary && currentModule === targetPrimary) {
    return {
      path: `/lab/env/${targetEnv.env_id}/${currentModule}`,
      preservesModule: true,
      reason: "same-module",
    };
  }

  if (SHARED_MODULES.has(currentModule)) {
    return {
      path: `/lab/env/${targetEnv.env_id}/${currentModule}`,
      preservesModule: true,
      reason: "shared-module",
    };
  }

  return { path: fallbackHome, preservesModule: false, reason: "landing-fallback" };
}
