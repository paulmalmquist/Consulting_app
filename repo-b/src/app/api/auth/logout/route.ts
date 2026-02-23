import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear new structured session cookie
  response.cookies.set({ name: "bos_session", value: "", maxAge: 0, path: "/" });
  // Also clear legacy cookie for backward compatibility
  response.cookies.set({ name: "demo_lab_session", value: "", maxAge: 0, path: "/" });
  return response;
}
