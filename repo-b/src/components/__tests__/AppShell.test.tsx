import React from "react";
import { render, screen } from "@testing-library/react";

import AppShell from "@/components/AppShell";

const mockUseEnv = vi.fn();
const mockUsePathname = vi.fn();
const mockUseRouter = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/EnvProvider", () => ({
  useEnv: () => mockUseEnv(),
}));

vi.mock("@/components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/components/lab/LabIcons", () => ({
  ChevronsLeftIcon: () => <span data-testid="icon-left" />,
  ChevronsRightIcon: () => <span data-testid="icon-right" />,
  NavIcon: () => <span data-testid="nav-icon" />,
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/lab/metrics");
    mockUseRouter.mockReturnValue({ push: vi.fn() });
    mockUseEnv.mockReturnValue({
      environments: [
        {
          env_id: "env-123",
          client_name: "Alpha",
          industry: "real_estate",
          industry_type: "real_estate",
          schema_name: "env_alpha",
          is_active: true,
        },
      ],
      selectedEnv: {
        env_id: "env-123",
        client_name: "Alpha",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "env_alpha",
        is_active: true,
      },
      selectEnv: vi.fn(),
      isPlatformAdmin: false,
    });
  });

  test("home button routes to selected environment", () => {
    render(<AppShell><div>content</div></AppShell>);

    const home = screen.getByTestId("global-home-button");
    expect(home).toHaveAttribute("href", "/lab/env/env-123");
  });

  test("shows environment name in sidebar", () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.getAllByText("Alpha").length).toBeGreaterThanOrEqual(1);
  });

  test("shows System section for platform admins", () => {
    mockUseEnv.mockReturnValue({
      environments: [
        {
          env_id: "env-123",
          client_name: "Alpha",
          industry: "real_estate",
          industry_type: "real_estate",
          schema_name: "env_alpha",
          is_active: true,
        },
      ],
      selectedEnv: {
        env_id: "env-123",
        client_name: "Alpha",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "env_alpha",
        is_active: true,
      },
      selectEnv: vi.fn(),
      isPlatformAdmin: true,
    });

    render(<AppShell><div>content</div></AppShell>);

    expect(screen.getByTestId("system-nav-section")).toBeInTheDocument();
    expect(screen.getByText("Control Tower")).toBeInTheDocument();
    expect(screen.getByText("Access")).toBeInTheDocument();
    expect(screen.getByText("Audit")).toBeInTheDocument();
    expect(screen.getByText("AI Audit")).toBeInTheDocument();
  });

  test("hides System section for non-admin users", () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.queryByTestId("system-nav-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Control Tower")).not.toBeInTheDocument();
  });

  test("shows environment indicator instead of admin badge", () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.queryByText("Admin session")).not.toBeInTheDocument();
    expect(screen.getByText(/Alpha · real_estate/i)).toBeInTheDocument();
  });
});
