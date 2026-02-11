import path from "node:path";
import { expect, test } from "@playwright/test";

const BIZ_ID = "biz_ingest_test";

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
    },
    [BIZ_ID]
  );

  let createdSourceId = "ingest-source-1";
  let createdRecipeId = "ingest-recipe-1";

  await page.route("**/api/businesses/**/departments", async (route) => {
    await route.fulfill({ json: departments });
  });

  await page.route("**/api/documents**", async (route) => {
    await route.fulfill({
      json: [
        {
          document_id: "doc-1",
          business_id: BIZ_ID,
          department_id: null,
          title: "vendors.csv",
          virtual_path: null,
          status: "draft",
          created_at: "2026-02-11T00:00:00Z",
          latest_version_number: 1,
          latest_content_type: "text/csv",
          latest_size_bytes: 321,
        },
      ],
    });
  });

  await page.route("**/api/documents/init-upload", async (route) => {
    await route.fulfill({
      json: {
        document_id: "doc-1",
        version_id: "ver-1",
        storage_key: "tenant/test/business/test/file.csv",
        signed_upload_url: "https://storage.test/upload/vendors.csv",
      },
    });
  });

  await page.route("https://storage.test/**", async (route) => {
    await route.fulfill({ status: 200, body: "ok" });
  });

  await page.route("**/api/documents/complete-upload", async (route) => {
    await route.fulfill({ json: { ok: true } });
  });

  await page.route("**/api/ai/health", async (route) => {
    await route.fulfill({ status: 503, json: { status: "error" } });
  });

  await page.route("**/api/ingest/targets", async (route) => {
    await route.fulfill({
      json: [
        {
          key: "vendor",
          label: "Vendor",
          is_canonical: true,
          columns: [
            { name: "name", type: "string", required: true },
            { name: "tax_id", type: "string", required: false },
            { name: "payment_terms", type: "string", required: false },
            { name: "email", type: "string", required: false },
          ],
        },
      ],
    });
  });

  await page.route("**/api/ingest/sources**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        json: [
          {
            id: createdSourceId,
            business_id: BIZ_ID,
            env_id: null,
            name: "vendors.csv",
            description: null,
            document_id: "doc-1",
            file_type: "csv",
            status: "draft",
            created_at: "2026-02-11T00:00:00Z",
            updated_at: "2026-02-11T00:00:00Z",
            latest_version_num: 1,
            latest_document_version_id: "ver-1",
          },
        ],
      });
      return;
    }

    if (method === "POST") {
      await route.fulfill({
        json: {
          id: createdSourceId,
          business_id: BIZ_ID,
          env_id: null,
          name: "vendors.csv",
          description: null,
          document_id: "doc-1",
          file_type: "csv",
          status: "draft",
          created_at: "2026-02-11T00:00:00Z",
          updated_at: "2026-02-11T00:00:00Z",
          latest_version_num: 1,
          latest_document_version_id: "ver-1",
        },
      });
      return;
    }

    await route.fallback();
  });

  await page.route("**/api/ingest/sources/*/profile", async (route) => {
    await route.fulfill({
      json: {
        source_id: createdSourceId,
        source_version_id: "source-version-1",
        file_type: "csv",
        version_num: 1,
        detected_tables: [{ sheet_name: "CSV", row_count: 3, column_count: 5 }],
        sheets: [
          {
            sheet_name: "CSV",
            header_row_index: 0,
            total_rows: 3,
            columns: [
              {
                name: "vendor_name",
                inferred_type: "string",
                nonnull_count: 3,
                distinct_count: 3,
                sample_values: ["Blue Harbor LLC"],
              },
              {
                name: "tax_id",
                inferred_type: "string",
                nonnull_count: 3,
                distinct_count: 3,
                sample_values: ["12-3456789"],
              },
              {
                name: "payment_terms",
                inferred_type: "string",
                nonnull_count: 3,
                distinct_count: 3,
                sample_values: ["Net30"],
              },
              {
                name: "email",
                inferred_type: "string",
                nonnull_count: 3,
                distinct_count: 3,
                sample_values: ["ap@blueharbor.com"],
              },
            ],
            sample_rows: [
              {
                vendor_name: "Blue Harbor LLC",
                tax_id: "12-3456789",
                payment_terms: "Net30",
                email: "ap@blueharbor.com",
              },
            ],
            key_candidates: [
              {
                column: "vendor_name",
                uniqueness_ratio: 1,
                completeness_ratio: 1,
              },
            ],
          },
        ],
      },
    });
  });

  await page.route("**/api/ingest/sources/*/recipes", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const target = String(body.target_table_key || "vendor");
    createdRecipeId = "ingest-recipe-1";

    await route.fulfill({
      json: {
        id: createdRecipeId,
        ingest_source_id: createdSourceId,
        target_table_key: target,
        mode: "upsert",
        primary_key_fields: ["name"],
        settings_json: {},
        created_at: "2026-02-11T00:00:00Z",
        updated_at: "2026-02-11T00:00:00Z",
        mappings: [],
        transform_steps: [],
      },
    });
  });

  await page.route("**/api/ingest/recipes/*/validate", async (route) => {
    await route.fulfill({
      json: {
        run_hash: "run-hash-1",
        rows_read: 3,
        rows_valid: 3,
        rows_rejected: 0,
        preview_rows: [
          {
            name: "Blue Harbor LLC",
            tax_id: "12-3456789",
            payment_terms: "net30",
            email: "ap@blueharbor.com",
          },
          {
            name: "Summit Services",
            tax_id: "98-7654321",
            payment_terms: "net45",
            email: "billing@summitservices.com",
          },
        ],
        errors: [],
        lineage: {
          parser: { file_type: "csv", sheet_name: "CSV" },
          mapping: { primary_key_fields: ["name"] },
          transform_steps: [],
          target: { table_key: "vendor" },
        },
      },
    });
  });

  await page.route("**/api/ingest/recipes/*/run", async (route) => {
    await route.fulfill({
      json: {
        id: "ingest-run-1",
        ingest_recipe_id: createdRecipeId,
        source_version_id: "source-version-1",
        run_hash: "run-hash-1",
        engine_version: "ingest-engine-v1",
        status: "completed",
        rows_read: 3,
        rows_valid: 3,
        rows_inserted: 3,
        rows_updated: 0,
        rows_rejected: 0,
        started_at: "2026-02-11T00:00:00Z",
        completed_at: "2026-02-11T00:00:01Z",
        error_summary: null,
        lineage_json: {
          parser: { file_type: "csv", sheet_name: "CSV" },
          mapping: { primary_key_fields: ["name"] },
          transform_steps: [],
          target: { table_key: "vendor" },
        },
        errors: [],
      },
    });
  });

  await page.route("**/api/ingest/tables?**", async (route) => {
    await route.fulfill({
      json: [
        {
          table_key: "vendor",
          name: "Vendor",
          kind: "canonical",
          business_id: BIZ_ID,
          env_id: null,
          row_count: 3,
          columns: ["name", "tax_id", "payment_terms", "email"],
          last_updated_at: "2026-02-11T00:00:01Z",
        },
      ],
    });
  });

  await page.route("**/api/ingest/tables/vendor/rows?**", async (route) => {
    await route.fulfill({
      json: {
        table_key: "vendor",
        total_rows: 3,
        rows: [
          {
            name: "Blue Harbor LLC",
            tax_id: "12-3456789",
            payment_terms: "net30",
            email: "ap@blueharbor.com",
          },
          {
            name: "Summit Services",
            tax_id: "98-7654321",
            payment_terms: "net45",
            email: "billing@summitservices.com",
          },
        ],
      },
    });
  });

  await page.route("**/api/ingest/tables/vendor/metric-suggestions?**", async (route) => {
    await route.fulfill({
      json: {
        table_key: "vendor",
        suggestions: [
          {
            data_point_key: "vendor.count",
            source_table_key: "vendor",
            aggregation: "count",
            value_column: null,
            rationale: "Count of ingested rows.",
          },
        ],
      },
    });
  });

  await page.route("**/api/ingest/metrics/data-points?**", async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route("**/api/ingest/metrics/data-points", async (route) => {
    await route.fulfill({
      json: {
        id: "dp-1",
        business_id: BIZ_ID,
        env_id: null,
        data_point_key: "vendor.count",
        source_table_key: "vendor",
        aggregation: "count",
        value_column: null,
        last_updated_at: "2026-02-11T00:00:01Z",
        row_count: 3,
        columns_json: ["name"],
        metadata_json: {},
        created_at: "2026-02-11T00:00:01Z",
        updated_at: "2026-02-11T00:00:01Z",
      },
    });
  });
});

test("upload CSV -> map vendor -> validate -> run -> table viewer", async ({ page }) => {
  const fixturePath = path.resolve(__dirname, "../public/fixtures/ingest/vendors.csv");

  await page.goto("/ingest/sources");

  await page.getByTestId("ingest-upload").setInputFiles(fixturePath);
  const sourceLink = page.getByRole("link", { name: /vendors\.csv/i }).first();
  await expect(sourceLink).toBeVisible();
  await sourceLink.click();

  await expect(page.getByTestId("ingest-profile")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("ingest-target-select")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByTestId("ingest-mapping-table")).toBeVisible();
  await page.getByRole("button", { name: "Validate" }).click();

  await expect(page.getByTestId("ingest-validate")).toBeVisible();
  await expect(page.getByText("No validation errors detected.")).toBeVisible();

  await page.getByTestId("ingest-run").click();

  await expect(page.getByTestId("ingest-run-summary")).toBeVisible();
  await page.getByRole("link", { name: "Open table viewer" }).click();

  await expect(page.getByText("Blue Harbor LLC", { exact: true })).toBeVisible();
});
