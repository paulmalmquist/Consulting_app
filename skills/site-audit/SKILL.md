---
id: site-audit
kind: skill
status: active
source_of_truth: true
topic: site-quality-audit
owners:
  - repo-b
  - frontend
intent_tags:
  - site audit
  - performance
  - design review
  - UX
  - login tour
triggers:
  - audit the site
  - tour paulmalmquist.com
  - test the site
  - review design
  - check site performance
  - mobile audit
when_not_to_use:
  - unit testing individual components in isolation
  - backend-only API testing
---

# Site Audit Skill

Full-site quality audit of paulmalmquist.com — covers performance, design,
domain usefulness (REPE + PDS), and AI synchronicity. Runs both desktop and
mobile viewports. Login as admin before touring.

---

## Execution Protocol

### 1. Login

Navigate to `https://paulmalmquist.com` (or the Vercel preview URL if testing a branch).

```
URL:      https://paulmalmquist.com
Admin:    admin@paulmalmquist.com  (or use env var SITE_ADMIN_EMAIL)
Password: (use env var SITE_ADMIN_PASSWORD)
```

After login, verify:
- Dashboard loads without blank widgets
- Winston command bar is visible
- Environment context header shows correct org name

---

### 2. Audit Dimensions

Score each dimension 1–5. Record findings in the output table.

| # | Dimension | What to Check |
|---|-----------|--------------|
| 1 | **Site Performance** | Page load time, query latency (check Network tab), API response times for `/api/re/v2/`, `/api/pds/v1/`, `/api/dev/v1/`. Flag any request >1500ms. |
| 2 | **Design + Layout Aesthetics** | Typography hierarchy, color contrast (dark theme), spacing consistency, card borders, table density, mobile responsiveness, empty states. |
| 3 | **REPE Domain Usefulness** | Fund list → Fund detail → Asset detail → Model builder → Waterfall. Do numbers look real? Is the data narrative clear to a real estate investor? |
| 4 | **PDS Domain Usefulness** | PDS Executive overview → Command Center → Project detail → AI query. Does it feel like a PM OS? Are risk scores meaningful? |
| 5 | **AI Synchronicity** | Winston chat → ask "show me fund performance", "summarize construction projects", "generate a monthly dashboard". Rate: intent accuracy, latency, block rendering quality, follow-up coherence. |

---

### 3. Tour Sequence (Desktop — 1440×900)

Run in this order:

1. **Home / Environments list** — `/lab/environments`
2. **REPE Fund list** — `/lab/env/{envId}/re/funds`
3. **REPE Fund detail** — click Meridian Real Estate Fund III
4. **REPE Asset detail** — click any asset
5. **Development portfolio** — `/lab/env/{envId}/re/development`
6. **Development project detail** — click any project
7. **PDS Command Center** — `/lab/env/{envId}/pds`
8. **PDS AI Query** — ask "what projects are at risk?"
9. **Model Builder** — `/lab/env/{envId}/re/models` → open any model → run
10. **Winston chat** — open command bar, ask: `"summarize fund performance across all assets"`
11. **Dashboard builder** — ask Winston to `"build me a monthly operating report"`

---

### 4. Tour Sequence (Mobile — 390×844, iPhone 14 viewport)

Repeat these stops on mobile:

1. **REPE Fund list** — verify KPI strip stacks correctly
2. **Asset detail** — verify cockpit panels scroll without overflow
3. **PDS Command Center** — verify KPI strip and project table readable
4. **Development portfolio** — verify spend chart renders
5. **Winston command bar** — tap open, type query, verify SSE stream renders blocks

---

### 5. Performance Benchmarks

Flag as ❌ failing if:

| Metric | Threshold |
|--------|-----------|
| Initial page load (LCP) | > 3000ms |
| API: `/api/re/v2/funds` | > 800ms |
| API: `/api/pds/v1/command-center` | > 1200ms |
| API: `/api/dev/v1/portfolio` | > 800ms |
| Winston first SSE event | > 2000ms |
| Winston full response | > 8000ms |

Use browser DevTools Network panel. Record p50 across 3 requests.

---

### 6. Design Checklist

- [ ] Dark theme consistent — no white flash on load
- [ ] Typography: font-mono labels uppercase tracking on all section headers
- [ ] KPI strip chips align horizontally, don't wrap on 1440px
- [ ] Tables: row height consistent (~44px), header text muted, value text bright
- [ ] Charts: recharts AreaChart fills correctly, tooltips readable
- [ ] Empty states: centered, muted text, no broken borders
- [ ] Mobile: no horizontal scroll on 390px viewport
- [ ] Mobile: touch targets ≥ 44px
- [ ] Badges (health chips, stage chips): color-coded, legible at small size

---

### 7. Output Format

Return findings as:

```markdown
## Site Audit — {date} — {viewport}

### Scores
| Dimension | Score (1-5) | Notes |
|-----------|-------------|-------|
| Performance | X | ... |
| Design | X | ... |
| REPE Usefulness | X | ... |
| PDS Usefulness | X | ... |
| AI Synchronicity | X | ... |
| **Overall** | **X** | |

### Performance Findings
- [page/endpoint] — [latency]ms — [pass/fail]

### Design Findings
- [finding] — [severity: low/medium/high] — [fix suggestion]

### REPE Domain Findings
- [finding]

### PDS Domain Findings
- [finding]

### AI Synchronicity Findings
- [intent tested] → [accuracy] → [latency] → [block quality]

### Top 3 Priorities
1. ...
2. ...
3. ...
```

---

### 8. Automated Variant (k6 / Playwright)

For CI integration, the following scripts live at:
- `repo-b/tests/perf/site_tour.js` — k6 script hitting all key API endpoints
- `repo-b/tests/e2e/site_audit.spec.ts` — Playwright E2E tour (when added)

To run locally:
```bash
k6 run repo-b/tests/perf/site_tour.js \
  -e BASE_URL=https://paulmalmquist.com \
  -e ADMIN_EMAIL=$SITE_ADMIN_EMAIL \
  -e ADMIN_PASSWORD=$SITE_ADMIN_PASSWORD
```
