import { notFound } from "next/navigation";

import EnvironmentIntro from "@/components/public/EnvironmentIntro";
import {
  environmentCatalog,
  isEnvironmentSlug,
} from "@/lib/environmentAuth";

/**
 * Public "about this environment" screen.
 *
 * Reachable at `/{environmentSlug}/about` — e.g. `/meridian/about`.
 * Middleware does not gate this route (it's a sibling of `/{slug}/login`
 * and `/{slug}/unauthorized`, which are also public). That makes this the
 * first-click surface after the homepage: a prospect can click an env card,
 * land here, read what the environment does, and then decide to sign in.
 *
 * The existing `/{environmentSlug}` page.tsx handles the authenticated
 * redirect flow untouched — we do not compete with it.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({
    environmentSlug,
  }));
}

export default async function EnvironmentAboutPage({
  params,
}: {
  params: Promise<{ environmentSlug: string }>;
}) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) notFound();
  return <EnvironmentIntro slug={environmentSlug} />;
}
