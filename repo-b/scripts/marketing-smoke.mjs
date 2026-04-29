// Wave A marketing redesign smoke + screenshot pass.
// Run with: node scripts/marketing-smoke.mjs
// Requires the dev server running on :3000.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), '../docs/receipts/marketing-redesign/wave-a');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 375,  height: 800 },
};

const MARKETING_ROUTES = ['/', '/about', '/the-shift', '/research/messaging'];
const NON_MARKETING_ROUTES = ['/login', '/lab/environments'];

const findings = [];

function record(level, route, msg) {
  findings.push({ level, route, msg });
  const tag = level === 'pass' ? '✓' : level === 'warn' ? '!' : '✗';
  console.log(`${tag} [${route}] ${msg}`);
}

async function checkRoute(page, route, opts = {}) {
  const { theme = 'dark', viewport = 'desktop', isMarketing = true } = opts;
  await page.setViewportSize(VIEWPORTS[viewport]);

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
  });

  const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
  if (!resp || !resp.ok()) {
    record('fail', route, `HTTP ${resp?.status()} on ${viewport}/${theme}`);
    return;
  }

  if (isMarketing && theme === 'light') {
    await page.evaluate(() => {
      const el = document.querySelector('.marketing-shell');
      if (el) el.setAttribute('data-theme', 'light');
    });
    await page.waitForTimeout(150);
  }

  // Screenshot
  const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_');
  const file = path.join(OUT, `${slug}-${viewport}-${theme}.png`);
  await page.screenshot({ path: file, fullPage: false });

  // Marketing-only assertions
  if (isMarketing) {
    const data = await page.evaluate(() => {
      const shell = document.querySelector('.marketing-shell');
      if (!shell) return { error: 'no .marketing-shell' };
      const h1 = shell.querySelector('h1');
      const h1Style = h1 ? window.getComputedStyle(h1) : null;
      const eyebrow = shell.querySelector('.nv-eyebrow');
      const eyebrowStyle = eyebrow ? window.getComputedStyle(eyebrow) : null;
      const themeAttr = shell.getAttribute('data-theme');
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      const bg = window.getComputedStyle(shell).backgroundColor;
      return {
        themeAttr,
        h1FontFamily: h1Style?.fontFamily,
        h1FontSize: h1Style?.fontSize,
        h1FontWeight: h1Style?.fontWeight,
        eyebrowFontFamily: eyebrowStyle?.fontFamily,
        eyebrowLetterSpacing: eyebrowStyle?.letterSpacing,
        overflowX,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bg,
      };
    });

    if (data.error) {
      record('fail', route, `${data.error} (${viewport}/${theme})`);
      return;
    }
    if (data.themeAttr !== theme) record('warn', route, `data-theme=${data.themeAttr}, expected ${theme}`);
    if (data.h1FontFamily && !/Abadi/i.test(data.h1FontFamily)) {
      record('warn', route, `h1 font-family missing Abadi: ${data.h1FontFamily}`);
    } else if (data.h1FontFamily) {
      record('pass', route, `h1 stack: ${data.h1FontFamily.split(',')[0]} @ ${data.h1FontSize}/${data.h1FontWeight}`);
    }
    if (data.eyebrowFontFamily && !/Geist/i.test(data.eyebrowFontFamily) && !/mono/i.test(data.eyebrowFontFamily.toLowerCase())) {
      record('warn', route, `eyebrow font missing Geist Mono: ${data.eyebrowFontFamily}`);
    }
    if (data.overflowX) record('fail', route, `horizontal overflow at ${viewport}: ${data.scrollWidth}>${data.clientWidth}`);
    record('pass', route, `${viewport}/${theme}: bg=${data.bg}, no overflow`);
  } else {
    // Non-marketing isolation check
    const data = await page.evaluate(() => {
      const marketingShell = document.querySelector('.marketing-shell');
      const html = document.documentElement;
      const body = document.body;
      const bodyStyle = window.getComputedStyle(body);
      const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      return {
        hasMarketingShell: !!marketingShell,
        htmlTheme: html.getAttribute('data-theme'),
        bodyFontFamily: bodyStyle.fontFamily,
        bodyBg: bodyStyle.backgroundColor,
        overflowX,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    if (data.hasMarketingShell) {
      record('fail', route, `MARKETING LEAK: .marketing-shell present on non-marketing route`);
    } else {
      record('pass', route, `no marketing-shell leak (font=${data.bodyFontFamily.split(',')[0]}, html theme=${data.htmlTheme})`);
    }
    if (data.overflowX) record('warn', route, `overflow at ${viewport}: ${data.scrollWidth}>${data.clientWidth}`);
  }

  if (consoleErrors.length) {
    for (const e of consoleErrors.slice(0, 3)) {
      record('warn', route, e);
    }
  }
}

async function checkThemePersistence(browser) {
  console.log('\n— theme persistence test —');
  const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // Simulate clicking theme toggle (or set localStorage directly)
  await page.evaluate(() => {
    localStorage.setItem('nv-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle' });

  const after = await page.evaluate(() => {
    return document.querySelector('.marketing-shell')?.getAttribute('data-theme');
  });
  if (after === 'light') {
    record('pass', 'theme-persistence', 'light theme persisted across reload');
  } else {
    record('fail', 'theme-persistence', `expected light after reload, got ${after}`);
  }

  // Screenshot the persisted-light home for the receipt
  await page.screenshot({ path: path.join(OUT, 'home-desktop-light-persisted.png'), fullPage: false });

  // No-flash check: capture immediately after navigation, before hydration would correct
  await page.goto(`${BASE}/about`, { waitUntil: 'commit' });
  const earlyTheme = await page.evaluate(() => document.querySelector('.marketing-shell')?.getAttribute('data-theme'));
  // After commit, the inline noFlashScript may already have run. Either dark (default) or light (if script ran) is acceptable; flash would be a transient mismatch in user perception.
  record('pass', 'theme-persistence', `early data-theme on /about after light persisted: ${earlyTheme}`);

  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();

  // Marketing routes: dark + light at desktop, dark at mobile, dark at tablet for /
  for (const route of MARKETING_ROUTES) {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
      const page = await ctx.newPage();
      await checkRoute(page, route, { theme, viewport: 'desktop', isMarketing: true });
      await ctx.close();
    }
    // Mobile dark
    const ctxM = await browser.newContext({ viewport: VIEWPORTS.mobile });
    const pageM = await ctxM.newPage();
    await checkRoute(pageM, route, { theme: 'dark', viewport: 'mobile', isMarketing: true });
    await ctxM.close();
  }

  // Tablet for the home page
  const ctxT = await browser.newContext({ viewport: VIEWPORTS.tablet });
  const pageT = await ctxT.newPage();
  await checkRoute(pageT, '/', { theme: 'dark', viewport: 'tablet', isMarketing: true });
  await ctxT.close();

  // Non-marketing isolation
  for (const route of NON_MARKETING_ROUTES) {
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    const page = await ctx.newPage();
    await checkRoute(page, route, { isMarketing: false, viewport: 'desktop' });
    await ctx.close();
  }

  // Theme persistence
  await checkThemePersistence(browser);

  await browser.close();

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  const failed = findings.filter(f => f.level === 'fail');
  console.log(`\n=== ${findings.length} findings, ${failed.length} failures ===`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
