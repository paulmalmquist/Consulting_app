import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

const desktopViewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1536', width: 1536, height: 950 },
  { name: '1728', width: 1728, height: 1000 },
  { name: '1920', width: 1920, height: 1080 },
];

const mobileViewport = { name: 'mobile', width: 390, height: 844 };

const screenshotDir = path.join(__dirname, '../../test-results/saas-iceberg');

test.beforeAll(() => {
  fs.mkdirSync(screenshotDir, { recursive: true });
});

for (const vp of desktopViewports) {
  test(`saas iceberg visual smoke — desktop ${vp.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/saas-iceberg', { waitUntil: 'networkidle' });

    // Stage and art are visible on desktop
    const stage = page.locator('.saas-iceberg-stage');
    const art = page.locator('.saas-iceberg-art');
    await expect(stage).toBeVisible();
    await expect(art).toBeVisible();

    // h1 is in DOM (screen-reader-only, srOnly pattern) — check it exists with right text
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
    const h1Text = await page.locator('h1').first().textContent();
    expect(h1Text).toMatch(/really paying for/i);

    // Diagnostic h2 is visible
    await expect(page.locator('h2').first()).toBeVisible();

    // Art covers stage
    const stageBox = await stage.boundingBox();
    const artBox = await art.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(artBox).not.toBeNull();
    expect(stageBox!.width).toBeGreaterThan(300);
    expect(stageBox!.height).toBeGreaterThan(200);
    expect(artBox!.width).toBeGreaterThan(stageBox!.width * 0.95);
    expect(artBox!.height).toBeGreaterThan(stageBox!.height * 0.95);

    // Aspect ratio within 3% of 1.5426
    const ratio = stageBox!.width / stageBox!.height;
    expect(Math.abs(ratio - 1.5426)).toBeLessThan(0.05);

    // Image loaded with real content
    const imageLoaded = await art.evaluate((img: HTMLImageElement) => {
      return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    });
    expect(imageLoaded).toBeTruthy();

    // No horizontal overflow
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
    });
    expect(overflow).toBeFalsy();

    // No console errors
    expect(errors).toEqual([]);

    await page.screenshot({
      path: path.join(screenshotDir, `saas-iceberg-${vp.name}.png`),
      fullPage: true,
    });
  });
}

test('saas iceberg visual smoke — mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  await page.setViewportSize({ width: mobileViewport.width, height: mobileViewport.height });
  await page.goto('/saas-iceberg', { waitUntil: 'networkidle' });

  // Stage is hidden on mobile; h1 is inside it (srOnly) so it's hidden too.
  // The diagnostic h2 is always visible and is the primary readable heading.
  const h2 = page.locator('h2').first();
  await expect(h2).toBeVisible();
  await expect(h2).toContainText(/compensating|ownership|outsourcing/i);

  // No horizontal overflow
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  });
  expect(overflow).toBeFalsy();

  // No console errors
  expect(errors).toEqual([]);

  await page.screenshot({
    path: path.join(screenshotDir, `saas-iceberg-${mobileViewport.name}.png`),
    fullPage: true,
  });
});
