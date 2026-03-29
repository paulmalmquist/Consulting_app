import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { environmentHomePath, environmentLoginPath } from "@/lib/environmentAuth";
import {
  findMembershipBySlug,
  PLATFORM_SESSION_COOKIE,
  parsePlatformSessionFromCookieValue,
  sessionHasManagerAccess,
} from "@/lib/server/sessionAuth";

export default async function ResumeAdminPage() {
  const session = await parsePlatformSessionFromCookieValue(
    cookies().get(PLATFORM_SESSION_COOKIE)?.value,
  );

  if (!session) {
    redirect(`${environmentLoginPath("resume")}?returnTo=/resume/admin`);
  }

  const membership = findMembershipBySlug(session, "resume");
  if (!membership || !sessionHasManagerAccess(session, { slug: "resume" })) {
    redirect("/resume/unauthorized");
  }

  redirect(
    environmentHomePath({
      envId: membership.env_id,
      slug: membership.env_slug,
      role: membership.role,
    }),
  );
}
