import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: "demo_lab_session",
    value: "",
    maxAge: 0,
    path: "/"
  });

  return response;
}
