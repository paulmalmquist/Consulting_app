import { NextRequest, NextResponse } from "next/server";
import { hasSession, unauthorizedJson } from "@/lib/server/sessionAuth";
import { buildPlatformSessionHeaders } from "@/lib/server/platformForwardHeaders";

export const runtime = "nodejs";

const FASTAPI_BASE = (
  process.env.BOS_API_ORIGIN ||
  "http://localhost:8000"
).replace(/\/$/, "");

export async function GET(req: NextRequest) {
  if (!(await hasSession(req))) {
    return unauthorizedJson();
  }

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/ai/gateway/winston-readiness`, {
      headers: await buildPlatformSessionHeaders(req),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        enabled: false,
        schema_version_marker: null,
        required_columns: [],
        required_indexes: [],
        missing_columns: [],
        missing_indexes: [],
        supported_launch_surface_ids: [],
        allowed_thread_kinds: [],
        allowed_scope_types: [],
        issues: ["Backend unreachable"],
      },
      { status: 502 },
    );
  }
}
