"""
create_outlook_drafts.py
Creates 31 Novendor outreach email drafts in info@novendor.ai Outlook account.
Run from Windows with Outlook open and info@novendor.ai account active.
Usage: python create_outlook_drafts.py
"""

import win32com.client
import sys

SUBJECT = "Quick intro — Novendor AI for REPE reporting"

DRAFTS = [
    {
        "to": "patrick.osullivan@crossharborcapital.com",
        "name": "Patrick O'Sullivan — CrossHarbor Capital Partners",
        "body": """Patrick,

I run Novendor — we build AI-native reporting and analytics tools for REPE finance teams.

CrossHarbor's multi-strategy fund structure is exactly the use case where we see the most friction: fund-level roll-ups across a diverse asset mix, quarterly LP reporting that requires pulling from multiple source systems, and finance teams spending time assembling data instead of analyzing it.

We replace that manual layer with a unified AI-driven reporting engine — built specifically for institutional REPE, not retrofitted from generic BI tools.

Happy to show you a 20-minute demo scoped to CrossHarbor's portfolio structure.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "chad.patterson@artemisrea.com",
        "name": "Chad Patterson — Artemis Real Estate Partners",
        "body": """Chad,

I run Novendor — we build AI-native analytics and reporting tools for REPE finance teams.

For a firm like Artemis managing value-add across multiple strategies, the quarterly reporting assembly cycle is usually where we find the most leverage. Finance teams are pulling from Yardi or MRI, normalizing across asset types, and manually building the LP package — we've rebuilt that workflow end-to-end with AI.

Happy to show you a quick demo if there's interest.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "sarah.young@bellpartnersinc.com",
        "name": "Sarah Young — Bell Partners",
        "body": """Sarah,

Congratulations on the CFO role at Bell Partners.

I run Novendor — we build AI-native reporting tools for multifamily REPE finance teams. The onboarding moment for a new CFO is exactly when people want cleaner infrastructure: faster reporting cycles, better portfolio visibility, less manual assembly.

We've built a unified analytics layer specifically for institutional multifamily — not generic BI, but built for the Yardi/RealPage workflow that most large platforms run on.

Happy to show you a 15-minute demo if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "timothy.green@terracapmgmt.com",
        "name": "Timothy Green — TerraCap Management",
        "body": """Timothy,

I run Novendor — we build AI-native reporting tools for REPE finance teams.

For a value-add shop like TerraCap with assets across Florida and the Southeast, the data assembly problem is real: pulling from property-level systems, normalizing across a diverse portfolio, and building fund-level LP reporting manually takes real time.

We've built a purpose-built analytics layer that compresses that cycle significantly.

Happy to show you how we solve it — 20 minutes if you're open to it.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "ron.strobl@praediumgroup.com",
        "name": "Ron Strobl — Praedium Group",
        "body": """Ron,

I run Novendor — we build AI-native analytics for REPE finance teams.

For a value-add firm like Praedium managing office and retail across major metros, quarterly LP reporting is usually where we find the most manual friction: aggregating property-level data, reconciling across asset types, and producing the fund-level package.

We've rebuilt that workflow end-to-end with AI — purpose-built for institutional REPE.

Happy to demo what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "tara.marszewski@waterton.com",
        "name": "Tara Marszewski — Waterton Associates",
        "body": """Tara,

I run Novendor — we build AI reporting tools for multifamily REPE finance teams.

For a firm managing $8B+ across multiple markets, the fund-level roll-up from property-level systems is usually where the most time gets spent: pulling from Yardi, normalizing across markets, assembling the quarterly LP package.

We compress that cycle significantly with a purpose-built AI analytics layer.

Happy to show you how — 20 minutes if you're open to it.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "eric.schiela@rubensteinpartners.com",
        "name": "Eric Schiela — Rubenstein Partners",
        "body": """Eric,

I run Novendor — we build AI-native operations and reporting tools for REPE firms.

For an office-focused shop like Rubenstein managing a complex repositioning portfolio, having a clean operational layer across markets is the problem we're built to solve: lease-level analytics, repositioning progress tracking, and fund-level reporting from a single source.

Happy to demo if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "brad.barefoot@accessopartners.com",
        "name": "Brad Barefoot — Accesso Partners",
        "body": """Brad,

I run Novendor — we build AI-native reporting tools for office and mixed-use REPE finance teams.

Accesso's portfolio is exactly the use case where we see the most friction: diverse tenant mixes, multiple markets, and LP reporting that requires manual assembly across asset classes.

We've built a unified AI analytics layer specifically for this — not generic BI, but purpose-built for institutional REPE reporting workflows.

Happy to show you what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "jacque.vedra@ascentris.com",
        "name": "Jacque Vedra — Ascentris",
        "body": """Jacque,

Congratulations on the partner promotion at Ascentris.

I run Novendor — we build AI-native analytics and reporting for value-add REPE finance teams. The step up to partner usually comes with more LP and investor reporting responsibility — we've built a tool that compresses that cycle significantly.

Happy to show you a quick demo of what we've built — 20 minutes if there's interest.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "wes.wilson@avanath.com",
        "name": "Wesley Wilson — Avanath Capital Management",
        "body": """Wes,

I run Novendor — we build AI-native reporting tools for REPE finance teams.

Affordable housing reporting has a layer of compliance complexity that most tools ignore: LIHTC tracking, regulatory reporting, and the intersection with standard LP reporting. We've built for it specifically.

Happy to show you a 20-minute demo if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "danny.zwieg@banyanstreetcapital.com",
        "name": "Danny Zwieg — Banyan Street Capital",
        "body": """Danny,

I run Novendor — we build AI-native finance and reporting tools for REPE firms.

For a large Southeast office platform like Banyan Street, tenant-level and fund-level data reconciliation is usually where the most time gets spent: pulling lease data, normalizing across properties, and building LP reporting manually.

Happy to show you how we solve that — 20 minutes if you're open to it.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "clay.landers@cortland.com",
        "name": "Clay Landers — Cortland",
        "body": """Clay,

Congratulations on stepping into the CFO role at Cortland.

I run Novendor — we build AI-native reporting tools for vertically integrated multifamily platforms. The data advantage of vertical integration is real, but unlocking it across property management, construction, and finance systems is the challenge we're built to solve.

Happy to demo if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "doug.lanning@dermody.com",
        "name": "Doug Lanning — Dermody Properties",
        "body": """Doug,

I run Novendor — we build AI-native reporting tools for industrial and logistics REPE finance teams.

For an active developer like Dermody with assets at multiple stages of the cycle — pre-development, construction, lease-up, stabilized — getting a clean portfolio view requires real work. We've built a unified analytics layer specifically for this.

Happy to show you how we solve that.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "staci.tyler@eastgroup.net",
        "name": "Staci Tyler — EastGroup Properties",
        "body": """Staci,

Congratulations on the CFO promotion at EastGroup.

I run Novendor — we build AI-native analytics for industrial REIT finance teams. The same-store NOI analysis and portfolio reporting workflow is exactly where we find the most leverage: faster assembly, better auditability, and a unified view across the portfolio.

Happy to show you a quick demo of what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "joe.clark@fpamf.com",
        "name": "Joe Clark — FPA Multifamily",
        "body": """Joe,

I run Novendor — we build AI-native reporting tools for large multifamily value-add platforms.

For a firm managing 150+ properties across multiple markets, the quarterly LP reporting assembly is usually where we find the most leverage: pulling from Yardi or RealPage, normalizing across markets, and building the fund-level package.

We compress that cycle significantly with purpose-built AI tooling.

Happy to show you a 20-minute demo.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "andrew.franklin@gemrc.com",
        "name": "Andrew Franklin — GEM Realty Capital",
        "body": """Andrew,

I run Novendor — we build AI-native operations and analytics tools for REPE firms.

GEM's multi-strategy structure — equity, securities, property management — is exactly the use case where a unified data layer creates real value. Each business line has different reporting requirements, but ownership wants a single portfolio view.

Happy to show you what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "ashlee.cabeal@hamiltonzanze.com",
        "name": "Ashlee Cabeal — Hamilton Zanze",
        "body": """Ashlee,

I run Novendor — we build AI-native reporting tools for multifamily REPE finance teams.

For a platform at HZ's scale — 120+ properties, 16 states, 1031 complexity — the quarterly reporting cycle is significant. Pulling from Yardi, normalizing across markets, handling 1031 exchange tracking, and producing the LP package is a real operational burden.

Happy to show you how we compress it — 20 minutes if you're open to it.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "zachary.michaud@harrisonst.com",
        "name": "Zachary Michaud — Harrison Street",
        "body": """Zachary,

I run Novendor — we build AI-native analytics for alternative property type REPE platforms.

Harrison Street's mix of healthcare, life science, student housing, and storage creates a unique reporting challenge: each asset class has different KPIs, different operating metrics, and different data sources — but LPs want a single portfolio view.

We've built specifically for this cross-asset-class problem.

Happy to demo what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "john.wain@kayneanderson.com",
        "name": "John Wain — Kayne Anderson Real Estate",
        "body": """John,

I run Novendor — we build AI-native reporting tools for healthcare and senior housing REPE finance teams.

The operating metrics layer in healthcare real estate is more complex than most tools handle well: census-based revenue, operator-level reporting, and the intersection with real estate fund-level LP reporting. We've built for that specific complexity.

Happy to show you a 20-minute demo scoped to Kayne Anderson's portfolio.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "jacob.reingardt@northwoodinvestors.com",
        "name": "Jacob Reingardt — Northwood Investors",
        "body": """Jacob,

I run Novendor — we build AI-native finance and reporting tools for global opportunistic REPE firms.

For a platform like Northwood managing across geographies and asset types, the reporting and reconciliation layer is real work: currency translation, cross-market normalization, and producing a coherent portfolio view for LPs.

Happy to show you what we've built — 20 minutes if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "michael.maturo@rxr.com",
        "name": "Michael Maturo — RXR Realty",
        "body": """Michael,

I run Novendor — we build AI-native reporting tools for complex multi-strategy REPE platforms.

RXR's mix of office, retail, residential, and development means the finance team is managing multiple data models simultaneously — different source systems, different KPIs, different LP expectations across strategies.

We've built a unified AI analytics layer specifically for this cross-strategy problem.

Happy to show you how we unify that — 20 minutes if there's interest.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "ken.coatsworth@sares-regis.com",
        "name": "Ken Coatsworth — Sares-Regis Group",
        "body": """Ken,

I run Novendor — we build AI-native reporting tools for multifamily and commercial REPE finance teams.

For a West Coast platform managing multiple asset types, the fund-level reporting assembly is usually where we find the most leverage: pulling from Yardi, normalizing across multifamily and commercial, and producing LP reporting on a compressed cycle.

Happy to demo what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "dennis.harris@stockdalecapital.com",
        "name": "Dennis Harris — Stockdale Capital Partners",
        "body": """Dennis,

I run Novendor — we build AI-native reporting tools for mixed-use REPE finance teams.

Stockdale's value-add repositioning strategy means assets at different stages of the cycle simultaneously: pre-reposition, active construction, stabilizing, and stabilized. Getting a clean performance view across all of them from a single source is exactly the problem we're built to solve.

Happy to show you a quick demo.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "will.strong@virtusre.com",
        "name": "Will Strong — Virtus Real Estate Capital",
        "body": """Will,

I run Novendor — we build AI-native analytics for recession-resilient REPE platforms.

Managing 43+ funds across self-storage, medical, and senior housing means a significant reporting surface: different KPIs per asset class, different fund structures, and LPs who want a unified portfolio view.

Happy to show you how we handle the cross-fund, cross-asset-type view — 20 minutes if you're open to it.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "lawrence.settanni@wheelockst.com",
        "name": "Lawrence Settanni — Wheelock Street Capital",
        "body": """Lawrence,

I run Novendor — we build AI-native reporting tools for opportunistic REPE finance teams.

For a deal-by-deal platform like Wheelock managing diverse structures and waterfalls, the fund-level reporting layer is usually the most manual part of the job: each deal has a unique structure, and assembling a coherent LP report requires real work.

Happy to show you what we've built.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "james.sebra@irtliving.com",
        "name": "James Sebra — Independence Realty Trust",
        "body": """James,

I run Novendor — we build AI-native analytics for public multifamily REIT finance teams.

The challenge of running earnings, same-store analysis, and investor reporting simultaneously from the same underlying data is exactly what we're built for: a unified analytics layer that feeds every reporting surface without duplication or manual reconciliation.

Happy to demo — 20 minutes if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "bhairav.patel@centerspacehomes.com",
        "name": "Bhairav Patel — Centerspace",
        "body": """Bhairav,

I run Novendor — we build AI-native reporting tools for multifamily REIT finance teams.

With Centerspace's strategic review underway, having clean, fast portfolio data is critical regardless of the outcome: whether it's supporting a potential transaction, investor communications, or ongoing operations.

Happy to show you what we've built — 20 minutes if there's interest.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "lindsay.colbert@presidiumre.com",
        "name": "Lindsay Colbert — Presidium Group",
        "body": """Lindsay,

I run Novendor — we build AI-native operations and analytics tools for vertically integrated multifamily developers.

For a platform like Presidium tracking development, lease-up, and stabilized assets simultaneously, getting a clean operational view requires pulling from multiple systems: project management, property management, and finance. We unify that into a single layer.

Happy to show you how we solve that.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "lily.chae@drawbridgerealty.com",
        "name": "Lily Chae — Drawbridge Realty",
        "body": """Lily,

Congratulations on the CFO role at Drawbridge.

I run Novendor — we build AI-native reporting tools for industrial REPE finance teams. The quarterly LP reporting cycle is usually where we find the most immediate leverage: pulling from Yardi or MRI, normalizing across properties, and producing the fund-level package faster.

Happy to show you what we've built — 20 minutes if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "patrick.sousa@marcuspartners.com",
        "name": "Patrick Sousa — Marcus Partners",
        "body": """Patrick,

I run Novendor — we build AI-native operations and analytics tools for REPE firms.

Marcus Partners' knowledge-economy East Coast focus means a complex tenant mix and comps layer: life science, office, and R&D users with different lease structures and operating metrics. Getting a clean portfolio view across that mix is exactly what we're built for.

Happy to demo if timing works.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
    {
        "to": "micah.holton@asanapartners.com",
        "name": "Micah Holton — Asana Partners",
        "body": """Micah,

I run Novendor — we build AI-native reporting tools for neighborhood retail REPE finance teams.

For a platform like Asana managing a high volume of smaller tenants across growth markets, the roll-up to fund-level LP reporting is real work: lease-level data, market-by-market normalization, and assembling the quarterly package.

Happy to show you what we've built — 20 minutes if there's interest.

Paul Malmquist
Founder, Novendor
paul@novendor.ai | novendor.ai""",
    },
]


def find_novendor_account(outlook):
    """Find the info@novendor.ai account in Outlook."""
    accounts = outlook.Session.Accounts
    for i in range(1, accounts.Count + 1):
        acct = accounts.Item(i)
        smtp = acct.SmtpAddress.lower()
        if "novendor" in smtp:
            print(f"  Found Novendor account: {acct.SmtpAddress}")
            return acct
    return None


def main():
    print("Connecting to Outlook...")
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
    except Exception as e:
        print(f"ERROR: Could not connect to Outlook. Is it open?\n{e}")
        sys.exit(1)

    novendor_account = find_novendor_account(outlook)
    if not novendor_account:
        print("WARNING: info@novendor.ai account not found in Outlook.")
        print("Available accounts:")
        for i in range(1, outlook.Session.Accounts.Count + 1):
            a = outlook.Session.Accounts.Item(i)
            print(f"  - {a.SmtpAddress}")
        print("\nProceeding without account override — drafts will save to default account.")
        print("Manually move them to info@novendor.ai if needed.\n")

    created = 0
    failed = []

    for draft_data in DRAFTS:
        try:
            mail = outlook.CreateItem(0)  # 0 = olMailItem
            mail.To = draft_data["to"]
            mail.Subject = SUBJECT
            mail.Body = draft_data["body"]

            if novendor_account:
                mail.SendUsingAccount = novendor_account

            mail.Save()
            created += 1
            print(f"  ✓ {draft_data['name']} → {draft_data['to']}")
        except Exception as e:
            failed.append((draft_data["name"], str(e)))
            print(f"  ✗ FAILED: {draft_data['name']} — {e}")

    print(f"\n{'='*60}")
    print(f"DONE: {created}/{len(DRAFTS)} drafts created in Outlook")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for name, err in failed:
            print(f"  - {name}: {err}")
    else:
        print("No failures.")
    print("Check Outlook Drafts folder in info@novendor.ai")


if __name__ == "__main__":
    main()
