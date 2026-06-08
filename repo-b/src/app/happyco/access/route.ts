import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "happyco_demo_access";
const LOCAL_FALLBACK_CODE = "happyco-local-demo";

function expectedInviteCode() {
  if (process.env.HAPPYCO_DEMO_INVITE_CODE) return process.env.HAPPYCO_DEMO_INVITE_CODE;
  if (process.env.NODE_ENV !== "production") return LOCAL_FALLBACK_CODE;
  return "";
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const inviteCode = String(form.get("inviteCode") || "").trim();
  const expected = expectedInviteCode();
  const url = new URL("/happyco", request.url);

  if (!expected || inviteCode !== expected) {
    url.searchParams.set("error", "invalid");
    return NextResponse.redirect(url, { status: 303 });
  }

  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "granted",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/happyco",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
