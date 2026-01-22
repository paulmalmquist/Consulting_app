import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { inviteCode } = await request.json();
  const expected = process.env.DEMO_INVITE_CODE || "";

  if (!inviteCode || inviteCode !== expected) {
    return NextResponse.json(
      { message: "Invalid invite code" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "demo_lab_session",
    value: "active",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return response;
}
