import React from "react";
import { render, screen } from "@testing-library/react";

import AppShell from "@/components/AppShell";

const mockUseEnv = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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

describe("AppShell home button", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/lab/metrics");
    mockUseEnv.mockReturnValue({
      selectedEnv: {
        env_id: "env-123",
        client_name: "Alpha",
        industry: "real_estate",
        industry_type: "real_estate",
        schema_name: "env_alpha",
        is_active: true,
      },
    });
  });

  test("routes home to admin for admin sessions", () => {
    render(<AppShell isAdmin><div>content</div></AppShell>);

    const home = screen.getByTestId("global-home-button");
    expect(home).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Admin session")).toBeInTheDocument();
  });

  test("routes home to selected environment for non-admin sessions", () => {
    render(<AppShell><div>content</div></AppShell>);

    const home = screen.getByTestId("global-home-button");
    expect(home).toHaveAttribute("href", "/lab/env/env-123");
    expect(screen.getByText(/Alpha · real_estate/i)).toBeInTheDocument();
  });
});
