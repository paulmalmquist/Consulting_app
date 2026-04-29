// Targeted smoke for the HeroBackground / capability changes.
// Does not duplicate the Wave A pass — only checks the deltas.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), '../docs/receipts/marketing-redesign/wave-a/bg');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';
const findings = [];
function log(level, route, msg) {
  findings.push({ level, route, msg });
  console.log(`${level === 'pass' ? '✓' : level === 'warn' ? '!' : '✗'} [${route}] ${msg}`);
}

const ROUTES = [
  { path: '/', expectHeroBg: true, expectPanel: false, lede: 'practical way' },
  { path: '/industries/real-estate-private-equity', expectHeroBg: true },
  { path: '/industries/consumer-credit', expectHeroBg: true },
  { path: '/industries/medical', expectHeroBg: true },
  { path: '/industries/legal', expectHeroBg: true },
  { path: '/capabilities', expectIndex: true },
  { path: '/capabilities/comprehensive-data-strategy', expectCapability: true },
];

const browser = await chromium.launch();
for (const r of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const resp = await page.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 30000 });
  if (!resp || !resp.ok()) {
    log('fail', r.path, `HTTP ${resp?.status()}`);
    await ctx.close();
    continue;
  }

  const data = await page.evaluate(() => {
    const heroBg = document.querySelector('.nv-hero-bg');
    const heroPanel = document.querySelector('.nv-hero-panel');
    const heroFallback = document.querySelector('.nv-hero-bg__fallback');
    const heroImg = document.querySelector('.nv-hero-bg__img');
    const lede = document.querySelector('.nv-lede');
    const ledeText = lede ? lede.textContent : null;
    const cards = document.querySelectorAll('.nv-card').length;
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const h1Family = (() => {
      const h1 = document.querySelector('h1');
      return h1 ? window.getComputedStyle(h1).fontFamily : null;
    })();
    return { hasHeroBg: !!heroBg, hasHeroPanel: !!heroPanel, hasFallback: !!heroFallback, hasImg: !!heroImg, ledeText, cards, overflowX, h1Family };
  });

  if (r.expectHeroBg) {
    if (data.hasHeroBg) log('pass', r.path, `hero-bg present (image=${data.hasImg ? 'yes' : 'no, fallback=' + data.hasFallback})`);
    else log('fail', r.path, 'hero-bg expected but missing');
  }
  if (r.expectPanel === false && data.hasHeroPanel) {
    log('fail', r.path, 'engagement-model panel still present (should be removed)');
  }
  if (r.expectPanel === false && !data.hasHeroPanel) {
    log('pass', r.path, 'no engagement-model panel');
  }
  if (r.lede && data.ledeText && !data.ledeText.includes(r.lede)) {
    log('fail', r.path, `lede missing expected phrase "${r.lede}"`);
  } else if (r.lede) {
    log('pass', r.path, `lede contains "${r.lede}"`);
  }
  if (r.expectIndex) {
    if (data.cards >= 4) log('pass', r.path, `index has ${data.cards} capability cards`);
    else log('fail', r.path, `index has ${data.cards} cards, expected >= 4`);
  }
  if (r.expectCapability) {
    if (data.h1Family && /Abadi/i.test(data.h1Family)) log('pass', r.path, `capability page Abadi h1 OK`);
    else log('warn', r.path, `capability page h1 family: ${data.h1Family}`);
  }
  if (data.overflowX) log('fail', r.path, `horizontal overflow`);

  // screenshot
  const slug = r.path === '/' ? 'home' : r.path.replace(/^\//, '').replace(/\//g, '_');
  await page.screenshot({ path: path.join(OUT, `${slug}.png`), fullPage: false });

  if (errors.length) for (const e of errors) log('warn', r.path, `pageerror: ${e}`);
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
const failed = findings.filter((f) => f.level === 'fail');
console.log(`\n=== ${findings.length} findings, ${failed.length} failures ===`);
process.exit(failed.length === 0 ? 0 : 1);
