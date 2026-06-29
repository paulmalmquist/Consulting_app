---
id: winston-site-evolution-prompt
kind: prompt
status: active
source_of_truth: true
topic: site-positioning-and-product-polish
owners:
  - docs
  - repo-b
  - novendor-site
intent_tags:
  - site
  - positioning
  - meta-description
  - OG tags
  - homepage
  - marketing
  - enterprise trust
  - novendor
  - winston landing
triggers:
  - "site evolution"
  - "upgrade the site"
  - "improve positioning"
  - "fix the homepage"
  - "novendor site changes"
  - "winston landing page"
  - "meta description"
  - "OG tags"
  - "enterprise trust signals"
entrypoint: true
handoff_to:
  - feature-dev
  - frontend
when_to_use: "Use when upgrading the public-facing surfaces of paulmalmquist.com (Winston app) or coordinating improvements to novendor.ai (marketing site). Covers meta tags, OG cards, landing page positioning, enterprise trust signals, and the bridge between product depth and marketing messaging."
when_not_to_use: "Don't use for internal app features, backend services, or AI gateway changes. Don't use for novendor.ai code changes directly — that site is hosted externally (not in this repo). This prompt covers Winston app code changes (repo-b) and produces copy/content specs for novendor.ai that must be applied in the external CMS."
surface_paths:
  - repo-b/src/app/layout.tsx
  - repo-b/src/app/page.tsx
  - repo-b/public/
  - docs/site-improvements/
---

# Winston & Novendor Site Evolution Prompt

> **Scope:** Upgrade all public-facing surfaces across paulmalmquist.com (Winston app, code in repo-b) and novendor.ai (marketing site, external CMS). Every file path references real code. Every copy suggestion is grounded in what the live product actually contains as of 2026-03-20.

## Role

You are a senior frontend engineer and positioning strategist working inside this monorepo. You have admin access to the live Winston app at paulmalmquist.com. You understand that novendor.ai is the marketing site (hosted externally, not in this repo) and paulmalmquist.com is the product (deployed from repo-b via Vercel).

## Current State

### What works today

**paulmalmquist.com (Winston app — repo-b):**
- 273+ pages across 7 industry verticals (REPE, Credit, Legal, Medical, PDS, Consulting, ECC)
- 5 active production environments: StonePDS, Meridian Apex Holdings, Meridian Capital Management, Novendor, flaverker
- AI Gateway online, all environments HEALTHY
- REPE environment: 3 funds, $2B commitments, $1.4B NAV, 34 active assets, 12 institutional LPs
- PDS environment: Command Center with intervention queues, financial signals ($2.5M fee revenue, $4.7M backlog)
- Winston AI copilot with domain-specific prompts (waterfall runs, stress tests, LP distributions)
- Clean design system: Inter/Inter Tight/JetBrains Mono, HSL token-based theming, light/dark modes

**novendor.ai (marketing site — external CMS):**
- 10+ pages: Home, About, REPE, Credit, Medical, Legal, Operational Assessment, AI Concierge, SaaS Iceberg, Contact
- Strong positioning: practitioner-level REPE and Credit industry pages
- Effective anti-SaaS differentiation (SaaS Iceberg, "execution ownership" framing)
- AI Concierge page has strong enterprise safeguards section
- Consistent CTA pattern: "Book an AI Execution Session" / "Book strategy call"

### What is missing

**paulmalmquist.com:**
1. Meta description is generic: "Institutional business intelligence platform" — could be Tableau
2. No Open Graph tags — link shares in Slack/email render with no image and weak text
3. No OG image asset in `repo-b/public/`
4. No favicon (only `winstonpic.png` in public/)
5. Homepage is a bare login gate — no positioning context for prospects who receive the URL
6. No `robots.txt` or `sitemap.xml`

**novendor.ai:**
1. /the-shift page returns 404 (broken top-level nav link)
2. Homepage hero subheading has grammar break: "...AI-native workflows Built for leaders..." (capital B mid-sentence)
3. About page names no founder — "operators with deep experience" with no evidence
4. SaaS Iceberg self-assessment checklist has no result/conversion path
5. REPE page strongest copy ("Why It Breaks") is below the fold
6. Homepage has zero trust signals — no deployment references, no client signals, no AUM
7. No connection between the product depth (visible in the app) and marketing claims

---

## Part 1 — Winston App (paulmalmquist.com / repo-b)

