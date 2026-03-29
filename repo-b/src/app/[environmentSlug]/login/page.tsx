import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { environmentCatalog, environmentHomePath, isEnvironmentSlug, sanitizeReturnTo } from "@/lib/environmentAuth";
import {
  findMembershipBySlug,
  PLATFORM_SESSION_COOKIE,
  parsePlatformSessionFromCookieValue,
} from "@/lib/server/sessionAuth";
import { EnvironmentAuthShell, EnvironmentLoginForm } from "@/components/auth/EnvironmentAccess";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({ environmentSlug }));
}

export default async function EnvironmentLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ environmentSlug: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) notFound();

  const resolvedSearchParams = await searchParams;
  const session = await parsePlatformSessionFromCookieValue(
    cookies().get(PLATFORM_SESSION_COOKIE)?.value,
  );
  const membership = findMembershipBySlug(session, environmentSlug);

  if (membership) {
    const returnTo = sanitizeReturnTo(resolvedSearchParams?.returnTo);
    if (returnTo) {
      redirect(returnTo);
    }
    redirect(
      environmentHomePath({
        envId: membership.env_id,
        slug: membership.env_slug,
        role: membership.role,
      }),
    );
  }

  const branding = environmentCatalog[environmentSlug];
  return (
    <EnvironmentAuthShell
      slug={environmentSlug}
      title={branding.loginTitle}
      subtitle={branding.loginSubtitle}
    >
      <EnvironmentLoginForm
        slug={environmentSlug}
        returnTo={sanitizeReturnTo(resolvedSearchParams?.returnTo)}
      />
    </EnvironmentAuthShell>
  );
}
