import { MERIDIAN_APEX_ENV_ID } from "@/lib/server/eccStore";

export function eccEnvId(request: Request): string {
  const url = new URL(request.url);
  return url.searchParams.get("env_id") || MERIDIAN_APEX_ENV_ID;
}

export function eccResponse(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export function eccError(message: string, status = 400) {
  return Response.json({ message }, { status });
}