### 1.1 Meta Description and OG Tags

**File to modify:** `repo-b/src/app/layout.tsx`, lines 6–9

**Current state:**
```typescript
export const metadata: Metadata = {
  title: "Winston",
  description: "Institutional business intelligence platform"
};
```

**Replace with:**
```typescript
export const metadata: Metadata = {
  title: "Winston",
  description:
    "AI execution environment for real estate private equity, project delivery, and institutional operations. Fund reporting, waterfall logic, capital activity, and portfolio monitoring.",
  openGraph: {
    title: "Winston — AI Execution Environment",
    description:
      "Fund reporting, waterfall logic, capital activity, and portfolio monitoring. Built for institutional operations.",
    siteName: "Winston",
    type: "website",
    url: "https://paulmalmquist.com",
    images: [
      {
        url: "/og-winston.png",
        width: 1200,
        height: 630,
        alt: "Winston — AI Execution Environment for Institutional Operations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Winston — AI Execution Environment",
    description:
      "Fund reporting, waterfall logic, capital activity, and portfolio monitoring. Built for institutional operations.",
    images: ["/og-winston.png"],
  },
  robots: {
    index: false,
    follow: false,
  },
};
```

**Why `robots: noindex`:** This is an authenticated app, not a marketing site. We want rich link previews when the URL is shared, but we don't want search engines indexing login pages. The marketing surface is novendor.ai.

**Verification:** Deploy to Vercel preview. Share the preview URL in Slack. Confirm the OG card renders with title, description, and image.

---

### 1.2 OG Image Asset

**File to create:** `repo-b/public/og-winston.png`

**Spec:** 1200×630px, dark background matching the app's dark theme (`hsl(216 31% 6%)`).

**Content layout:**
```
┌──────────────────────────────────────────────┐
│                                              │
│   Winston                                    │
│                                              │
│   AI Execution Environment                   │
│   for Institutional Operations               │
│                                              │
│   Fund Reporting · Waterfall Logic           │
│   Capital Activity · Portfolio Monitoring    │
│                                              │
│                          novendor.ai         │
│                                              │
└──────────────────────────────────────────────┘
```

**Typography:** Inter Tight 700 for "Winston", Inter 500 for body text. Colors: white text on dark slate background. Accent line in primary blue (`hsl(216 52% 48%)`).

**Generation approach:** Use the canvas-design skill or create programmatically with Sharp/Canvas in a Node script. Keep it clean and institutional — no gradients, no stock imagery, no decorative elements.

---

### 1.3 Favicon

**File to create:** `repo-b/public/favicon.ico` (32×32) and `repo-b/src/app/icon.png` (for Next.js app icon convention)

**Design:** Minimal "W" mark in the primary blue on transparent background. Use Inter Tight 700.

**Add to layout.tsx:**
```typescript
// Next.js 14 handles favicon automatically from app/icon.png
// But add explicit link for broader compatibility:
icons: {
  icon: "/favicon.ico",
  apple: "/apple-touch-icon.png",
},
```

---

### 1.4 Homepage — Add Positioning Context

**File to modify:** `repo-b/src/app/page.tsx`

**Current state:** Bare login gate — heading "Winston", subheading "Select your access path to continue", two login buttons.

**The problem this creates:** When someone receives the paulmalmquist.com URL — from a sales call, email forward, or conference mention — they land on a page that tells them nothing about what Winston is. The URL is shared in enterprise contexts where the link preview (fixed by 1.1) gets them to click, but the landing page doesn't reinforce the positioning.

**Replace with:**
```tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bm-bg px-6">
      <div className="w-full max-w-lg space-y-10 text-center">
        {/* Positioning block */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-display">Winston</h1>
          <p className="text-bm-muted text-sm max-w-md mx-auto leading-relaxed">
            AI execution environment for real estate private equity,
            project delivery, and institutional operations.
          </p>
        </div>

        {/* Login controls */}
        <div className="flex flex-col gap-4">
          <Link
            href="/login?loginType=admin"
            className={buttonVariants({ variant: "primary" })}
          >
            Login as Admin
          </Link>
          <Link
            href="/login?loginType=environment"
            className={buttonVariants({ variant: "secondary" })}
          >
            Login to Environment
          </Link>
        </div>

        {/* Prospect path */}
        <div className="pt-2 border-t border-bm-border">
          <p className="text-bm-muted text-xs mb-2">Not yet on Winston?</p>
          <a
            href="https://novendor.ai/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bm-accent text-sm font-medium hover:underline"
          >
            Request a walkthrough →
          </a>
        </div>
      </div>
    </main>
  );
}
```

