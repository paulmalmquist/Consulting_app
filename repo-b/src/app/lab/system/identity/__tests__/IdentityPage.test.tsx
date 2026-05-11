import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { IdentityProviderCard } from "../IdentityProviderCard";
import type { IdentityProviderAdmin } from "@/lib/server/identityProviders";

const baseProvider: IdentityProviderAdmin = {
  identity_provider_id: "p-1",
  provider_name: "okta",
  kind: "okta",
  issuer: "https://test.okta.com",
  client_id_masked: "****abcd",
  audience: "okta-aud",
  discovery_url: "https://test.okta.com/.well-known/openid-configuration",
  jwks_uri: null,
  enabled: true,
  claim_mapping: { email: "email" },
  group_role_mapping: { "00gFinance": { app_role: "finance_admin" } },
  default_role: "viewer",
  last_health_check_at: "2026-05-10T12:00:00Z",
  last_health_status: "ok",
  last_health_detail: "discovery + jwks reachable (3 keys)",
};

describe("IdentityProviderCard", () => {
  it("renders provider details with masked client id and ok health pill", () => {
    render(<IdentityProviderCard provider={baseProvider} />);
    // Use the heading role to disambiguate "okta" (also appears inside the
    // claim-mapping JSON preview below).
    expect(screen.getByRole("heading", { name: /okta/i })).toBeInTheDocument();
    expect(screen.getByText("****abcd")).toBeInTheDocument();
    const pill = screen.getByTestId("health-pill-p-1");
    expect(pill).toHaveTextContent(/ok/i);
  });

  it("renders an amber pill when status is warn", () => {
    render(
      <IdentityProviderCard
        provider={{ ...baseProvider, last_health_status: "warn" }}
      />,
    );
    expect(screen.getByTestId("health-pill-p-1")).toHaveTextContent(/warn/i);
  });

  it("renders a red pill when status is error", () => {
    render(
      <IdentityProviderCard
        provider={{ ...baseProvider, last_health_status: "error" }}
      />,
    );
    expect(screen.getByTestId("health-pill-p-1")).toHaveTextContent(/error/i);
  });

  it("calls /api/auth/oidc/test when the test button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ provider_id: "p-1", status: "ok", detail: "fresh" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IdentityProviderCard provider={baseProvider} />);

    fireEvent.click(screen.getByText(/test provider config/i));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/oidc/test",
        expect.objectContaining({ method: "POST" }),
      );
    });
    vi.unstubAllGlobals();
  });

  it("surfaces an error message when the test endpoint fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "discovery fetch failed: 503" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<IdentityProviderCard provider={baseProvider} />);

    fireEvent.click(screen.getByText(/test provider config/i));
    await waitFor(() => {
      expect(screen.getByText(/discovery fetch failed: 503/i)).toBeInTheDocument();
    });
    vi.unstubAllGlobals();
  });
});
