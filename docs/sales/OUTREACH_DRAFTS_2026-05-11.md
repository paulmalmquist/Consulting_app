# Outreach Drafts — 2026-05-11
**Owner:** Paul Malmquist  
**Channel:** LinkedIn DM (primary) + email drafts to info@novendor.ai

These are ready to send. Each section has a LinkedIn version (under 80 words) and an email version.

---

## Tier 1 — Active Pipeline (needs immediate follow-up)

### 1. Hall Boys — Sarat Vemuri, CFO & CIO

**Status:** Engaged. First call was 2026-04-23. No follow-up logged. This is overdue.

**LinkedIn DM:**

> Sarat — following up from our April call. I've been building out the fund reporting module and wanted to show you what the LP portfolio view looks like with real data behind it. Would 20 minutes this week or next work?

**Email (to saratvemuri@hallboys.com):**

> Subject: Winston — quick follow-up from April
>
> Sarat,
>
> Following up on our April 23rd call. Since then I've refined the fund reporting piece significantly — particularly the LP-level portfolio view and the quarterly report generation.
>
> I'd like to show you what it looks like against a realistic data model. If you can share a sample file (even anonymized), I can have a demo ready in 48 hours. Otherwise I can run it against a comparable portfolio and walk you through the mechanics.
>
> What does your schedule look like this week or next?
>
> Paul

**Log this in CRM:** Update Hall Boys opportunity with thesis and Winston angle. Schedule follow-up task for today.

---

### 2. Service Logic (via Emergere) — Yogendran Periyannan

**Status:** Qualified. Paul cleared technical screen 4/30. Emergere should be pitching Paul to Service Logic now.

**LinkedIn DM:**

> Yogendran — wanted to check in. Any update on the Service Logic submission? I'm still very interested in the Data Platform Architect role and can make time for any next steps on their end.

**Email:**

> Subject: Service Logic — follow-up
>
> Yogendran,
>
> Hope the week's going well. Following up on the Service Logic engagement — last we spoke you were going to pitch me to them after our technical discussion on 4/30.
>
> Is there a timeline I should know about, or anything else you need from my end to move the submission forward?
>
> Paul

---

### 3. National Christian Foundation — No contact yet

**Status:** Qualified but no primary contact in CRM. This needs a contact added before outreach.

**Action:** Find the VP of Operations or CIO at NCF. NCF is a large nonprofit in Atlanta — LinkedIn search: "National Christian Foundation VP Technology" or "National Christian Foundation Operations".

**Draft LinkedIn DM (once contact identified):**

> Hi [Name], quick question about how NCF manages the operational side of complex gift processing — particularly real estate donations. We built something that might be directly relevant to your team. Would a short call make sense?

---

## Tier 2 — Contacted Stage, Ready for LinkedIn Outreach

These accounts show stage = "contacted" but have no primary contact and no last outreach logged. Priority order based on firm quality and AUM profile.

---

### 4. Heitman

**Who to target:** Head of Technology, VP Finance, or Chief Operating Officer at Heitman (Chicago-based, $18B+ AUM, institutional REPE)

**LinkedIn DM:**

> Hi [Name], I work with REPE fund teams on a specific problem — the gap between your source systems (Yardi, Argus) and what you can actually show your LPs or leadership without a week of analyst work. We solved that. Would a quick demo be worth 15 minutes?

**Email (if you find address):**

> Subject: Fund reporting gap at Heitman
>
> [Name],
>
> We built a financial intelligence layer for REPE fund teams that pulls from Yardi, Argus, and Excel and turns it into live fund analytics and investor reports — without any data engineering on your team's end.
>
> I know Heitman runs a serious operation. I'm not pitching a toy. Happy to run a demo against a real fund model and let you judge whether it's relevant.
>
> Paul Malmquist | Novendor | paul@novendor.ai

---

### 5. CrossHarbor Capital Partners

**Who to target:** CFO or VP Finance (Boston-based credit and real estate)

**LinkedIn DM:**

> Hi [Name] — quick question. With the rate environment compressing levered returns, are you running real-time sensitivities on your REPE portfolio or is that still a manual exercise before LP calls? We built something that makes that answer immediate. Worth a look?

---

### 6. Artemis Real Estate Partners

**Who to target:** CFO, COO, or Director of Finance (Washington DC, women-led REPE, $9B+ AUM)

**LinkedIn DM:**

> Hi [Name] — Artemis is doing interesting work across the capital stack. Quick question: how much analyst time goes into assembling your quarterly LP reports? We compressed that from weeks to same-day for comparable funds. Happy to show you what that looks like.

---

### 7. Bell Partners

**Who to target:** CFO or VP Finance (multifamily REPE, Greensboro NC, 80,000+ units)

**LinkedIn DM:**

> Hi [Name] — multifamily at Bell's scale generates a lot of reporting work. We work with fund teams to automate the fund-to-asset-to-LP reporting chain so your analysts spend time on decisions, not formatting. Worth a 15-minute look?

---

### 8. Pennybacker Capital

**Who to target:** CFO or Principal (Austin-based, value-add commercial)

**LinkedIn DM:**

> Hi [Name] — question about your reporting workflow. Are your quarterly fund reports still a manual assembly process? We built a system that turns Yardi and Excel data into live portfolio dashboards and investor reports automatically. Happy to demo if it's relevant.

---

### 9. TerraCap Management

**Who to target:** CFO or Director of Finance (Tampa, value-add office/industrial)

**LinkedIn DM:**

> Hi [Name] — with office market stress putting pressure on value-add return profiles, how are you communicating with LPs around portfolio performance? We built a tool that makes that conversation a lot cleaner. Worth a quick demo?

---

## CRM Fixes Needed Before Sending

The following gaps should be fixed in the CRM before logging outreach:

1. **Hall Boys** — add `thesis`, `pain`, `winston_angle` to the opportunity record
2. **National Christian Foundation** — add primary contact
3. **All "contacted" stage deals** — add `winston_angle` (currently MISSING on all of them)
4. **10+ "research" stage deals** — still missing all three fields (Harbert, Longfellow, Westbrook, DivcoWest, etc.) — de-prioritize for now, fix thesis/pain/angle before advancing to "identified"

---

## Sending Protocol

1. Send LinkedIn DMs first — less friction, easier to track opens
2. Log each send in CRM via `crm_activity` with `activity_type = 'linkedin_outreach'`
3. Follow up exactly 4 business days later with the follow-up template
4. If they respond, move stage to `engaged` and schedule a call within 48 hours
5. For email: draft in info@novendor.ai Outlook, send from there, BCC yourself at paulmalmquist@gmail.com for logging