**What changed:**
1. Subheading changed from "Select your access path to continue" to the positioning statement
2. Added prospect CTA that links to novendor.ai/contact
3. Widened max-width from `max-w-md` to `max-w-lg` to accommodate longer text
4. Added border separator between login controls and prospect path

**Verification:** `npm run dev` → visit localhost:3000. Confirm positioning text renders, login buttons work, prospect link opens novendor.ai/contact in new tab.

---

### 1.5 Robots.txt

**File to create:** `repo-b/public/robots.txt`

```
User-agent: *
Disallow: /admin
Disallow: /lab
Disallow: /app
Disallow: /api
Disallow: /login
Allow: /

Sitemap: https://paulmalmquist.com/sitemap.xml
```

**Reasoning:** Allow the homepage to be crawled (for link preview purposes) but block all authenticated routes.

---

## Part 2 — Novendor.ai (Marketing Site — External CMS)

These changes must be applied in the external CMS where novendor.ai is hosted. This section provides exact copy and specifications.

### 2.1 Fix /the-shift 404

**Page to create:** `/the-shift`

**Option A (recommended):** Create the page using the "The Shift" content already on the About page, expanded into a standalone essay.

**Heading:** The Shift

**Body structure:**
```
Section 1: "AI is lowering the cost of intelligence"
→ Expand the existing About page copy about why businesses no longer need
  to rent operating logic from vendors.

Section 2: "From tool dependency to execution ownership"
→ The three-part progression: (1) SaaS era — rented everything,
  (2) AI inflection — intelligence became cheap, (3) Ownership era —
  build what you should have always owned.

Section 3: "What this means for your firm"
→ Tie back to the operational assessment: if you're still renting your
  fund reporting, waterfall logic, and LP communications from disconnected
  SaaS tools, the shift has already started without you.

CTA: "See where your firm stands → [Request an Operational Assessment]"
```

**Option B (quick fix):** Remove "The Shift" from the top-level nav and keep it as a section on the About page. Less ideal — the content is strong enough for its own page.

---

### 2.2 Homepage Hero — Fix Subheading

**Current copy:**
```
Consulting engagements to show measurable ROI using AI-native workflows Built for leaders under real pressure to modernize.
```

**Problem:** Capital "B" mid-sentence (lost line break). "To show" is passive.

**Replace with:**
```
Execution engagements that deliver measurable ROI — not strategy decks.
Built for operations leaders under real pressure to modernize.
```

**What changed:** Fixed grammar, replaced passive "to show" with active "deliver", added negative differentiator ("not strategy decks").

---

### 2.3 About Page — Add Named Founder Section

**Insert after** the "Our Philosophy" / capabilities section, **before** the CTA.

**New section:**

```
WHO WE ARE

Novendor is led by Paul Malmquist. Background in real estate private equity
technology, fund operations, and enterprise data systems. Built reporting
infrastructure, waterfall engines, and portfolio monitoring platforms used
by investment teams managing institutional capital.

The workflows Winston automates — waterfall calculations, LP reporting,
capital call processing, portfolio monitoring — are workflows we built
and operated. This is not a firm that learned REPE from a slide deck.
```

**Why this matters:** The live Winston app contains a $2B demo portfolio with BlackRock, CalPERS, and Duke Endowment as LPs, multi-fund waterfall execution, and an AI copilot that suggests "Stress all assets with 75bps cap rate expansion." The person who built this has practitioner credibility. The marketing site should claim it.

---

### 2.4 Homepage — Add Enterprise Trust Signal

**Insert below** the hero section, **above** the offerings grid.

**New element:**

```
Deployed across fund operations, project delivery, and executive command
workflows at institutional scale. Five active verticals. AI gateway online.
```

**Design:** Single line, smaller text, muted color. Not a banner — a quiet credibility signal. Think "AWS" trust bar, not a testimonial carousel.

**Why this matters:** The homepage lists nine capability categories but cites zero evidence. A sophisticated buyer notices the absence. One line bridges the gap between "interesting pitch" and "firm worth a call."

---

### 2.5 SaaS Iceberg — Wire Self-Assessment to Result

**Current state:** The "Where are you compensating?" checklist asks visitors to check statements about organizational dysfunction. Checking boxes has no visible outcome — no score, no result, no next step.

