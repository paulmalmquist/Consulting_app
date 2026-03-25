import { NextResponse } from "next/server";
import type { PublicLeadCreateRequest } from "@/lib/public-assistant/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as Partial<PublicLeadCreateRequest>;
  const company_name = String(payload.company_name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const industry = String(payload.industry || "").trim();
  const team_size = String(payload.team_size || "").trim();
  const source = String(payload.source || "public_onboarding").trim();

  if (!company_name) {
    return NextResponse.json({ error: "company_name is required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const notes = [
    `intake_source=${source}`,
    `contact_email=${email}`,
    team_size ? `team_size=${team_size}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const envCreateUrl = new URL("/api/v1/environments", request.url);
  const envResp = await fetch(envCreateUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: company_name,
      industry: industry || "general",
      industry_type: industry || "general",
      notes,
    }),
  });

  const envPayload = await envResp.json().catch(() => ({}));
  if (!envResp.ok) {
    const message =
      (typeof envPayload?.message === "string" && envPayload.message) ||
      (typeof envPayload?.error === "string" && envPayload.error) ||
      "Failed to create environment from onboarding intake";
    return NextResponse.json({ error: message }, { status: envResp.status });
  }

  return NextResponse.json(
    {
      status: "created",
      env_id: envPayload.env_id,
      client_name: envPayload.client_name,
      schema_name: envPayload.schema_name,
    },
    { status: 201 }
  );
}
