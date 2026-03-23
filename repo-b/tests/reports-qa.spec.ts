import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type BusinessState = {
  id: string;
  name: string;
  slug: string;
  region: string;
  selectedTemplateKey?: string;
  templateSnapshot?: { departments: string[]; capabilities: string[] };
  enabledDepartments: string[];
  enabledCapabilities: string[];
};

type DocVersion = {
  version_id: string;
  document_id: string;
  version_number: number;
  state: string;
  original_filename: string;
  mime_type: string;
  created_at: string;
};

type DocState = {
  document_id: string;
  business_id: string;
  department_id: string | null;
  title: string;
  status: string;
  created_at: string;
  versions: DocVersion[];
};

type ExecutionState = {
  execution_id: string;
  business_id: string;
  department_id: string;
  capability_id: string;
  status: string;
  inputs_json: Record<string, unknown>;
  outputs_json: Record<string, unknown>;
  created_at: string;
};

type MockState = {
  businesses: Record<string, BusinessState>;
  documents: DocState[];
  executions: ExecutionState[];
};

const runbookPath = path.join(process.cwd(), "tests", "artifacts", "qa-runbook.md");

const departments = [
  { department_id: "dept_finance", key: "finance", label: "Finance", icon: "dollar-sign", sort_order: 10 },
  { department_id: "dept_operations", key: "operations", label: "Operations", icon: "settings", sort_order: 20 },
  { department_id: "dept_legal", key: "legal", label: "Legal", icon: "shield", sort_order: 30 },
] as const;

const capabilities = [
  { capability_id: "cap_invoice", department_id: "dept_finance", department_key: "finance", key: "invoice_processing", label: "Invoice Processing", kind: "action", sort_order: 10, metadata_json: { inputs: [{ name: "prompt", type: "textarea", label: "Prompt" }] } },
  { capability_id: "cap_expense", department_id: "dept_finance", department_key: "finance", key: "expense_review", label: "Expense Review", kind: "action", sort_order: 20, metadata_json: { inputs: [{ name: "prompt", type: "textarea", label: "Prompt" }] } },
  { capability_id: "cap_vendor", department_id: "dept_operations", department_key: "operations", key: "vendor_onboarding", label: "Vendor Onboarding", kind: "action", sort_order: 10, metadata_json: { inputs: [{ name: "prompt", type: "textarea", label: "Prompt" }] } },
  { capability_id: "cap_compliance", department_id: "dept_legal", department_key: "legal", key: "compliance_check", label: "Compliance Check", kind: "action", sort_order: 10, metadata_json: { inputs: [{ name: "prompt", type: "textarea", label: "Prompt" }] } },
] as const;

const templates = [
  {
    key: "starter",
    label: "Starter",
    description: "Starter template",
    departments: ["finance", "operations"],
    capabilities: ["invoice_processing", "expense_review", "vendor_onboarding"],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createState(): MockState {
  return {
    businesses: {},
    documents: [],
    executions: [],
  };
}

async function setupEvidence(context: BrowserContext, page: Page, testName: string) {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const line = msg.text();
      if (line.includes("Failed to fetch RSC payload")) return;
      consoleErrors.push(line);
      // Emit immediately so timeout failures still preserve root cause in terminal output.
      console.error(`[${testName}] console.error: ${line}`);
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
    console.error(`[${testName}] pageerror: ${err.message}`);
  });
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      const url = resp.url();
      if (resp.status() === 401 && !url.includes("/api/")) return;
      const line = `${resp.status()} ${url}`;
      networkErrors.push(line);
      console.error(`[${testName}] network: ${line}`);
    }
  });

  return async (status: "PASS" | "FAIL") => {
    let cookieCount = 0;
    try {
      const storage = await context.storageState();
      cookieCount = storage.cookies.length;
    } catch {
      cookieCount = 0;
    }
    const line = [
      `## ${testName}`,
      `- Status: ${status}`,
      `- ConsoleErrors: ${consoleErrors.length}`,
      `- PageErrors: ${pageErrors.length}`,
      `- NetworkErrors: ${networkErrors.length}`,
      `- Cookies: ${cookieCount}`,
      "",
      ...consoleErrors.map((e) => `- Console: ${e}`),
      ...pageErrors.map((e) => `- Page: ${e}`),
      ...networkErrors.map((e) => `- Network: ${e}`),
      "",
    ].join("\n");
    fs.appendFileSync(runbookPath, line);
  };
}