**Add after checklist interaction:**

```
── Result frame (appears after 3+ checks) ──

If you checked 3 or more:

You're not paying for software. You're paying for organizational avoidance.
The good news — these are solvable with structure, not more tools.

[Map what you're actually paying for → Request an Operational Assessment]

── Result frame (appears after 1-2 checks) ──

Even one checked box means you're compensating around your tools instead of
operating through them. That's worth a 30-minute conversation.

[Book a strategy call →]
```

**Implementation:** This likely requires JavaScript/interaction logic in the CMS. The checklist should track checked count and reveal the appropriate result frame.

---

### 2.6 REPE Industry Page — Elevate "Why It Breaks"

**Current hero section:**
```
Make Fund Math Deterministic

Replace spreadsheet-dependent fund operations with controlled execution
across underwriting, waterfall logic, capital activity, and investor reporting.
```

**Add between hero headline and objective:**
```
Make Fund Math Deterministic

"Waterfall logic shouldn't be defended from spreadsheets.
It should be governed from a controlled source."

Replace spreadsheet-dependent fund operations with controlled execution
across underwriting, waterfall logic, capital activity, and investor reporting.
```

**What changed:** Inserted one pull-quote from the "Why It Breaks" section into the hero. This creates a pattern interrupt — the buyer sees their own problem reflected before seeing the solution.

---

### 2.7 Contact Page — Add Placeholder Prompts

**Current state:** The "What problem are you trying to solve?" field is an open text area with no guidance.

**Add placeholder text:**

```
e.g., "We're rebuilding our LP reporting process and evaluating whether to
buy or build" or "Our fund accounting runs on 6 different spreadsheets and
we need a controlled system"
```

**Why this matters:** Open text fields at this stage create friction. Placeholder examples lower the barrier and signal the kind of conversations Novendor has — specific, operational, not vague "digital transformation."

---

### 2.8 Global — Footer Copyright Year

**Current state on novendor.com (old domain):** "Copyright © 2024 No Vendor"

**If novendor.ai has a similar footer:** Update to "© 2026 Novendor" — correct year, correct entity name (one word, not two).

---

## Part 3 — OG Image Generation Script

For producing the Winston OG image programmatically:

**File to create:** `repo-b/scripts/generate-og-image.mjs`

```javascript
import { createCanvas } from "canvas";
import fs from "fs";

const WIDTH = 1200;
const HEIGHT = 630;
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

// Background — matches app dark theme hsl(216 31% 6%)
ctx.fillStyle = "#0d1117";
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// Accent line — primary blue hsl(216 52% 48%)
ctx.fillStyle = "#3b6eb5";
ctx.fillRect(60, 80, 4, 120);

// "Winston" heading
ctx.fillStyle = "#e8ecf1";
ctx.font = "bold 64px Inter";
ctx.fillText("Winston", 84, 145);

// Subtitle
ctx.fillStyle = "#8b95a5";
ctx.font = "500 28px Inter";
ctx.fillText("AI Execution Environment", 84, 210);
ctx.fillText("for Institutional Operations", 84, 250);

// Capability line
ctx.fillStyle = "#5a6577";
ctx.font = "400 20px Inter";
ctx.fillText(
  "Fund Reporting  ·  Waterfall Logic  ·  Capital Activity  ·  Portfolio Monitoring",
  84,
  330
);

// Domain
ctx.fillStyle = "#3b6eb5";
ctx.font = "500 18px Inter";
ctx.fillText("novendor.ai", 1020, 580);

// Write file
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync("public/og-winston.png", buffer);
console.log("Generated public/og-winston.png");
```

**Run:** `node repo-b/scripts/generate-og-image.mjs`

**Dependency:** Requires `canvas` package. Install with `npm install canvas --save-dev` in repo-b.

---

## Implementation Order

### Phase 1 — Ship Today (< 30 minutes total)

| Step | What | Where | Time |
|---|---|---|---|
| 1 | Update meta description + OG tags | `repo-b/src/app/layout.tsx` | 5 min |
| 2 | Generate and add OG image | `repo-b/public/og-winston.png` | 15 min |
| 3 | Add favicon | `repo-b/public/favicon.ico`, `repo-b/src/app/icon.png` | 10 min |
| 4 | Add robots.txt | `repo-b/public/robots.txt` | 2 min |

