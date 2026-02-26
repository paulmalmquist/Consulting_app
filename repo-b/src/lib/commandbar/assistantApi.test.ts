import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssistantApiError,
  checkCodexHealth,
  createPlan,
  fetchContextSnapshot,
} from "@/lib/commandbar/assistantApi";
import { ContractValidationError } from "@/lib/commandbar/schemas";

describe("assistantApi contract behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws 401 for unauthenticated context snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "Authentication required" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(fetchContextSnapshot({ route: "/lab/environments" })).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws validation error when /plan payload is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/mcp/plan")) {
          return new Response(JSON.stringify({ plan_id: "plan_bad" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            route: "/lab/environments",
            environments: [],
            selectedEnv: null,
            business: null,
            modulesAvailable: ["environments"],
            recentRuns: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await expect(
      createPlan({
        message: "list environments",
        context: { route: "/lab/environments" },
        contextSnapshot: {
          route: "/lab/environments",
          environments: [],
          selectedEnv: null,
          business: null,
          modulesAvailable: ["environments"],
          recentRuns: [],
        },
      })
    ).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("reports 403 from codex health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "disabled" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    await expect(checkCodexHealth()).rejects.toMatchObject({
      status: 403,
    });
  });

  it("surfaces network timeout-style failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network timeout");
      })
    );

    await expect(checkCodexHealth()).rejects.toBeInstanceOf(AssistantApiError);
  });
});
