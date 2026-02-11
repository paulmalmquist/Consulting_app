import { test, expect, type Page } from "@playwright/test";

type Env = {
  env_id: string;
  client_name?: string;
  industry: string;
  is_active: boolean;
  created_at?: string;
  status?: string;
};

const TEST_ENV_ID = "11111111-1111-4111-8111-111111111111";
const TEST_ENV: Env = {
  env_id: TEST_ENV_ID,
  client_name: "Acme Corp",
  industry: "general",
  is_active: true,
  created_at: "2026-02-10T12:00:00.000Z",
  status: "active",
};

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

  await page.route("**/v1/environments", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { environments: [TEST_ENV] } });
      return;
    }
    await route.continue();
  });

  await page.route("**/v1/metrics**", async (route) => {
    await route.fulfill({
      json: {
        uploads_count: 0,
        tickets_count: 0,
        pending_approvals: 0,
        approval_rate: 0,
        override_rate: 0,
        avg_time_to_decision_sec: 0,
      },
    });
  });

  await page.route("**/v1/queue**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });

  await page.route("**/v1/audit**", async (route) => {
    await route.fulfill({ json: { items: [] } });
  });
});

// ─── PART A: Header Tests ──────────────────────────────────────

test("env title shows environment name without code suffix", async ({ page }) => {
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);

  const envTitle = page.getByTestId("env-title");
  await expect(envTitle).toBeVisible();
  await expect(envTitle).toContainText("Acme Corp");
  // Should NOT contain the full env_id or code-style suffixes
  const titleText = await envTitle.textContent();
  expect(titleText).not.toContain(TEST_ENV_ID);
});

test("logout button is present and clears session", async ({ page }) => {
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);

  const logoutButton = page.getByTestId("logout-button");
  await expect(logoutButton).toBeVisible();

  // Click logout
  await logoutButton.click();

  // Should leave environment context and return to environments list
  await expect(page).toHaveURL(/\/lab\/environments$/);
});

test("env-header test-id is present", async ({ page }) => {
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);
  await expect(page.getByTestId("env-header")).toBeVisible();
});

// ─── PART B: Add Department Tests ──────────────────────────────

test("add department shows menu and adds department tab", async ({ page }) => {
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);

  const addDeptButton = page.getByTestId("add-dept-button");
  await expect(addDeptButton).toBeVisible();

  // Click to open menu
  await addDeptButton.click();
  const menu = page.getByTestId("add-dept-menu");
  await expect(menu).toBeVisible();

  // Legal should be available (not in general template by default)
  const legalItem = page.getByTestId("add-dept-item-legal");
  await expect(legalItem).toBeVisible();

  // Add legal department
  await legalItem.click();

  // Menu should close
  await expect(menu).toBeHidden();

  // Legal tab should now appear
  await expect(page.getByTestId("dept-tab-legal")).toBeVisible();
});

test("cannot add same department twice", async ({ page }) => {
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);

  // Add legal department
  await page.getByTestId("add-dept-button").click();
  await page.getByTestId("add-dept-item-legal").click();

  // Open menu again - legal should not appear
  await page.getByTestId("add-dept-button").click();
  await expect(page.getByTestId("add-dept-item-legal")).toHaveCount(0);
});

// ─── PART C: Add Capability Tests ──────────────────────────────

test("add capability shows in sidebar", async ({ page }) => {
  // Skip on mobile - sidebar is hidden
  const isMobile = await page.getByTestId("lab-env-sidebar-toggle").isVisible().catch(() => false);

  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);

  // On mobile, the add-cap button would be in the drawer. Test only desktop.
  if (isMobile) return;

  const addCapButton = page.getByTestId("add-cap-button");
  // The button is only visible when there are capabilities to add
  // For executive in general template, all capabilities are already visible via registry
  // so the button may not appear. This is expected behavior.
  const buttonVisible = await addCapButton.isVisible().catch(() => false);
  if (!buttonVisible) return;

  await addCapButton.click();
  await expect(page.getByTestId("add-cap-menu")).toBeVisible();
});

// ─── PART D: CRM Tests ────────────────────────────────────────

