/**
 * articles.ts — source of truth for the Novendor articles surface.
 *
 * Content layout convention inside `body`:
 *   - Paragraphs are separated by a blank line.
 *   - Lines beginning with "## " render as h2.
 *   - Everything else renders as <p>.
 *
 * Deliberately kept as a TS module (not MDX, not a CMS) so the first week
 * of content can ship without new build tooling. If volume justifies it,
 * migrate to MDX or a Supabase-backed articles table later.
 */

export type Article = {
  slug: string;
  title: string;
  dek: string;
  author: string;
  publishedOn: string;
  readingMinutes: number;
  tag: string;
  body: string;
};

export const ARTICLES: Article[] = [
  {
    slug: "argus-sunset-clock-running",
    title: "If You're on ARGUS Standalone, the Clock Is Running",
    dek: "Altus is sunsetting ARGUS Standalone. The interesting decision isn't which product replaces it. It's what your stack was actually doing for you.",
    author: "Paul Malmquist",
    publishedOn: "2026-04-20",
    readingMinutes: 5,
    tag: "Operating systems",
    body: `Altus is sunsetting ARGUS Standalone. If you're a real estate private equity firm still running the desktop product for underwriting or asset-level modeling, you already know this, and you already know the pitch from your rep: upgrade to ARGUS Enterprise, pay more, and get features you probably already replicate in Excel.

That's one option. It's not the most interesting one.

The more useful question isn't "what replaces ARGUS Standalone." It's "what was ARGUS actually doing for your team, and is that still the job you need done in 2026."

## What ARGUS was actually for

For a long time, ARGUS was the thing that made a rent roll projectable. You loaded a property, you built a cash flow, you argued with your analyst about the leasing assumption, and you exported to a memo. The product solved a real problem. No one wants to project 120-tenant office buildings in Excel. When the alternative was "write your own DCF macro," ARGUS was obvious.

The quiet thing that's happened is that the shape of the work has moved. Most firms no longer live in the property DCF the way they used to. They live in the rollup. They live in the fund-level view, the LP reporting pack, the quarter close, and the question of whether last quarter's numbers agree with this quarter's numbers. The cash flow model is still there, but it's stopped being the thing that takes the time.

The time goes into reconciliation. Into stitching Yardi data into Excel, stitching Excel into a PDF pack, and stitching the pack into the quarterly letter. ARGUS, for all its value, doesn't touch any of that.

## What "replacing ARGUS" usually means

The standard path is a like-for-like swap. Firms look at ARGUS Enterprise, Juniper Square, Dealpath, or Yardi Investment Management and ask which one has the most comparable property-level modeling. They pay attention to the cash flow engine, the reporting templates, the integration with their accounting system.

It's reasonable. It also tends to produce a predictable outcome, which is that the new platform does roughly what the old platform did, sometimes a little better, and the actual bottleneck in the operation is unchanged.

You still reconcile. You still export. You still assemble the LP pack by hand. The close cycle doesn't shrink, because the close cycle was never really about the property model in the first place.

## The alternative frame

Here's a different way to think about it. Instead of replacing the property DCF, replace the layer above it.

Build, or buy, something that reads your property data wherever it lives, reconciles it against the GL, produces a fund rollup you can trust, and surfaces the narrative you need to send to LPs without an analyst rebuilding it from scratch every quarter. In that world, the property model is a commodity. You can keep using ARGUS if you want. You can use Yardi. You can use the open-source model your senior associate wrote in Python. The reporting layer doesn't care.

This is what we mean when we talk about AI-native reporting at Novendor. Not a chatbot bolted to a legacy product. A reporting layer that reads authoritative state, composes the pack, and gives your team time back.

## The real question for the next six months

If you're on ARGUS Standalone right now, you have a decision to make this summer. It's not "ARGUS Enterprise or a competitor." That's the easy version of the decision, and it will leave you with the same operational problems you had last quarter.

The real question is: when I'm forced to touch this stack, what's the highest-leverage thing I can change. For most firms we talk to, the answer isn't the property model. It's the reporting layer. That's where the analyst hours go. That's where LP trust lives. That's the lever that actually affects your close cycle and your capacity to take on a bigger fund.

So the path we'd suggest is not "pick the ARGUS replacement." It's "use the ARGUS sunset as the forcing function to audit what your stack is actually doing for you, and fix the expensive thing, not the visible thing."

## If you want to talk about it

We're running a small number of 90-day assessments with REPE CFOs and Heads of Data right now. We look at the close cycle, the reconciliation spend, and the reporting pack, and we come back with a specific answer about what to swap and what to leave alone. If ARGUS is on your list this year, that's as good a reason as any to spend an hour on it.`,
  },
  {
    slug: "600-hour-quarter",
    title: "The 600-Hour Quarter: What Reconciliation Is Actually Costing You",
    dek: "Nobody budgets for the reconciliation load. It lives in the labor cost of analysts hired to do something else. Here's how to see it, and what to automate.",
    author: "Paul Malmquist",
    publishedOn: "2026-04-21",
    readingMinutes: 4,
    tag: "Operations",
    body: `A real number from a real fund: six hundred analyst hours a quarter on Yardi and Excel reconciliation. That's about fifteen weeks of a single analyst's time, every three months, just to make sure the numbers in the reporting pack agree with the numbers in the general ledger.

Nobody budgets for that. It doesn't show up on the audit line. It doesn't have a PO. It lives in the labor cost of a team that was ostensibly hired to do something else.

I want to walk through why the number is so high, why it's hidden, and what you can do about it.

## Why reconciliation costs what it costs

The typical REPE stack has a property system (Yardi, MRI, RealPage), an accounting system (Yardi Voyager, Sage Intacct, or the same platform as the property data), and some collection of Excel workbooks that merge the two together into something an LP can read.

Those three layers don't agree with each other. They never agree exactly. The property system posts rent events that haven't flowed to the GL yet. The GL has journal entries with no obvious property reference. The Excel workbook has tabs from three quarters ago that someone forgot to unlink.

Reconciling isn't about finding fraud. It's about tracing every number in the reporting pack back to something defensible. You're not looking for errors. You're proving a positive: that this number is real.

When the tracing is manual, the hours compound. An analyst opens Yardi, opens the workbook, opens the GL, ties one number, closes all three, and moves to the next number. Multiply by a few hundred numbers in an institutional pack, multiply by the number of funds, multiply by the number of quarters.

## Why it's hidden

The reason the number doesn't surface in your budget is that the analyst doing the reconciliation is also doing a dozen other things. Their time gets coded to "fund operations" or "asset management support," and the reconciliation labor gets bundled with deal work, LP queries, and the quarterly letter.

You only see the reconciliation cost when someone leaves and the work doesn't get done. Then the close runs long, the pack is late, the CFO gets the call, and the firm concludes it needs to hire another analyst. This is how the reconciliation cost gets paid for twice: once in the hours, and once in the hiring budget to absorb the hours.

## What you can automate

The right unit of automation is not "automate reconciliation." Reconciliation is a judgment activity. There are real exceptions. There are real timing differences. You don't want a robot papering over them.

The right unit is: automate the tying.

The tying is the mechanical part. Given a GL balance and a Yardi extract, does this property's rent revenue equal the sum of rent journal entries for the quarter. That's a programmatic check. It runs in seconds. What's left for the analyst is the exceptions: the fifteen numbers that don't tie out of the three hundred that do.

Now your analyst is reviewing exceptions instead of proving positives. The hours compress dramatically. A six-hundred-hour quarter becomes a hundred-and-fifty-hour quarter. The quality of the reconciliation usually goes up, because the analyst has time to actually investigate the exceptions rather than rushing through the tying to get to them.

## The honest caveat

You can't fully automate reconciliation at a firm that hasn't cleaned up its chart of accounts or its property coding. Garbage in, garbage out. Most firms we see need a short data-hygiene pass before the automation pays off, something on the order of two to four weeks of light cleanup.

But that's the work anyway. If your reconciliation labor is as high as it is because the underlying data is messy, the data is going to bite you eventually, whether through a late pack or through an LP question you can't answer.

The ARGUS sunset, the Yardi upgrade, the quarterly close: all of them are good excuses to fix this. What's not a good excuse is "we'll hire another analyst." You've been doing that for a decade and the number keeps going up.`,
  },
  {
    slug: "lps-care-about-the-package",
    title: "Your LPs Don't Care About Your Stack, They Care About the Package",
    dek: "LPs don't ask what accounting system you use. They care about the quarterly package. And the package has gotten qualitatively harder to produce.",
    author: "Paul Malmquist",
    publishedOn: "2026-04-22",
    readingMinutes: 5,
    tag: "LP reporting",
    body: `LPs don't ask what accounting system you use. They don't ask what fund administrator you hired. They don't care whether you're on Yardi or Investran or some fork of Excel that your COO wrote in 2011. They care about one thing: the package that lands in their inbox every quarter.

The package has gotten harder. If you've closed a Fund III or beyond, you know this. ILPA templates have expanded. ESG disclosures are expected. State pension mandates have their own requirements, and they change. What used to be a PDF with a few tabs is now a multi-file pack with data in specific formats, and if you get it wrong, you hear about it.

This is the quiet part of the job that nobody tells you about when you're closing Fund I.

## What's changed

Institutional capital now expects a level of reporting rigor that was optional five years ago. A mid-size state pension signing an LP agreement in 2026 shows up with a template. The template has fields. The fields have to be populated from your accounting system, from your property data, from your third-party valuation, and sometimes from your insurance carrier.

You have maybe two weeks after quarter-close to produce the package. Longer than that and your LP relations team is fielding calls.

Multiply that across fifteen or twenty LPs, each with slightly different templates, each with their own submission portal, each with their own chasing cadence, and you have a job. Not a task. A job.

Most firms we see handle this by putting a senior associate or an IR director in charge of assembling the package by hand. They open the quarterly pack, find the relevant number, paste it into the template, check the format, save, and move to the next LP. The work takes a week. The ink is barely dry before the next quarter starts.

## Why "we'll have the intern do it" breaks around Fund III

Fund I and Fund II, you can get away with heroics. Fund III, the math breaks.

The problem isn't volume, though volume is part of it. The problem is that the errors compound. When you're populating templates manually from a hand-assembled pack, any upstream inconsistency travels downstream. A number that was rounded differently in one tab shows up rounded differently in the LP report, and an LP with a spreadsheet of their own is going to flag it. Now you're responding to an LP query that's really a reconciliation exercise disguised as a question.

Each individual query is survivable. The collective query load, across a growing LP base, isn't. What looks like fifteen LP emails a quarter is really thirty hours of reconciliation labor, done reactively, at the worst possible time for the team.

## What a real reporting layer does

The short version: it composes the package from a single source of truth.

Your source of truth is an authoritative state. Fund-level metrics computed once, tied back to property data, tied back to the GL, released for a quarter and locked. When you compose an LP package, you don't assemble it from tabs. You query the authoritative state, format it for the LP's template, and ship.

When an LP asks a question, you don't reconcile. You point at the authoritative state and walk them through the lineage.

When the template changes, you remap the composition, not the data.

This is the end-state. Most firms aren't there. Getting there takes work, and it takes an honest look at what your current pack is doing and what it isn't.

## If you're interviewing platforms this year

A short checklist for anyone evaluating LP reporting tooling this year.

Does the platform generate the package, or does it produce a data extract you still have to assemble. If it's the latter, you haven't solved the problem. You've moved it.

Does the platform track LP-specific template variants, or does it assume one template rules them all.

Does the platform support ESG and ILPA out of the box, or is that a services engagement.

Does the platform produce a lineage trail from the LP-facing number back to the GL, or does the auditor still have to reconstruct that from memory.

Most platforms fail two or three of these. That's fine. What's not fine is buying a platform that fails all four and calling it a reporting upgrade.`,
  },
  {
    slug: "multi-sector-breaks-excel",
    title: "Multi-Sector Is Where Excel Finally Breaks",
    dek: "Single-sector funds can live in Excel for a long time. The second sector degrades integrity. The third makes the workbook unrecoverable.",
    author: "Paul Malmquist",
    publishedOn: "2026-04-23",
    readingMinutes: 4,
    tag: "Operations",
    body: `If you run a single-sector fund, you can live in Excel for a long time. Multifamily only, or storage only, or industrial only, the reporting pack is roughly the same quarter to quarter. You build a workbook, you copy it forward, you update the tabs. Painful but survivable.

The moment you add a second sector, the workbook starts losing integrity. The moment you add a third, it stops being recoverable.

We've seen this pattern enough times that it's worth writing down. It's the specific failure mode that tends to push firms from "we manage it in Excel" to "we need a real reporting layer."

## Why single-sector Excel works

In a single-sector portfolio, your rent line is a rent line. Your occupancy is occupancy. Your NOI build has the same structure across every property, with the same major expense categories and the same revenue events. A competent analyst can keep the whole thing in their head.

The pack is roughly: roll up property-level NOI, compare to underwriting, compare to last quarter, layer in debt service, produce fund-level returns. Five tabs. Reproducible. Slow, but reproducible.

## What happens when you add a sector

Add self-storage to a multifamily fund. Now the occupancy definition is different. Multifamily occupancy is units leased over total units, stabilized over twelve months. Storage occupancy is square feet leased over total square feet, and it's seasonal. Stabilization looks different. Street rate versus contract rate matters in a way it doesn't for apartments.

Add student housing. Occupancy is on a by-bed basis during the school year, and it resets in August. Revenue events cluster around lease-up windows. Your quarterly pack now has a sector that reports on a school-year cadence.

Add senior care. Now you have operator licenses, Medicare reimbursements, resident mix, and a stack of regulatory KPIs that your multifamily analyst has never seen.

Each sector is solvable on its own. The problem is the blending. When you produce the fund-level pack, you have to harmonize four definitions of the same field into one comparable number, and that harmonization lives in an analyst's head until it lives in a workbook, and the workbook gets longer every quarter, and every new property adds a new edge case, and the reconciliation becomes a quarterly novel.

## The specific breaking point

For the firms we've worked with, the break tends to happen in one of three places.

First, at the analyst transition. Someone leaves. The incoming analyst inherits the workbook and can't figure out why a formula is hardcoded the way it is. They ask. The answer is "that's how we handle the storage properties for this one LP." The institutional memory was in a person, and the person left.

Second, at the LP audit. An LP asks for a breakout of returns by sector, or by vintage, or by some slice that the workbook doesn't natively produce. The analyst spends a week reconstructing the slice from scratch. The LP asks again next quarter.

Third, at the Fund IV close. A new institutional LP shows up with a diligence template, and the template asks for data across the portfolio in a way the firm has never had to produce. The firm realizes it cannot credibly answer. The fundraise stalls.

Any one of these is survivable in isolation. All three in the same year, which is what tends to happen, is not.

## What to look for in a fix

The test of a reporting layer for a multi-sector fund is not "can it produce a fund-level return." Any tool can do that. The test is: can it produce a credible, sector-specific slice that harmonizes with the fund-level return.

The harder test, the one most tools fail: can it produce a sector-specific slice that was not pre-defined at implementation. Can the CFO, on a Tuesday afternoon, ask "show me returns by vintage for everything in the Sun Belt," and get an answer in the same session.

That's the bar. Most firms know they're not there. Most platforms don't get them there either. When you're interviewing this year, run the test. Bring a real query. See if the platform folds.`,
  },
  {
    slug: "ai-native-vs-ai-on-top",
    title: "AI on Top of Yardi Is Not the Same Thing as AI-Native Reporting",
    dek: "Every REPE vendor has shipped an AI feature in the last eighteen months. There are two very different things being built under the same label. The distinction matters.",
    author: "Paul Malmquist",
    publishedOn: "2026-04-24",
    readingMinutes: 5,
    tag: "Category",
    body: `The REPE software category has spent the last eighteen months adding AI features. Juniper Square has an AI CRM. Dealpath has a Copilot. Yardi is talking about AI across its product line. Every vendor is shipping something that looks like Claude or ChatGPT wrapped around their existing data model, and every vendor is calling it AI.

There are two very different things being built under the same label, and the distinction matters a lot for the buyer.

## What "AI on top of" really means

When a legacy product ships an AI feature, what's usually happening is: they're putting a language model in front of the data model they already have. The AI can read the records. It can summarize. It can format the same information in conversational English. That's useful, on the margin, for specific tasks like drafting an LP email or pulling a quick occupancy number.

What the AI cannot do is fix the underlying data model. If the authoritative state of your fund is spread across three systems and doesn't agree with itself, the AI will happily produce a confident, fluent, wrong answer. This is where the hallucinations come from. They're not a model problem. They're a data problem that the model has no tools to solve.

If you've watched a vendor demo one of these products, you've probably noticed the demo data is suspiciously clean. One fund. Three assets. Perfectly reconciled. Every field populated. That's because the demo only works on clean data, and the vendor knows it.

## What AI-native actually means

An AI-native reporting platform starts from a different premise. The reporting layer is rebuilt so that the authoritative state of the fund is queryable, lineage-traced, and locked per period. When the AI answers a question, it's reading from an authoritative snapshot, not from a stitched-together extract.

This is a harder thing to build. It requires a state-lock contract. It requires property data, GL data, and computed metrics to agree, and when they don't, the system fails closed rather than guessing. It requires lineage from any displayed number back to the source.

The payoff is that the AI answers become trustworthy. A CFO can ask "what's the NOI variance on Property A against underwriting," and the answer is backed by a formula, a source record, and a release tag. Not a best guess.

The payoff is also that the AI can compose things. A full LP package. A fund review. A board memo. Because it's operating on authoritative state, it can produce an artifact that the team trusts enough to send.

## The commercial consequence

Here's the quiet thing about the AI-on-top approach. It doesn't reduce headcount. It makes the same headcount slightly more productive at the same job.

The AI-native approach, if it's real, does reduce the reconciliation load. It reduces the LP query load. It reduces the week-long package assembly. It changes the shape of the analyst's job from "produce numbers" to "review and interpret numbers."

Firms evaluating AI features right now should be asking a specific question. Does this product reduce my close cycle, or does it just summarize my existing close cycle more eloquently. The answer determines whether you're paying for a feature or paying for a platform.

## The test we suggest

A simple diligence test. Take a question your team actually struggles with. Not a canned demo question. Something like "show me cash-on-cash return for the stabilized multifamily assets in Texas, weighted by equity, trailing four quarters."

Ask the vendor's AI feature.

Note whether the answer is right. Note whether you can trace the number back to the source. Note whether the vendor shows you how the AI arrived at the answer, or whether it's a black box.

If the answer is wrong, or partial, or untraceable, you're not looking at AI-native reporting. You're looking at a chat wrapper. That's a useful product, but it is not the thing that reduces your reconciliation spend.

When you're buying for 2027, know which one you need.`,
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function listArticles(): Article[] {
  // Newest first.
  return [...ARTICLES].sort((a, b) => (a.publishedOn < b.publishedOn ? 1 : -1));
}