async function safeScreenshot(page: Page, fileName: string) {
  if (page.isClosed()) return;
  await page.screenshot({ path: path.join("tests/artifacts", fileName), fullPage: true });
}

async function installMockApi(page: Page, state: MockState, baseURL: string) {
  await page.route("**/mock-upload/**", async (route) => {
    await route.fulfill({ status: 200, body: "ok" });
  });
  await page.route("**/mock-download/**", async (route) => {
    await route.fulfill({ status: 200, body: "ok" });
  });

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/templates") {
      return route.fulfill({ json: templates });
    }
    if (method === "GET" && pathname === "/api/departments") {
      return route.fulfill({ json: departments });
    }
    if (method === "GET" && pathname.startsWith("/api/departments/") && pathname.endsWith("/capabilities")) {
      const deptKey = pathname.split("/")[3];
      const caps = capabilities.filter((c) => c.department_key === deptKey);
      return route.fulfill({ json: caps });
    }

    if (method === "POST" && pathname === "/api/businesses") {
      const body = JSON.parse(req.postData() || "{}");
      const id = uid("biz");
      state.businesses[id] = {
        id,
        name: body.name,
        slug: body.slug,
        region: body.region || "us",
        enabledDepartments: [],
        enabledCapabilities: [],
      };
      return route.fulfill({ json: { business_id: id, slug: body.slug } });
    }

    if (method === "POST" && pathname.match(/^\/api\/businesses\/[^/]+\/apply-template$/)) {
      const businessId = pathname.split("/")[3];
      const body = JSON.parse(req.postData() || "{}");
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: { detail: "Business not found" } });
      const template = templates.find((t) => t.key === body.template_key) || templates[0];
      const depts = body.enabled_departments?.length ? body.enabled_departments : template.departments;
      const caps = body.enabled_capabilities?.length ? body.enabled_capabilities : template.capabilities;
      biz.selectedTemplateKey = template.key;
      biz.enabledDepartments = [...depts];
      biz.enabledCapabilities = [...caps];
      biz.templateSnapshot = { departments: [...depts], capabilities: [...caps] };
      return route.fulfill({ json: { ok: true } });
    }

    if (method === "POST" && pathname.match(/^\/api\/businesses\/[^/]+\/apply-custom$/)) {
      const businessId = pathname.split("/")[3];
      const body = JSON.parse(req.postData() || "{}");
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: { detail: "Business not found" } });
      biz.enabledDepartments = [...(body.enabled_departments || [])];
      biz.enabledCapabilities = [...(body.enabled_capabilities || [])];
      return route.fulfill({ json: { ok: true } });
    }

    if (method === "GET" && pathname.match(/^\/api\/businesses\/[^/]+\/departments$/)) {
      const businessId = pathname.split("/")[3];
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: [] });
      const rows = departments
        .filter((d) => biz.enabledDepartments.includes(d.key))
        .map((d) => ({ ...d, enabled: true, sort_order_override: null }));
      return route.fulfill({ json: rows });
    }

    if (method === "GET" && pathname.match(/^\/api\/businesses\/[^/]+\/departments\/[^/]+\/capabilities$/)) {
      const segs = pathname.split("/");
      const businessId = segs[3];
      const deptKey = segs[5];
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: [] });
      const rows = capabilities
        .filter((c) => c.department_key === deptKey && biz.enabledCapabilities.includes(c.key))
        .map((c) => ({ ...c, enabled: true, sort_order_override: null }));
      return route.fulfill({ json: rows });
    }

    if (method === "POST" && pathname === "/api/documents/init-upload") {
      const body = JSON.parse(req.postData() || "{}");
      const bizId = body.business_id;
      const title = body.title || body.filename;
      let doc = state.documents.find((d) => d.business_id === bizId && d.title === title);
      if (!doc) {
        doc = {
          document_id: uid("doc"),
          business_id: bizId,
          department_id: body.department_id || null,
          title,
          status: "draft",
          created_at: nowIso(),
          versions: [],
        };
        state.documents.unshift(doc);
      }
      const version: DocVersion = {
        version_id: uid("ver"),
        document_id: doc.document_id,
        version_number: doc.versions.length + 1,
        state: "uploading",
        original_filename: body.filename,
        mime_type: body.content_type,
        created_at: nowIso(),
      };
      doc.versions.unshift(version);
      return route.fulfill({
        json: {
          document_id: doc.document_id,
          version_id: version.version_id,
          storage_key: `mock/${doc.document_id}/${version.version_id}`,
          signed_upload_url: `${baseURL}/mock-upload/${version.version_id}`,
        },
      });
    }

    if (method === "PUT" && pathname.startsWith("/mock-upload/")) {
      return route.fulfill({ status: 200, body: "ok" });
    }

    if (method === "POST" && pathname === "/api/documents/complete-upload") {
      const body = JSON.parse(req.postData() || "{}");
      const doc = state.documents.find((d) => d.document_id === body.document_id);
      const version = doc?.versions.find((v) => v.version_id === body.version_id);
      if (version) version.state = "available";
      return route.fulfill({ json: { ok: true } });
    }

    if (method === "GET" && pathname === "/api/documents") {
      const businessId = url.searchParams.get("business_id") || "";
      const departmentId = url.searchParams.get("department_id");
      const rows = state.documents
        .filter((d) => d.business_id === businessId)
        .filter((d) => !departmentId || d.department_id === departmentId)
        .map((d) => ({
          document_id: d.document_id,
          business_id: d.business_id,
          department_id: d.department_id,
          title: d.title,
          virtual_path: null,
          status: d.status,
          created_at: d.created_at,
          latest_version_number: d.versions[0]?.version_number || null,
          latest_content_type: d.versions[0]?.mime_type || null,
          latest_size_bytes: 1024,
        }));
      return route.fulfill({ json: rows });
    }

    if (method === "GET" && pathname.match(/^\/api\/documents\/[^/]+\/versions$/)) {
      const documentId = pathname.split("/")[3];
      const doc = state.documents.find((d) => d.document_id === documentId);
      return route.fulfill({ json: doc?.versions || [] });
    }

    if (method === "GET" && pathname.match(/^\/api\/documents\/[^/]+\/versions\/[^/]+\/download-url$/)) {
      const versionId = pathname.split("/")[5];
      return route.fulfill({ json: { signed_download_url: `${baseURL}/mock-download/${versionId}` } });
    }

    if (method === "POST" && pathname === "/api/executions/run") {
      const body = JSON.parse(req.postData() || "{}");
      const exec = {
        execution_id: uid("exec"),
        business_id: body.business_id,
        department_id: body.department_id,
        capability_id: body.capability_id,
        status: "completed",
        inputs_json: body.inputs_json || {},
        outputs_json: { message: "Execution completed successfully" },
        created_at: nowIso(),
      };
      state.executions.unshift(exec);
      return route.fulfill({ json: { run_id: exec.execution_id, status: "completed", outputs_json: exec.outputs_json } });
    }

    if (method === "GET" && pathname === "/api/executions") {
      const businessId = url.searchParams.get("business_id");
      const departmentId = url.searchParams.get("department_id");
      const capabilityId = url.searchParams.get("capability_id");
      const rows = state.executions
        .filter((e) => !businessId || e.business_id === businessId)
        .filter((e) => !departmentId || e.department_id === departmentId)
        .filter((e) => !capabilityId || e.capability_id === capabilityId);
      return route.fulfill({ json: rows });
    }

    if (pathname === "/api/reports/business-overview") {
      const businessId = url.searchParams.get("business_id") || "";
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: { detail: "not found" } });
      return route.fulfill({
        json: {
          business: {
            name: biz.name,
            slug: biz.slug,
            region: biz.region,
            departments_enabled: biz.enabledDepartments.length,
            capabilities_enabled: biz.enabledCapabilities.length,
            documents_count: state.documents.filter((d) => d.business_id === biz.id).length,
            executions_count: state.executions.filter((e) => e.business_id === biz.id).length,
            funds_count: 0,
          },
          links: { app: "/app", documents: "/documents", reports: "/app/reports" },
        },
      });
    }

    if (pathname === "/api/reports/department-health") {
      const businessId = url.searchParams.get("business_id") || "";
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ json: { rows: [] } });
      const rows = departments
        .filter((d) => biz.enabledDepartments.includes(d.key))
        .map((d) => ({
          department_id: d.department_id,
          key: d.key,
          label: d.label,
          enabled_capabilities: capabilities.filter((c) => c.department_key === d.key && biz.enabledCapabilities.includes(c.key)).length,
          documents_count: state.documents.filter((doc) => doc.business_id === biz.id && doc.department_id === d.department_id).length,
          executions_count: state.executions.filter((e) => e.business_id === biz.id && e.department_id === d.department_id).length,
          deep_link: `/app/${d.key}`,
        }));
      return route.fulfill({ json: { rows } });
    }

    if (pathname === "/api/reports/doc-register") {
      const businessId = url.searchParams.get("business_id") || "";
      const rows = state.documents.filter((d) => d.business_id === businessId).map((d) => ({
        document_id: d.document_id,
        title: d.title,
        status: d.status,
        version_count: d.versions.length,
        deep_link: "/documents",
      }));
      return route.fulfill({ json: { rows } });
    }

    if (pathname === "/api/reports/doc-compliance") {
      const businessId = url.searchParams.get("business_id") || "";
      const rows = state.documents.filter((d) => d.business_id === businessId).map((d) => ({
        document_id: d.document_id,
        title: d.title,
        missing_acl: false,
        severity: d.versions.some((v) => v.state === "available") ? "ok" : "high",
        deep_link: "/documents",
      }));
      return route.fulfill({ json: { rows } });
    }

    if (pathname === "/api/reports/execution-ledger") {
      const businessId = url.searchParams.get("business_id") || "";
      const rows = state.executions.filter((e) => e.business_id === businessId).map((e) => {
        const dept = departments.find((d) => d.department_id === e.department_id);
        const cap = capabilities.find((c) => c.capability_id === e.capability_id);
        return {
          execution_id: e.execution_id,
          status: e.status,
          department_label: dept?.label,
          capability_label: cap?.label,
          deep_link: dept && cap ? `/app/${dept.key}/capability/${cap.key}` : "/app",
        };
      });
      return route.fulfill({ json: { rows } });
    }

    if (pathname === "/api/reports/template-adoption") {
      const businessId = url.searchParams.get("business_id") || "";
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ status: 404, json: { detail: "not found" } });
      const expected = biz.templateSnapshot;
      const missing = (expected?.capabilities || []).filter((k) => !biz.enabledCapabilities.includes(k));
      return route.fulfill({
        json: {
          template_key: biz.selectedTemplateKey || null,
          drift: {
            has_drift: missing.length > 0,
            missing_departments: [],
            extra_departments: [],
            missing_capabilities: missing,
            extra_capabilities: [],
          },
          deep_link: "/onboarding",
        },
      });
    }

    if (method === "POST" && pathname === "/api/reports/template-adoption/simulate-drift") {
      const businessId = url.searchParams.get("business_id") || "";
      const biz = state.businesses[businessId];
      if (!biz || !biz.enabledCapabilities.length) return route.fulfill({ status: 404, json: { detail: "not found" } });
      biz.enabledCapabilities = biz.enabledCapabilities.slice(1);
      return route.fulfill({ json: { ok: true, disabled_capability_key: "simulated" } });
    }

    if (pathname === "/api/reports/readiness") {
      const businessId = url.searchParams.get("business_id") || "";
      const biz = state.businesses[businessId];
      if (!biz) return route.fulfill({ json: { score: {}, rows: [] } });
      const rows = [
        { area: "Department Coverage", value: `${biz.enabledDepartments.length}`, status: biz.enabledDepartments.length > 0 ? "ok" : "attention", deep_link: "/app" },
        { area: "Document Register", value: `${state.documents.filter((d) => d.business_id === biz.id).length}`, status: "ok", deep_link: "/documents" },
        { area: "Execution Ledger", value: `${state.executions.filter((e) => e.business_id === biz.id).length}`, status: "ok", deep_link: "/app" },
      ];
      return route.fulfill({ json: { score: {}, rows } });
    }

    return route.fulfill({ status: 404, json: { detail: `Unhandled mock route: ${method} ${pathname}` } });
  });
}

