import { test, expect } from "@playwright/test";

const BIZ_ID = "biz_smoke_123";

const departments = [
  {
    department_id: "dept_ops",
    key: "operations",
    label: "Operations",
    icon: "settings",
    sort_order: 1,
    enabled: true,
  },
];

const capabilities = [
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
      await route.fulfill({ json: capabilities });
    }
  );

  // Documents views can request these.
  await page.route("**/api/documents?**", async (route) => {
    await route.fulfill({ json: [{ document_id: "doc_1", business_id: BIZ_ID, department_id: null, title: "Loan Package", virtual_path: null, status: "draft", created_at: "2024-01-01T00:00:00Z", latest_version_number: 1, latest_content_type: "application/pdf", latest_size_bytes: 1024 }] });
  });
  await page.route("**/api/documents/doc_1/versions", async (route) => {
    await route.fulfill({ json: [{ version_id: "ver_1", document_id: "doc_1", version_number: 1, state: "available", original_filename: "loan.pdf", mime_type: "application/pdf", size_bytes: 1024, content_hash: "x", created_at: "2024-01-01T00:00:00Z" }] });
  });
  await page.route("**/api/extract/init", async (route) => {
    await route.fulfill({ json: { id: "ext_1", document_id: "doc_1", document_version_id: "ver_1", doc_type: "loan_real_estate_v1", status: "pending", created_at: "2024-01-01T00:00:00Z" } });
  });
  await page.route("**/api/extract/run", async (route) => {
    await route.fulfill({ json: { extracted_document: { id: "ext_1", document_id: "doc_1", document_version_id: "ver_1", doc_type: "loan_real_estate_v1", status: "completed", created_at: "2024-01-01T00:00:00Z" }, latest_run: { status: "completed" }, fields: [{ id: "f1", extracted_document_id: "ext_1", field_key: "loan_terms.loan_amount", field_value_json: "500000", confidence: 0.9, evidence_json: { page: 1, snippet: "Loan Amount: 500000" }, created_at: "2024-01-01T00:00:00Z" }] } });
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

test("Documents page loads", async ({ page }) => {
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
});


test("Extract terms flow works", async ({ page }) => {
  await page.goto("/documents");
  await page.getByRole("button", { name: "Loan Package" }).click();
  await page.getByRole("button", { name: "Extract terms" }).click();
  await expect(page.getByText("Completed (1 fields)")).toBeVisible();
  await page.getByRole("button", { name: /loan_terms.loan_amount/ }).click();
  await expect(page.getByText(/Loan Amount: 500000/)).toBeVisible();
});
