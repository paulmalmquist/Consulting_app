import { NextResponse } from "next/server";

const SESSION_COOKIE = "demo_lab_session";

export function hasDemoSession(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!token) return false;
  const value = token.slice(`${SESSION_COOKIE}=`.length).trim();
  return value.length > 0;
}

export function unauthorizedJson(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}