async function seedAuth(context: BrowserContext, page: Page, baseURL: string) {
  await context.addCookies([
    {
      name: "demo_lab_session",
      value: "active",
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  fs.mkdirSync(path.dirname(runbookPath), { recursive: true });
  fs.writeFileSync(runbookPath, `# QA Loop Runbook\n\nGenerated: ${new Date().toISOString()}\n\n`);
});

test("S1 Template Business", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const state = createState();
  await installMockApi(page, state, baseURL);
  const finalize = await setupEvidence(context, page, "S1 Template Business");

  try {
    await seedAuth(context, page, baseURL);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-business-name").fill(`Template Biz ${Date.now()}`);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-path-template").click();
    await page.locator("[data-testid^='template-card-']").first().click();
    await page.getByTestId("onboarding-provision").click();
    await expect(page).toHaveURL(/\/app(\/|$)/);

    const businessId = await page.evaluate(() => localStorage.getItem("bos_business_id"));
    expect(businessId).toBeTruthy();

    // Finance is a dedicated workspace page; operations remains capability-driven.
    await page.getByTestId("dept-tab-finance").click();
    await expect(page).toHaveURL(/\/app\/finance$/);
    await expect(page.getByText("Deterministic Financial Engine")).toBeVisible();

    for (const dept of ["operations"]) {
      await page.getByTestId(`dept-tab-${dept}`).click();
      await expect(page).toHaveURL(new RegExp(`/app/${dept}$`));
      const capTile = page.locator("[data-testid^='cap-tile-']").first();
      await capTile.click();
      await expect(page.getByTestId("exec-run")).toBeVisible();
      await page.goto(`/app/${dept}`);
    }

    await page.goto("/app/reports/business-overview");
    await expect(page.getByTestId("report-r1-card")).toBeVisible();
    await page.goto("/app/reports/department-health");
    await expect(page.getByTestId("report-r2-row").first()).toBeVisible();
    await page.goto("/app/reports/template-adoption");
    await expect(page.getByTestId("report-r6-card")).toBeVisible();
    await page.goto("/app/reports/readiness");
    await expect(page.getByTestId("report-r7-row").first()).toBeVisible();

    await finalize("PASS");
  } catch (err) {
    await safeScreenshot(page, "s1-failure.png");
    await finalize("FAIL");
    throw err;
  }
});

