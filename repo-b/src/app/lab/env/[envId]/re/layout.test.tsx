import React from "react";
import { render, screen } from "@testing-library/react";
import ReLayout from "@/app/lab/env/[envId]/re/layout";

// ReEnvProvider and RepeWorkspaceShell are observable through their wrapper
// markup. Replace them with simple identifiable shells so the test asserts
// which path the layout took, not what those components do internally.
vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  ReEnvProvider: ({ envId, children }: { envId: string; children: React.ReactNode }) => (
    <div data-testid="re-env-provider" data-env-id={envId}>{children}</div>
  ),
}));

vi.mock("@/components/repe/workspace/RepeWorkspaceShell", () => ({
  __esModule: true,
  default: ({ envId, children }: { envId?: string; children: React.ReactNode }) => (
    <div data-testid="repe-workspace-shell" data-env-id={envId}>{children}</div>
  ),
}));

const ENV_ID = "a1b2c3d4-0001-0001-0003-000000000001";

async function renderLayout() {
  const element = await ReLayout({
    children: <div data-testid="page-children">child</div>,
    params: Promise.resolve({ envId: ENV_ID }),
  });
  return render(element as React.ReactElement);
}

describe("REPE workspace layout — auth bypass guardrails", () => {
  const originalBypass = process.env.PLAYWRIGHT_BYPASS_AUTH;

  afterEach(() => {
    if (originalBypass === undefined) {
      delete process.env.PLAYWRIGHT_BYPASS_AUTH;
    } else {
      process.env.PLAYWRIGHT_BYPASS_AUTH = originalBypass;
    }
  });

  it("mounts ReEnvProvider + RepeWorkspaceShell when PLAYWRIGHT_BYPASS_AUTH is unset", async () => {
    delete process.env.PLAYWRIGHT_BYPASS_AUTH;
    await renderLayout();

    expect(screen.getByTestId("re-env-provider")).toBeTruthy();
    expect(screen.getByTestId("repe-workspace-shell")).toBeTruthy();
    expect(screen.getByTestId("page-children")).toBeTruthy();
  });

  it("mounts the canonical shell when PLAYWRIGHT_BYPASS_AUTH is any value other than '1'", async () => {
    for (const value of ["0", "true", "false", "yes", "playwright"]) {
      process.env.PLAYWRIGHT_BYPASS_AUTH = value;
      const { unmount } = await renderLayout();

      expect(
        screen.getByTestId("re-env-provider"),
        `value="${value}" must still mount ReEnvProvider`,
      ).toBeTruthy();
      expect(
        screen.getByTestId("repe-workspace-shell"),
        `value="${value}" must still mount RepeWorkspaceShell`,
      ).toBeTruthy();

      unmount();
    }
  });

  it("skips ReEnvProvider + RepeWorkspaceShell only when PLAYWRIGHT_BYPASS_AUTH === '1'", async () => {
    process.env.PLAYWRIGHT_BYPASS_AUTH = "1";
    await renderLayout();

    expect(screen.queryByTestId("re-env-provider")).toBeNull();
    expect(screen.queryByTestId("repe-workspace-shell")).toBeNull();
    expect(screen.getByTestId("page-children")).toBeTruthy();
  });
});
