import React from "react";
import { render, screen, within } from "@testing-library/react";
import { usePathname } from "next/navigation";
import PdsEnterpriseShell from "@/components/pds-enterprise/PdsEnterpriseShell";

const mockUseDomainEnv = vi.fn();
const mockUsePathname = vi.mocked(usePathname);

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: () => mockUseDomainEnv(),
}));

vi.mock("@/components/ThemeToggle", () => ({
  default: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/lib/workspaceTemplates", () => ({
  resolveWorkspaceTemplateKey: () => "pds_enterprise",
}));

describe("PdsEnterpriseShell", () => {
  beforeEach(() => {
    mockUseDomainEnv.mockReturnValue({
      envId: "env-stonepds",
      environment: {
        client_name: "StonePDS",
        schema_name: "env_stonepds",
        workspace_template_key: "pds_enterprise",
        industry: "professional_services",
        industry_type: "professional_services",
      },
      businessId: "6b3d1234-5678-4f9b-9000-123456789abc",
      loading: false,
      error: null,
      requestId: null,
      retry: vi.fn(),
    });
  });

  it("highlights only the active child route and leaves Home inactive", () => {
    mockUsePathname.mockReturnValue("/lab/env/env-stonepds/pds/markets");

    const { container } = render(
      <PdsEnterpriseShell envId="env-stonepds">
        <div>workspace</div>
      </PdsEnterpriseShell>
    );

    const sidebar = within(screen.getByTestId("pds-sidebar"));

    expect(sidebar.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current", "page");
    expect(sidebar.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
  });

  it("shows the renamed command items and the special tools entry", () => {
    mockUsePathname.mockReturnValue("/lab/env/env-stonepds/pds");

    render(
      <PdsEnterpriseShell envId="env-stonepds">
        <div>workspace</div>
      </PdsEnterpriseShell>
    );

    const sidebar = within(screen.getByTestId("pds-sidebar"));

    expect(sidebar.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(sidebar.getByRole("link", { name: "Exec Briefing" })).toBeInTheDocument();
    expect(sidebar.getByText("Special Tools")).toBeInTheDocument();
    expect(sidebar.getByRole("link", { name: "Custom Query" })).toBeInTheDocument();
    expect(screen.queryByText("AI Briefing")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Query")).not.toBeInTheDocument();
  });
});
