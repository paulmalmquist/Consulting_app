import { test, expect } from "@playwright/test";

// Telemetry page header system (dispatch 0009). Asserts the shared TelemetryPageHeader family is in
// place across the variant spectrum: each page has exactly one <h1>, the right eyebrow, and the
// expected title — independent of backend data (these headers render even when the body fails closed).
// Runs under both projects (chromium Desktop + webkit iPhone), so it doubles as a wrap/viewport check.

const ENV_ID = "telemetry-demo";
const base = (slug: string) => `/lab/env/${ENV_ID}/telemetry${slug ? `/${slug}` : ""}`;

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("baseURL missing");
  const url = new URL(baseURL);
  await context.addCookies([
    { name: "demo_lab_session", value: "active", domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
});

// One representative page per variant; header renders regardless of backend availability.
const PAGES: { slug: string; eyebrow: string; title: string; variant: string }[] = [
  { slug: "", eyebrow: "Overview", title: "Why Launch Became A Data Problem", variant: "hero" },
  { slug: "stargate", eyebrow: "Stargate Live", title: "Printer telemetry stream", variant: "compact" },
  { slug: "model-performance", eyebrow: "Model Performance", title: "Champions, metrics, and promotion gates", variant: "standard" },
  { slug: "evidence", eyebrow: "Resume-Claim Evidence", title: "Every claim, mapped to a live proof", variant: "evidence" },
];

for (const p of PAGES) {
  test(`${p.variant} header renders with one h1 + eyebrow on /${p.slug || "(overview)"}`, async ({ page }) => {
    await page.goto(base(p.slug));
    // Exactly one page-level heading.
    const h1s = page.getByRole("heading", { level: 1 });
    await expect(h1s).toHaveCount(1);
    await expect(h1s.first()).toHaveText(new RegExp(p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // The mono eyebrow precedes it.
    await expect(page.getByText(p.eyebrow, { exact: true }).first()).toBeVisible();
  });
}
