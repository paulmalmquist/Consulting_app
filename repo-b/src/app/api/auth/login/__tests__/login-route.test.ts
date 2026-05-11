import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../route";

beforeEach(() => {
  process.env.ADMIN_INVITE_CODE = "let-me-in";
  process.env.ENV_INVITE_CODE = "env-please";
});

afterEach(() => {
  delete process.env.ADMIN_INVITE_CODE;
  delete process.env.ENV_INVITE_CODE;
});

function jsonRequest(body: unknown): Request {
  return new Request("https://app.example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getCookie(response: Response, name: string): string | null {
  // Response.cookies isn't on the standard Response, so we read Set-Cookie.
  const header = response.headers.get("set-cookie");
  if (!header) return null;
  const parts = header.split(/,\s*(?=[^;]+=[^;]+)/g);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1).split(";")[0];
    }
  }
  return null;
}

describe("POST /api/auth/login (invite-code fallback)", () => {
  it("issues bos_session for admin invite-code login", async () => {
    const response = await POST(
      jsonRequest({ loginType: "admin", inviteCode: "let-me-in" }),
    );
    expect(response.status).toBe(200);
    const cookie = getCookie(response, "bos_session");
    expect(cookie).toBeTruthy();
    expect(decodeURIComponent(cookie || "")).toContain("\"role\":\"admin\"");
  });

  it("rejects the admin login when the code is wrong", async () => {
    const response = await POST(
      jsonRequest({ loginType: "admin", inviteCode: "nope" }),
    );
    expect(response.status).toBe(401);
  });

  it("issues bos_session for environment invite-code login", async () => {
    const response = await POST(
      jsonRequest({
        loginType: "environment",
        inviteCode: "env-please",
        envId: "env-trading",
      }),
    );
    expect(response.status).toBe(200);
    const cookie = getCookie(response, "bos_session");
    expect(cookie).toBeTruthy();
    expect(decodeURIComponent(cookie || "")).toContain("env-trading");
  });
});
