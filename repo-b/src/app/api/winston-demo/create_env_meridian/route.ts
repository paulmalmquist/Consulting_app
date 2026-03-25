import { NextRequest } from "next/server";

import {
  MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID,
} from "@/components/lab/environments/constants";

export const runtime = "nodejs";

const MERIDIAN_INSTITUTIONAL_DEMO_NAME = "Meridian Capital Management – Institutional Demo";

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const envId = MERIDIAN_INSTITUTIONAL_DEMO_ENV_ID;

  const ensureResponse = await fetch(`${origin}/bos/api/winston-demo/environments/${envId}/ensure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      selected_env: {
        env_id: envId,
        client_name: MERIDIAN_INSTITUTIONAL_DEMO_NAME,
        industry: "repe",
        industry_type: "repe",
        schema_name: "env_meridian_capital_management_institutional_demo",
      },
    }),
  });
  const ensurePayload = await parseJsonSafe(ensureResponse);
  if (!ensureResponse.ok) {
    return Response.json(
      {
        message: "Failed to ensure the Meridian institutional demo environment.",
        detail: ensurePayload,
      },
      { status: ensureResponse.status || 500 }
    );
  }

  const seedResponse = await fetch(`${origin}/bos/api/winston-demo/environments/${envId}/seed-meridian`, {
    method: "POST",
  });
  const seedPayload = await parseJsonSafe(seedResponse);
  if (!seedResponse.ok) {
    return Response.json(
      {
        message: "Failed to seed the Meridian institutional demo environment.",
        detail: seedPayload,
      },
      { status: seedResponse.status || 500 }
    );
  }

  return Response.json({
    env: {
      env_id: envId,
      client_name: MERIDIAN_INSTITUTIONAL_DEMO_NAME,
      industry: "repe",
      industry_type: "repe",
    },
    ensure: ensurePayload,
    seed: seedPayload,
  });
}
