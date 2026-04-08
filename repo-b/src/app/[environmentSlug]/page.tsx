import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  environmentCatalog,
  environmentHomePath,
  isEnvironmentSlug,
} from "@/lib/environmentAuth";
import {
  findMembershipBySlug,
  PLATFORM_SESSION_COOKIE,
  parsePlatformSessionFromCookieValue,
} from "@/lib/server/sessionAuth";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(environmentCatalog).map((environmentSlug) => ({ environmentSlug }));
}

export default async function EnvironmentEntryPage({
  params,
}: {
  params: Promise<{ environmentSlug: string }>;
}) {
  const { environmentSlug } = await params;
  if (!isEnvironmentSlug(environmentSlug)) notFound();

  const session = await parsePlatformSessionFromCookieValue(
    cookies().get(PLATFORM_SESSION_COOKIE)?.value,
  );
  const membership = findMembershipBySlug(session, environmentSlug);

  if (!membership) {
    if (session) {
      redirect(`/app?denied=${environmentSlug}`);
    }
    redirect(`/?returnTo=/${environmentSlug}`);
  }

  redirect(
    environmentHomePath({
      envId: membership.env_id,
      slug: membership.env_slug,
      role: membership.role,
    }),
  );
}
