import React from "react";
import { render, screen } from "@testing-library/react";
import RepeFundsPage from "@/app/app/repe/funds/page";
import { ToastProvider } from "@/components/ui/Toast";

const mockUseRepeContext = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/repe-context", () => ({
  useRepeContext: (...args: unknown[]) => mockUseRepeContext(...args),
  useRepeBasePath: () => "/lab/env/test-env/re",
}));

// Auto-mock all bos-api exports — each returns a no-op resolved promise
vi.mock("@/lib/bos-api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mocked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    mocked[key] = typeof value === "function" ? vi.fn().mockResolvedValue(null) : value;
  }
  return mocked;
});

describe("REPE funds page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRepeContext.mockReturnValue({
      businessId: null,
      environmentId: null,
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });
  });

  test("shows initialize workspace CTA when context missing", () => {
    render(<ToastProvider><RepeFundsPage /></ToastProvider>);
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  test("renders without crashing when context is available", () => {
    mockUseRepeContext.mockReturnValue({
      businessId: "test-biz",
      environmentId: "test-env",
      loading: false,
      contextError: null,
      initializeWorkspace: vi.fn(),
    });

    const { container } = render(<ToastProvider><RepeFundsPage /></ToastProvider>);
    expect(container).toBeTruthy();
  });
});
