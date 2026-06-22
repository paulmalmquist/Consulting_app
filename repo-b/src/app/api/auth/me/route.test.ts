import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const parseSessionFromRequest = vi.fn();
const loadRichMembershipsForUser = vi.fn();

vi.mock("@/lib/server/sessionAuth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/sessionAuth")>(
    "@/lib/server/sessionAuth",
  );
  return {
    ...actual,
    parseSessionFromRequest: (...args: unknown[]) => parseSessionFromRequest(...args),
  };
});

vi.mock("@/lib/server/platformMembershipRehydrate", () => ({
  loadRichMembershipByEnvId: vi.fn(),
  loadRichMembershipsForUser: (...args: unknown[]) => loadRichMembershipsForUser(...args),
}));

import { GET } from "@/app/api/auth/me/route";

describe("GET /api/auth/me telemetry reviewer", () => {
  beforeEach(() => {
    delete process.env.PLAYWRIGHT_BYPASS_AUTH;
    parseSessionFromRequest.mockReset();
    loadRichMembershipsForUser.mockReset();
  });

  it("returns the signed reviewer membership without database rehydration", async () => {
    parseSessionFromRequest.mockResolvedValue({
      platform_user_id: "telemetry-reviewer",
      email: "telemetry-reviewer@local",
      display_name: "Telemetry Reviewer",
      platform_admin: false,
      active_env_id: "reviewer-env",
      active_env_slug: "novendor",
      active_role: "telemetry_reviewer",
      memberships: [
        {
          env_id: "reviewer-env",
          env_slug: "novendor",
          role: "telemetry_reviewer",
          status: "active",
          is_default: true,
        },
      ],
    });

    const response = await GET(new NextRequest("http://localhost/api/auth/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      authenticated: true,
      session: {
        platformUserId: "telemetry-reviewer",
        platformAdmin: false,
        activeEnvironment: {
          env_id: "reviewer-env",
          client_name: "RS Telemetry",
          role: "telemetry_reviewer",
        },
      },
    });
    expect(loadRichMembershipsForUser).not.toHaveBeenCalled();
  });
});
