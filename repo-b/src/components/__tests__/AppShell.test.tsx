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

describe("AppShell", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/lab/metrics");
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

  test("home button routes to /app", () => {
    render(<AppShell><div>content</div></AppShell>);

    const home = screen.getByTestId("global-home-button");
    expect(home).toHaveAttribute("href", "/app");
  });

  test("renders children", () => {
    render(<AppShell><div>test content</div></AppShell>);

    expect(screen.getByText("test content")).toBeInTheDocument();
  });

  test("renders account menu button", () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.getByRole("button", { name: /account menu/i })).toBeInTheDocument();
  });

  test("hides the global utility header on immersive trading routes", () => {
    mockUsePathname.mockReturnValue("/lab/env/env-123/markets");

    render(<AppShell><div>content</div></AppShell>);

    expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("global-home-button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
  });

  test("no sidebar is rendered", () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.queryByTestId("lab-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lab-sidebar-toggle")).not.toBeInTheDocument();
  });
});
