import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WinstonLoginPortal } from "@/components/auth/WinstonLoginPortal";

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase-client", () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

describe("WinstonLoginPortal telemetry reviewer access", () => {
  beforeEach(() => {
    routerPush.mockReset();
    routerRefresh.mockReset();
    vi.restoreAllMocks();
  });

  it("accepts a non-email reviewer username and uses the scoped login endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          redirectTo: "/lab/env/reviewer-env/telemetry",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const user = userEvent.setup();

    render(<WinstonLoginPortal />);

    const identifier = screen.getByLabelText("Email or reviewer username");
    expect(identifier).toHaveAttribute("type", "text");
    await user.type(identifier, "telemetry");
    await user.type(screen.getByLabelText("Password"), "reviewer-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/telemetry-login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            username: "telemetry",
            password: "reviewer-password",
          }),
        }),
      );
    });
    expect(routerPush).toHaveBeenCalledWith("/lab/env/reviewer-env/telemetry");
    expect(routerRefresh).toHaveBeenCalled();
  });
});