test("S2 Custom Business", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const state = createState();
  await installMockApi(page, state, baseURL);
  const finalize = await setupEvidence(context, page, "S2 Custom Business");

  try {
    await seedAuth(context, page, baseURL);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-business-name").fill(`Custom Biz ${Date.now()}`);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-path-custom").click();
    await page.getByTestId("onboarding-custom-dept-finance").click();
    await page.getByTestId("onboarding-custom-dept-legal").click();
    await page.getByRole("button", { name: "Next: Capabilities" }).click();
    await page.getByTestId("onboarding-custom-cap-invoice_processing").click();
    await page.getByTestId("onboarding-custom-cap-compliance_check").click();
    await page.getByRole("button", { name: "Review Configuration" }).click();
    await page.getByTestId("onboarding-provision").click();
    await expect(page).toHaveURL(/\/app(\/|$)/);

    await page.getByTestId("dept-tab-legal").click();
    await expect(page.locator("[data-testid^='cap-tile-']").first()).toBeVisible();
    await page.goto("/app/reports/business-overview");
    await expect(page.getByTestId("report-r1-card")).toBeVisible();
    await page.goto("/app/reports/department-health");
    await expect(page.getByTestId("report-r2-row").first()).toBeVisible();
    await page.goto("/app/reports/readiness");
    await expect(page.getByTestId("report-r7-row").first()).toBeVisible();

    await finalize("PASS");
  } catch (err) {
    await safeScreenshot(page, "s2-failure.png");
    await finalize("FAIL");
    throw err;
  }
});

