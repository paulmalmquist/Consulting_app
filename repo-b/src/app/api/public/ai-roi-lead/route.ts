import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOURCE_RE = /^[a-z0-9_-]{3,80}$/;

type AiRoiLeadPayload = {
  email?: unknown;
  company_name?: unknown;
  source?: unknown;
  payload_json?: unknown;
};

function hashIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  if (!first) return null;
  return createHash("sha256").update(first).digest("hex");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AiRoiLeadPayload;
  const email = String(body.email || "").trim().toLowerCase();
  const companyName = String(body.company_name || "").trim() || null;
  const source = String(body.source || "ai_roi").trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ status: "error", reason: "Valid email is required." }, { status: 400 });
  }
  if (!SOURCE_RE.test(source)) {
    return NextResponse.json({ status: "error", reason: "Source is invalid." }, { status: 400 });
  }

  const pool = getPool();
  if (!pool) {
    return NextResponse.json(
      { status: "error", reason: "Database pool is not configured." },
      { status: 503 },
    );
  }

  const userAgent = request.headers.get("user-agent");
  const ipHash = hashIp(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"));
  const payloadJson = body.payload_json == null ? null : body.payload_json;

  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO nv_ai_roi_leads
         (email, company_name, source, payload_json, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id::text`,
      [
        email,
        companyName,
        source,
        payloadJson === null ? null : JSON.stringify(payloadJson),
        userAgent,
        ipHash,
      ],
    );

    const id = result.rows[0]?.id;
    if (!id) {
      return NextResponse.json(
        { status: "error", reason: "Lead was not created." },
        { status: 500 },
      );
    }

    return NextResponse.json({ status: "created", id }, { status: 201 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ status: "error", reason }, { status: 500 });
  }
}

