import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DeploymentReceiptCard from "./DeploymentReceiptCard";
import { apiFetch } from "@/lib/api";

// Mock the api module — /version is the only network call this card makes.
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("DeploymentReceiptCard", () => {
  it("renders the backend git SHA from /version", async () => {
    apiFetchMock.mockResolvedValue({ git_sha: "787103d9abcdef0123456789" });

    render(<DeploymentReceiptCard />);

    await waitFor(() => expect(screen.getByText("787103d9abcd")).toBeInTheDocument());
    expect(apiFetchMock).toHaveBeenCalledWith("/api/version");
  });

  it("renders the CI gate descriptors regardless of backend state", async () => {
    apiFetchMock.mockResolvedValue({ git_sha: "abc123def456" });

    render(<DeploymentReceiptCard />);

    // Let the /version fetch settle so the state update is flushed inside act().
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    // CI descriptor is static and always present.
    expect(screen.getByText("Frontend Typecheck")).toBeInTheDocument();
    expect(screen.getByText("Mass-deletion gate")).toBeInTheDocument();
    expect(screen.getByText(/description of the gates, not a live/i)).toBeInTheDocument();
  });

  it("fails closed to the backend ErrorState while the CI descriptor still renders", async () => {
    apiFetchMock.mockRejectedValue(new Error("Network error (req: x)"));

    render(<DeploymentReceiptCard />);

    // Backend panel fails closed.
    await waitFor(() => expect(screen.getByText(/could not load:/i)).toBeInTheDocument());

    // CI descriptor still renders — it is not gated on the backend fetch.
    expect(screen.getByText("Backend pytest")).toBeInTheDocument();
    // Frontend SHA panel renders too (unset locally).
    expect(screen.getByText("local / unset")).toBeInTheDocument();
  });
});
