import { bmApiClient } from "./apiClient";
import { BMUserProfile } from "./types";
import { clearAccessToken, getAccessToken, setAccessToken } from "./storage";

type SessionInitResponse = {
  mode: string;
  requires_api_key: boolean;
  auth_url?: string | null;
};

type SessionCompleteResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export async function initSession(): Promise<SessionInitResponse> {
  return bmApiClient.post<SessionInitResponse>("/v1/excel/session/init", {}, 0, true);
}

export async function completeSession(apiKey: string): Promise<SessionCompleteResponse> {
  const response = await bmApiClient.post<SessionCompleteResponse>(
    "/v1/excel/session/complete",
    {
      api_key: apiKey,
    },
    0,
    true
  );
  await setAccessToken(response.access_token);
  return response;
}

export async function getCurrentProfile(): Promise<BMUserProfile | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await bmApiClient.get<BMUserProfile>("/v1/excel/me", 0, true);
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await clearAccessToken();
}
