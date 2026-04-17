import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const usePathnameMock = vi.fn<() => string>();
const routerPushMock = vi.fn();
const switchPlatformEnvironmentMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => ({ push: routerPushMock }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/lib/platformSessionClient", () => ({
  switchPlatformEnvironment: (...args: unknown[]) => switchPlatformEnvironmentMock(...args),
}));

import WorkspaceSwitcher from "./WorkspaceSwitcher";
import type { Environment } from "@/components/EnvProvider";

function makeEnv(partial: Partial<Environment> & Pick<Environment, "env_id" | "client_name">): Environment {
  return {
    slug: null,
    industry: "consulting",
    industry_type: "consulting",
    workspace_template_key: null,
    schema_name: "demo",
    is_active: true,
    ...partial,
  };
}

const meridian = makeEnv({ env_id: "env-meridian", slug: "meridian", client_name: "Meridian Capital Management", industry: "repe", industry_type: "repe" });
const novendor = makeEnv({ env_id: "env-novendor", slug: "novendor", client_name: "Novendor", industry: "consulting", industry_type: "consulting" });
const trading = makeEnv({ env_id: "env-trading", slug: "trading", client_name: "Trading Platform", industry: "trading_platform", industry_type: "trading_platform" });

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    routerPushMock.mockReset();
    switchPlatformEnvironmentMock.mockReset();
  });

  test("non-admin with single env: renders Back-to-Winston link only, no switcher button", () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/re");
    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[]} />);
    expect(screen.getByTestId("workspace-exit")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
  });

  test("renders switcher button and current env when other envs exist", () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/re");
    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[novendor, trading]} />);
    expect(screen.getByTestId("workspace-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-switcher-current").textContent).toContain(
      "Meridian Capital Management",
    );
  });

  test("opening the menu lists every other env", () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/re");
    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[novendor, trading]} />);
    fireEvent.click(screen.getByRole("button", { name: /switch environment/i }));
    expect(screen.getByTestId("workspace-switcher-menu")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-switcher-item-env-novendor")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-switcher-item-env-trading")).toBeInTheDocument();
  });

  test("menu item for cross-module switch is marked preserves-module=false and points at landing", () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/re/funds/fund-123");
    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[novendor]} />);
    fireEvent.click(screen.getByRole("button", { name: /switch environment/i }));
    const item = screen.getByTestId("workspace-switcher-item-env-novendor");
    expect(item).toHaveAttribute("data-preserves-module", "false");
    expect(item).toHaveAttribute("data-target-path", "/lab/env/env-novendor/consulting");
  });

  test("menu item for shared-module switch is marked preserves-module=true and strips deep path", () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/documents/doc-abc");
    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[novendor]} />);
    fireEvent.click(screen.getByRole("button", { name: /switch environment/i }));
    const item = screen.getByTestId("workspace-switcher-item-env-novendor");
    expect(item).toHaveAttribute("data-preserves-module", "true");
    expect(item).toHaveAttribute("data-target-path", "/lab/env/env-novendor/documents");
  });

  test("clicking a menu item calls switchPlatformEnvironment then pushes the resolved target", async () => {
    usePathnameMock.mockReturnValue("/lab/env/env-meridian/re/funds/fund-123");
    switchPlatformEnvironmentMock.mockResolvedValue(undefined);

    render(<WorkspaceSwitcher currentEnv={meridian} otherEnvs={[trading]} />);
    fireEvent.click(screen.getByRole("button", { name: /switch environment/i }));
    fireEvent.click(screen.getByTestId("workspace-switcher-item-env-trading"));

    await waitFor(() => {
      expect(switchPlatformEnvironmentMock).toHaveBeenCalledWith({
        environmentSlug: "trading",
        envId: undefined,
      });
    });
    // Trading primary module is "markets", current module is "re" → landing fallback
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/lab/env/env-trading/markets");
    });
  });
});
