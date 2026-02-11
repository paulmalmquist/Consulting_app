import { expect, test } from "@playwright/test";

const BIZ_ID = "biz_accounting_e2e";

const departments = [
  {
    department_id: "dept_accounting",
    key: "accounting",
    label: "Accounting",
    icon: "calculator",
    sort_order: 1,
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
  {
    capability_id: "cap_ap",
    department_id: "dept_accounting",
    department_key: "accounting",
    key: "accounts-payable",
    label: "Accounts Payable",
    kind: "data_grid",
    sort_order: 3,
    metadata_json: {},
    enabled: true,
  },
  {
    capability_id: "cap_vm",
    department_id: "dept_accounting",
    department_key: "accounting",
    key: "vendor-management",
    label: "Vendor Management",
    kind: "data_grid",
    sort_order: 4,
    metadata_json: {},
    enabled: true,
  },
];

test.beforeEach(async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
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

  await page.addInitScript(
    ([bizId]) => {
      localStorage.setItem("bos_business_id", bizId);
      localStorage.removeItem(`bos_accounting_data_v1:${bizId}`);
    },
    [BIZ_ID]
  );

  await page.route("**/api/departments", async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route("**/api/templates", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route(`**/api/businesses/${BIZ_ID}/departments`, async (route) => {
    await route.fulfill({ json: departments });
  });
  await page.route(`**/api/businesses/${BIZ_ID}/departments/accounting/capabilities`, async (route) => {
    await route.fulfill({ json: accountingCapabilities });
  });
  await page.route("**/api/documents?**", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/executions?**", async (route) => {
    await route.fulfill({ json: [] });
  });
});

test("vendor master + AP workflow works", async ({ page }) => {
  await page.goto("/app/accounting/capability/vendor-management");

  await expect(page.getByTestId("vendor-table")).toBeVisible();
  await expect(page.locator('[data-testid^="vendor-row-"]')).toHaveCount(12);
  await expect(page.getByRole("cell", { name: "Harbor Legal", exact: true })).toBeVisible();

  await page.getByTestId("add-vendor-button").click();
  await expect(page.getByTestId("vendor-modal")).toBeVisible();
  await page.getByPlaceholder("Vendor name").fill("Bluewater Courier");
  await page.getByPlaceholder("Legal name").fill("Bluewater Courier LLC");
  await page.getByPlaceholder("Tax ID (EIN)").fill("92-4456710");
  await page.getByPlaceholder("Email").fill("billing@bluewatercourier.com");
  await page.getByPlaceholder("Phone").fill("(312) 555-0144");
  await page.getByPlaceholder("Street").fill("2100 N Ashland Ave");
  await page.getByPlaceholder("City").fill("Chicago");
  await page.getByPlaceholder("State").fill("IL");
  await page.getByPlaceholder("Zip").fill("60614");
  await page.getByPlaceholder("Country").fill("USA");
  await page.getByPlaceholder("Default expense account").fill("6320 - Courier Services");
  await page.getByTestId("vendor-submit-button").click();

  await expect(page.getByRole("cell", { name: "Bluewater Courier", exact: true })).toBeVisible();

  await page.goto("/app/accounting/capability/accounts-payable");
  await expect(page.getByTestId("bill-table")).toBeVisible();
  await expect(page.locator('[data-testid^="bill-row-"]')).toHaveCount(12);

  const draftRow = page
    .locator('[data-testid^="bill-row-"]')
    .filter({ has: page.getByRole("button", { name: "Approve" }) })
    .first();

  await expect(draftRow).toBeVisible();
  const rowTestId = await draftRow.getAttribute("data-testid");
  expect(rowTestId).toBeTruthy();
  const billId = rowTestId!.replace("bill-row-", "");
  await draftRow.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByTestId(`bill-status-${billId}`)).toHaveText("approved");
});