test("S3 Documents + Versions", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const state = createState();
  await installMockApi(page, state, baseURL);
  const finalize = await setupEvidence(context, page, "S3 Documents + Versions");

  try {
    await seedAuth(context, page, baseURL);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-business-name").fill(`Docs Biz ${Date.now()}`);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-path-template").click();
    await page.locator("[data-testid^='template-card-']").first().click();
    await page.getByTestId("onboarding-provision").click();

    const fixtures = path.join(process.cwd(), "tests", "fixtures");
    await page.goto("/documents");
    await page.getByTestId("docs-upload-input").setInputFiles(path.join(fixtures, "sample.pdf"));
    await page.getByTestId("docs-upload-input").setInputFiles(path.join(fixtures, "sample.xlsx"));
    await page.getByTestId("docs-upload-input").setInputFiles(path.join(fixtures, "sample.png"));
    await page.getByTestId("docs-upload-input").setInputFiles(path.join(fixtures, "sample.pdf"));

    await expect(page.getByTestId("doc-row").first()).toBeVisible();
    await page.getByTestId("doc-row").filter({ hasText: "sample.pdf" }).click();
    await expect(page.getByTestId("doc-version-row").first()).toBeVisible();
    await expect(page.getByTestId("doc-version-row")).toHaveCount(2);

    const downloadRespPromise = page.waitForResponse((r) => r.url().includes("/download-url") && r.status() === 200);
    await page.getByTestId("doc-download-btn").first().click();
    const downloadResp = await downloadRespPromise;
    const payload = await downloadResp.json();
    const status = await page.evaluate(async (downloadUrl: string) => {
      const resp = await fetch(downloadUrl, { method: "HEAD" });
      return resp.status;
    }, payload.signed_download_url);
    expect(status).toBe(200);

    await page.goto("/app/reports/document-register");
    await expect(page.getByTestId("report-r3-row").first()).toBeVisible();
    await page.goto("/app/reports/document-compliance");
    await expect(page.getByTestId("report-r4-row").first()).toBeVisible();

    await finalize("PASS");
  } catch (err) {
    await safeScreenshot(page, "s3-failure.png");
    await finalize("FAIL");
    throw err;
  }
});