**Verify:** Deploy to Vercel preview. Share URL in Slack. Confirm OG card renders correctly.

### Phase 2 — Ship This Week (< 2 hours total)

| Step | What | Where | Time |
|---|---|---|---|
| 5 | Upgrade homepage with positioning + prospect CTA | `repo-b/src/app/page.tsx` | 20 min |
| 6 | Fix /the-shift 404 | novendor.ai CMS | 30 min |
| 7 | Fix homepage hero grammar | novendor.ai CMS | 5 min |
| 8 | Add founder section to About | novendor.ai CMS | 20 min |
| 9 | Add homepage trust signal | novendor.ai CMS | 10 min |

**Verify:** Visit novendor.ai, confirm /the-shift loads, hero reads cleanly, About page names Paul. Visit paulmalmquist.com, confirm positioning text and prospect link render.

### Phase 3 — Ship Within Two Weeks

| Step | What | Where | Time |
|---|---|---|---|
| 10 | Wire SaaS Iceberg self-assessment | novendor.ai CMS | 2 hrs |
| 11 | Elevate REPE "Why It Breaks" | novendor.ai CMS | 15 min |
| 12 | Contact page placeholder prompts | novendor.ai CMS | 10 min |
| 13 | Update footer year/name | novendor.ai CMS | 5 min |

---

## Acceptance Criteria

### paulmalmquist.com
- [ ] Meta description contains "AI execution environment" and names at least 3 REPE workflows
- [ ] OG card renders in Slack with image, title, and description
- [ ] Homepage shows positioning statement above login buttons
- [ ] Homepage includes "Request a walkthrough" link to novendor.ai/contact
- [ ] Favicon renders in browser tabs
- [ ] robots.txt blocks /admin, /lab, /app, /api, /login

### novendor.ai
- [ ] /the-shift returns 200 with content (not 404)
- [ ] Homepage hero subheading has no grammar break (no capital "B" mid-sentence)
- [ ] About page names Paul Malmquist with domain-specific credentials
- [ ] Homepage includes at least one enterprise trust signal below the hero
- [ ] SaaS Iceberg self-assessment shows a result frame after 3+ checked items
- [ ] REPE page hero includes one "Why It Breaks" pull-quote
- [ ] Contact page "What problem" field has placeholder text with example prompts
- [ ] Footer shows "© 2026 Novendor" (not "2024 No Vendor")

### Cross-Site
- [ ] novendor.ai and paulmalmquist.com use consistent language: "AI execution environment", "institutional operations", specific workflow names (waterfall, LP reporting, capital activity)
- [ ] Both sites link to each other: paulmalmquist.com prospect CTA → novendor.ai/contact; novendor.ai "Book" CTAs should reference paulmalmquist.com as the product URL where appropriate

---

## Files Changed Summary

| File | Change | Phase |
|---|---|---|
| `repo-b/src/app/layout.tsx` | Meta description, OG tags, favicon, robots | 1 |
| `repo-b/src/app/page.tsx` | Homepage positioning + prospect CTA | 2 |
| `repo-b/public/og-winston.png` | New file — OG image | 1 |
| `repo-b/public/favicon.ico` | New file — favicon | 1 |
| `repo-b/src/app/icon.png` | New file — app icon | 1 |
| `repo-b/public/robots.txt` | New file — crawler rules | 1 |
| `repo-b/scripts/generate-og-image.mjs` | New file — OG image generator | 1 |
| novendor.ai /the-shift | New page (external CMS) | 2 |
| novendor.ai homepage hero | Copy fix (external CMS) | 2 |
| novendor.ai /about | Add founder section (external CMS) | 2 |
| novendor.ai homepage | Add trust signal (external CMS) | 2 |
| novendor.ai /saas-iceberg | Wire self-assessment result (external CMS) | 3 |
| novendor.ai /industries/real-estate-private-equity | Elevate hero copy (external CMS) | 3 |
| novendor.ai /contact | Add placeholder text (external CMS) | 3 |
| novendor.ai footer | Update year/name (external CMS) | 3 |

---

## Key Principle

**The product is ahead of the marketing.** The live Winston app — with multi-vertical environments, institutional-grade fund portfolios, domain-specific AI, and operational depth across REPE, PDS, Credit, Legal, Medical, and Consulting — is significantly more impressive than what either site communicates. Every change in this prompt exists to close that gap: let the product's actual depth show through the public-facing surfaces.
