import { cookies } from "next/headers";

export function isAdminSession(): boolean {
  const raw = cookies().get("bos_session")?.value;
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { role?: string };
    return parsed.role === "admin";
  } catch {
    return false;
  }
}
