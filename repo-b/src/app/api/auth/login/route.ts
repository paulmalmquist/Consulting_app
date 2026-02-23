import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  const { inviteCode, loginType, envId } = body as {
    inviteCode?: string;
    loginType?: "admin" | "environment";
    envId?: string;
  };

  const isSecure = process.env.NODE_ENV === "production";

  // ── Admin login ──────────────────────────────────────────────────
  if (loginType === "admin") {
    const expected = process.env.ADMIN_INVITE_CODE || "";
    if (!inviteCode || inviteCode !== expected) {
      return NextResponse.json({ message: "Invalid admin code" }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, redirectTo: "/admin" });
    response.cookies.set({
      name: "bos_session",
      value: JSON.stringify({ role: "admin" }),
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
    });
    return response;
  }

  // ── Environment login ────────────────────────────────────────────
  if (loginType === "environment") {
    const expected =
      process.env.ENV_INVITE_CODE || process.env.DEMO_INVITE_CODE || "";
    if (!inviteCode || inviteCode !== expected) {
      return NextResponse.json({ message: "Invalid access code" }, { status: 401 });
    }
    const sessionPayload: Record<string, string> = { role: "env_user" };
    if (envId) sessionPayload.env_id = envId;

    const redirectTo = envId ? `/lab/env/${envId}` : "/lab/environments";
    const response = NextResponse.json({ ok: true, redirectTo });
    response.cookies.set({
      name: "bos_session",
      value: JSON.stringify(sessionPayload),
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
    });
    return response;
  }

  // ── Legacy fallback (backward compat with DEMO_INVITE_CODE) ─────
  const expected = process.env.DEMO_INVITE_CODE || "";
  if (!inviteCode || inviteCode !== expected) {
    return NextResponse.json({ message: "Invalid invite code" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, redirectTo: "/lab/environments" });
  // Write new session cookie (structured) and keep legacy cookie for backward compat
  response.cookies.set({
    name: "bos_session",
    value: JSON.stringify({ role: "env_user" }),
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
  });
  response.cookies.set({
    name: "demo_lab_session",
    value: "active",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    path: "/",
  });
  return response;
}
