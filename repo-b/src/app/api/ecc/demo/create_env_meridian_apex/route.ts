import {
  createOrResetMeridianDemo,
  getDemoStatus,
  getMeridianEnvironmentRecord,
  MERIDIAN_APEX_ENV_ID,
} from "@/lib/server/eccStore";

export const runtime = "nodejs";

export async function POST() {
  createOrResetMeridianDemo(MERIDIAN_APEX_ENV_ID);
  return Response.json({
    env: getMeridianEnvironmentRecord(MERIDIAN_APEX_ENV_ID),
    status: getDemoStatus(MERIDIAN_APEX_ENV_ID),
  });
}