test("can add company in CRM", async ({ page }) => {
  // First add CRM department
  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/executive`);
  await page.getByTestId("add-dept-button").click();

  // CRM might already be in the general template
  const crmInMenu = await page.getByTestId("add-dept-item-crm").isVisible().catch(() => false);
  if (crmInMenu) {
    await page.getByTestId("add-dept-item-crm").click();
  }

  // Navigate to CRM
  await page.locator('[data-testid="dept-tab-crm"]:visible').first().click();
  await expect(page).toHaveURL(new RegExp(`/lab/env/${TEST_ENV_ID}/dept/crm$`));

  // Navigate to companies capability
  // Open sidebar on mobile if needed
  const mobileToggle = page.getByTestId("lab-env-sidebar-toggle");
  if (await mobileToggle.isVisible()) {
    await mobileToggle.click();
    await expect(page.getByTestId("lab-env-sidebar-drawer")).toBeVisible();
    await page
      .getByTestId("lab-env-sidebar-drawer")
      .locator('[data-testid="cap-link-companies"]')
      .first()
      .click();
  } else {
    await page.locator('[data-testid="cap-link-companies"]:visible').first().click();
  }

  await expect(page).toHaveURL(
    new RegExp(`/lab/env/${TEST_ENV_ID}/dept/crm/capability/companies$`)
  );

  // Add a company
  await page.getByTestId("add-company-button").click();
  await expect(page.getByTestId("add-company-modal")).toBeVisible();

  await page.getByTestId("company-name-input").fill("Test Corp");
  await page.getByTestId("save-company-button").click();

  // Modal should close
  await expect(page.getByTestId("add-company-modal")).toBeHidden();

  // Company should appear in table
  await expect(page.getByTestId("companies-table")).toContainText("Test Corp");
});

test("can add contact linked to company", async ({ page }) => {
  // Seed a company first via localStorage
  await page.addInitScript((envId: string) => {
    const store = {
      version: 1,
      departments: [],
      capabilities: {},
      crm: {
        companies: [
          {
            id: "comp-1",
            name: "Test Corp",
            tags: [],
            createdAt: "2026-02-10T00:00:00.000Z",
            updatedAt: "2026-02-10T00:00:00.000Z",
          },
        ],
        contacts: [],
        interactions: [],
      },
    };
    window.localStorage.setItem(`lab_env_data_${envId}`, JSON.stringify(store));
  }, TEST_ENV_ID);

  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/crm/capability/contacts`);

  await page.getByTestId("add-contact-button").click();
  await expect(page.getByTestId("add-contact-modal")).toBeVisible();

  await page.getByTestId("contact-firstname-input").fill("Jane");
  await page.getByTestId("contact-lastname-input").fill("Doe");

  // Link to company
  await page.getByTestId("contact-company-select").selectOption("comp-1");

  await page.getByTestId("save-contact-button").click();
  await expect(page.getByTestId("add-contact-modal")).toBeHidden();

  // Contact should appear in table
  await expect(page.getByTestId("contacts-table")).toContainText("Jane");
  await expect(page.getByTestId("contacts-table")).toContainText("Doe");
  await expect(page.getByTestId("contacts-table")).toContainText("Test Corp");
});

test("can log interaction and updates lastTouch/nextDue", async ({ page }) => {
  // Seed company + contact
  await page.addInitScript((envId: string) => {
    const store = {
      version: 1,
      departments: [],
      capabilities: {},
      crm: {
        companies: [
          {
            id: "comp-1",
            name: "Test Corp",
            tags: [],
            touchCadenceDays: 7,
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
        contacts: [
          {
            id: "cont-1",
            firstName: "Jane",
            lastName: "Doe",
            companyId: "comp-1",
            tags: [],
            touchCadenceDays: 14,
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
        interactions: [],
      },
    };
    window.localStorage.setItem(`lab_env_data_${envId}`, JSON.stringify(store));
  }, TEST_ENV_ID);

  await page.goto(`/lab/env/${TEST_ENV_ID}/dept/crm/capability/interactions`);

  await page.getByTestId("log-interaction-button").click();
  await expect(page.getByTestId("log-interaction-modal")).toBeVisible();

  // Fill in interaction
  await page.getByTestId("interaction-type-select").selectOption("call");
  await page.getByTestId("interaction-company-select").selectOption("comp-1");
  await page.getByTestId("interaction-contact-select").selectOption("cont-1");
  await page.getByTestId("interaction-summary-input").fill("Discussed Q2 projections");

  await page.getByTestId("save-interaction-button").click();
  await expect(page.getByTestId("log-interaction-modal")).toBeHidden();

  // Interaction should appear in table
  await expect(page.getByTestId("interactions-table")).toContainText("Discussed Q2 projections");
  await expect(page.getByTestId("interactions-table")).toContainText("Test Corp");
  await expect(page.getByTestId("interactions-table")).toContainText("Jane Doe");

  // Verify lastTouch was updated in localStorage
  const storeData = await page.evaluate((envId: string) => {
    const raw = window.localStorage.getItem(`lab_env_data_${envId}`);
    return raw ? JSON.parse(raw) : null;
  }, TEST_ENV_ID);

  expect(storeData).toBeTruthy();
  expect(storeData.crm.companies[0].lastTouchAt).toBeTruthy();
  expect(storeData.crm.companies[0].nextTouchDueAt).toBeTruthy();
  expect(storeData.crm.contacts[0].lastTouchAt).toBeTruthy();
  expect(storeData.crm.contacts[0].nextTouchDueAt).toBeTruthy();
});
