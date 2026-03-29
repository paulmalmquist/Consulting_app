import { NextRequest, NextResponse } from "next/server";

import { isEnvironmentSlug } from "@/lib/environmentAuth";
import {
  getAccessAdminSnapshot,
  upsertEnvironmentMembership,
} from "@/lib/server/platformAuth";
import {
  isPlatformAdminSession,
  parseSessionFromRequest,
} from "@/lib/server/sessionAuth";

export const runtime = "nodejs";

async function requireAdminSession(request: NextRequest) {
  const session = await parseSessionFromRequest(request);
  if (!session || !isPlatformAdminSession(session)) {
    return null;
  }
  return session;
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const snapshot = await getAccessAdminSnapshot();
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  let body: {
    email?: string;
    environmentSlug?: string;
    role?: string;
    status?: string;
    isDefault?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email || "").trim();
  const environmentSlug = body.environmentSlug || "";
  const role = body.role || "";
  const status = body.status || "";
  const isDefault = Boolean(body.isDefault);

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!isEnvironmentSlug(environmentSlug)) {
    return NextResponse.json({ error: "environmentSlug is invalid" }, { status: 400 });
  }
  if (!["owner", "admin", "member", "viewer"].includes(role)) {
    return NextResponse.json({ error: "role is invalid" }, { status: 400 });
  }
  if (!["active", "invited", "suspended", "revoked"].includes(status)) {
    return NextResponse.json({ error: "status is invalid" }, { status: 400 });
  }

  try {
    const result = await upsertEnvironmentMembership({
      email,
      environmentSlug,
      role: role as "owner" | "admin" | "member" | "viewer",
      status: status as "active" | "invited" | "suspended" | "revoked",
      isDefault,
    });
    return NextResponse.json({ ok: true, membership: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update access";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
