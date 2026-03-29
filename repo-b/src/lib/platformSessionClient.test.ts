import {
  applyEnvironmentClientState,
  clearLegacyEnvironmentClientState,
  logoutPlatformSession,
  switchPlatformEnvironment,
} from "@/lib/platformSessionClient";

const mockAssign = vi.fn();

describe("platformSessionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = "demo_lab_env_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie = "bm_env_slug=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    vi.stubGlobal("location", { ...window.location, assign: mockAssign });
  });

  it("clears legacy environment state from storage and cookies", () => {
    localStorage.setItem("demo_lab_env_id", "env-1");
    localStorage.setItem("bos_business_id", "biz-1");
    localStorage.setItem("bm_env_business_map", JSON.stringify({ "env-1": "biz-1" }));
    document.cookie = "demo_lab_env_id=env-1; path=/";
    document.cookie = "bm_env_slug=novendor; path=/";

    clearLegacyEnvironmentClientState();

    expect(localStorage.getItem("demo_lab_env_id")).toBeNull();
    expect(localStorage.getItem("bos_business_id")).toBeNull();
    expect(localStorage.getItem("bm_env_business_map")).toBeNull();
    expect(document.cookie).not.toContain("demo_lab_env_id=");
    expect(document.cookie).not.toContain("bm_env_slug=");
  });

  it("applies explicit environment state without relying on fuzzy inference", () => {
    applyEnvironmentClientState({
      env_id: "env-trading",
      env_slug: "trading",
      business_id: "biz-trading",
    });

    expect(localStorage.getItem("demo_lab_env_id")).toBe("env-trading");
    expect(localStorage.getItem("bos_business_id")).toBe("biz-trading");
    expect(document.cookie).toContain("demo_lab_env_id=env-trading");
    expect(document.cookie).toContain("bm_env_slug=trading");
  });

  it("clears stale environment state during logout before redirecting", async () => {
    localStorage.setItem("demo_lab_env_id", "env-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ redirectTo: "/novendor/login" }),
    }));

    await logoutPlatformSession();

    expect(localStorage.getItem("demo_lab_env_id")).toBeNull();
    expect(mockAssign).toHaveBeenCalledWith("/novendor/login");
  });

  it("switches the active environment and redirects to the target home", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        redirectTo: "/lab/env/env-trading/markets",
        activeEnvironment: {
          env_id: "env-trading",
          env_slug: "trading",
          business_id: "biz-trading",
        },
      }),
    }));

    await switchPlatformEnvironment({ environmentSlug: "trading" });

    expect(localStorage.getItem("demo_lab_env_id")).toBe("env-trading");
    expect(localStorage.getItem("bos_business_id")).toBe("biz-trading");
    expect(mockAssign).toHaveBeenCalledWith("/lab/env/env-trading/markets");
  });
});