test("S4 Executions", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const state = createState();
  await installMockApi(page, state, baseURL);
  const finalize = await setupEvidence(context, page, "S4 Executions");

  try {
    await seedAuth(context, page, baseURL);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-business-name").fill(`Exec Biz ${Date.now()}`);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-path-custom").click();
    await page.getByTestId("onboarding-custom-dept-operations").click();
    await page.getByTestId("onboarding-custom-dept-legal").click();
    await page.getByRole("button", { name: "Next: Capabilities" }).click();
    await page.getByTestId("onboarding-custom-cap-vendor_onboarding").click();
    await page.getByTestId("onboarding-custom-cap-compliance_check").click();
    await page.getByRole("button", { name: "Review Configuration" }).click();
    await page.getByTestId("onboarding-provision").click();

    await page.goto("/app/operations");
    await page.locator("[data-testid^='cap-tile-']").first().click();
    await page.getByTestId("exec-input-prompt").fill("run 1");
    await page.getByTestId("exec-run").click();
    await expect(page.getByTestId("exec-result")).toBeVisible();

    await page.goto("/app/legal");
    await page.locator("[data-testid^='cap-tile-']").first().click();
    await page.getByTestId("exec-input-prompt").fill("run 2");
    await page.getByTestId("exec-run").click();
    await expect(page.getByTestId("exec-result")).toBeVisible();

    await page.goto("/app/reports/execution-ledger");
    await expect(page.getByTestId("report-r5-row")).toHaveCount(2);

    await finalize("PASS");
  } catch (err) {
    await safeScreenshot(page, "s4-failure.png");
    await finalize("FAIL");
    throw err;
  }
});

test("S5 Drift Detection", async ({ context, page, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const state = createState();
  await installMockApi(page, state, baseURL);
  const finalize = await setupEvidence(context, page, "S5 Drift Detection");

  try {
    await seedAuth(context, page, baseURL);
    await page.goto("/onboarding");
    await page.getByTestId("onboarding-business-name").fill(`Drift Biz ${Date.now()}`);
    await page.getByTestId("onboarding-continue").click();
    await page.getByTestId("onboarding-path-template").click();
    await page.locator("[data-testid^='template-card-']").first().click();
    await page.getByTestId("onboarding-provision").click();

    await page.goto("/app/reports/template-adoption");
    await expect(page.getByTestId("report-r6-drift-flag")).toContainText("false");
    await page.getByTestId("report-r6-simulate-drift").click();
    await expect(page.getByTestId("report-r6-drift-flag")).toContainText("true");

    await finalize("PASS");
  } catch (err) {
    await safeScreenshot(page, "s5-failure.png");
    await finalize("FAIL");
    throw err;
  }
});
