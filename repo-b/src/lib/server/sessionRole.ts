import { cookies } from "next/headers";
import {
  decodePlatformSessionPayloadUnsafe,
  LEGACY_SESSION_COOKIE,
  PLATFORM_SESSION_COOKIE,
} from "@/lib/server/sessionAuth";

export function isAdminSession(): boolean {
  const platformRaw = cookies().get(PLATFORM_SESSION_COOKIE)?.value;
  const platform = decodePlatformSessionPayloadUnsafe(platformRaw);
  if (platform?.platform_admin) return true;

  const raw = cookies().get(LEGACY_SESSION_COOKIE)?.value;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { role?: string };
    return parsed.role === "admin";
  } catch {
    return false;
  }
}
