import { NextResponse } from "next/server";
import type { PublicLeadCreateRequest } from "@/lib/public-assistant/types";
import { createPublicLead } from "@/lib/server/publicBoundaryStore";

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

  const created = createPublicLead({
    company_name,
    email,
    industry: industry || undefined,
    team_size: team_size || undefined,
    source,
  });

  return NextResponse.json(created, { status: 201 });
}
