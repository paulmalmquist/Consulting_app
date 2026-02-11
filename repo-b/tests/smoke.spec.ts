import { test, expect } from "@playwright/test";

const BIZ_ID = "biz_smoke_123";

const departments = [
  {
    department_id: "dept_accounting",
    key: "accounting",
    label: "Accounting",
    icon: "calculator",
    sort_order: 1,
    enabled: true,
  },
  {
    department_id: "dept_ops",
    key: "operations",
    label: "Operations",
    icon: "settings",
    sort_order: 2,
    enabled: true,
  },
];

const accountingCapabilities = [
  {
    capability_id: "cap_gl",
    department_id: "dept_accounting",
    department_key: "accounting",
    key: "general-ledger",
    label: "General Ledger",
    kind: "data_grid",
    sort_order: 1,
    metadata_json: {},
    enabled: true,
  },
  {
    capability_id: "cap_je",
    department_id: "dept_accounting",
    department_key: "accounting",
    key: "journal-entries",
    label: "Journal Entries",
    kind: "data_grid",
    sort_order: 2,
    metadata_json: {},
    enabled: true,
  },
];

const operationsCapabilities = [
  {
    capability_id: "cap_1",
    department_id: "dept_ops",
    department_key: "operations",
    key: "runbook",
    label: "Runbook",
    kind: "action",
    sort_order: 1,
    metadata_json: { inputs: [{ name: "prompt", type: "textarea", label: "Prompt" }] },
    enabled: true,
  },
];

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");

  // Bypass auth middleware for protected pages.
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: "demo_lab_session",
      value: "active",
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  // Seed businessId so /app and /documents render the shell and try loading data.
  await page.addInitScript(
    ([bizId]) => {
      localStorage.setItem("bos_business_id", bizId);
    },
    [BIZ_ID]
  );

  // Stub Business OS API calls from the browser.
  await page.route("**/api/departments", async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route("**/api/templates", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(`**/api/businesses/${BIZ_ID}/departments`, async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route(
    `**/api/businesses/${BIZ_ID}/departments/**/capabilities`,
    async (route) => {
      const url = route.request().url();
      const payload = url.includes("/departments/accounting/")
        ? accountingCapabilities
        : operationsCapabilities;
      await route.fulfill({ json: payload });
    }
  );

  // Documents views can request these.
  await page.route("**/api/documents?**", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/executions?**", async (route) => {
    await route.fulfill({ json: [] });
  });
});

test("Marketing home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Business OS" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
});

test("Onboarding loads", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Business OS Setup" })).toBeVisible();
});

test("App shell loads", async ({ page }) => {
  await page.goto("/app");
  // The shell should render (top bar + mobile hamburger).
  await expect(page.getByRole("banner")).toBeVisible();
  const hamburger = page.getByLabel("Open sidebar");
  const brand = page.getByRole("banner").getByRole("link", { name: "Business OS" });
  if (await hamburger.isVisible()) {
    await expect(hamburger).toBeVisible();
  } else {
    await expect(brand).toBeVisible();
  }
});

test("Accounting page loads without crash", async ({ page }) => {
  await page.goto("/app/accounting");
  await expect(page.getByRole("heading", { name: "Accounting" })).toBeVisible();
  await expect(page.getByText("Financial Overview")).toBeVisible();
});

test("Documents page loads", async ({ page }) => {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
});
