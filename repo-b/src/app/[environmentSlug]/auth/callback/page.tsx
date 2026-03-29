import Link from "next/link";
import { notFound } from "next/navigation";

import { environmentCatalog, environmentLoginPath, isEnvironmentSlug } from "@/lib/environmentAuth";
import { EnvironmentAuthShell } from "@/components/auth/EnvironmentAccess";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({ environmentSlug }));
}

export default async function EnvironmentAuthCallbackPage({
  params,
}: {
  params: Promise<{ environmentSlug: string }>;
}) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) notFound();

  return (
    <EnvironmentAuthShell
      slug={environmentSlug}
      title="Authentication callback reserved"
      subtitle="This route is ready for future OAuth or SSO callback handling. For phase one, continue through the branded login form."
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-bm-muted">
          No callback action is required right now. Continue with the environment login surface.
        </p>
        <Link
          href={environmentLoginPath(environmentSlug)}
          className="inline-flex h-11 items-center justify-center rounded-md bg-[hsl(var(--env-accent)/1)] px-4 text-sm font-semibold text-[hsl(var(--env-button-text)/1)]"
        >
          Open login
        </Link>
      </div>
    </EnvironmentAuthShell>
  );
}
