import LegacyResumeDashboardPage from "@/app/lab/env/[envId]/resume/dashboard/page";

const mockRedirect = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe("Legacy resume dashboard redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects stale dashboard path to the canonical resume workspace", async () => {
    await LegacyResumeDashboardPage({
      params: Promise.resolve({ envId: "env-resume" }),
    });

    expect(mockRedirect).toHaveBeenCalledWith("/lab/env/env-resume/resume");
  });
});
