import Link from "next/link";

type NCFLandingMockupProps = {
  envId: string;
};

export default function NCFLandingMockup({ envId }: NCFLandingMockupProps) {
  const brand = {
    pageBg: "#f4f4f2",
    dark: "#2f2f31",
    cyan: "#1ba6d9",
    cyanSoft: "#e9f5fb",
    cyanBorder: "#7cc3e8",
    textMuted: "#5d6772",
    cardBg: "#f7f7f5",
  };

  const executiveHref = `/lab/env/${envId}/ncf/executive`;

  const stages = [
    {
      title: "Giving Signals Enter the Cycle",
      signal:
        "Contribution activity, donor-advised fund balances, complex asset intake, grant recommendation volume, local office updates, and quarter-end finance movement all start the story at different times.",
      failures: [
        "Large gifts, non-cash gifts, and grant recommendations do not mature on the same timetable, so leadership can see activity before the full economic picture is settled.",
        "National reporting and local relationship activity move at different speeds, which makes network-wide rollups feel less certain than any one office expects.",
        "The same period can contain pledge-like expectations, received assets, liquidated assets, and approved distributions, but those signals are often interpreted as if they were one clean number.",
      ],
      opportunity:
        "The first layer should distinguish volume, value, recommendation, approval, and realized impact so the organization is not forced to compress different truths into one early summary.",
      panelBg: "#eef8fd",
      panelBorder: "#d0ebf8",
      dotBg: "#4daed6",
      icon: "\u25C9",
    },
    {
      title: "Meaning Gets Rebuilt By Hand",
      signal:
        "Stewardship teams, finance, leadership support, and analytics each need different cuts of the same activity: by giver, by fund, by office, by charity, by period, and by narrative context.",
      failures: [
        "A grant total for an executive audience, an office scorecard, and a stewardship conversation often begin from the same underlying activity but get reshaped manually for each use.",
        "Definitions such as active giver, grants mobilized, assets under care, complex gift value, and office performance can drift when each audience is served through separate reporting motions.",
        "Analysts spend time rebuilding context for every request instead of operating from reusable definitions that survive across board materials, internal reviews, and ad hoc follow-up.",
      ],
      opportunity:
        "The middle of the lifecycle should preserve one governed interpretation of giver, fund, grant, office, and impact activity so every later output starts from the same language.",
      panelBg: "#effbfc",
      panelBorder: "#d4f0f3",
      dotBg: "#39b8c9",
      icon: "\u25CE",
    },
    {
      title: "Reconciliation Arrives Too Late",
      signal:
        "By the time materials are moving upward, teams are reconciling audited financial views, operating views, and externally communicated impact views under deadline.",
      failures: [
        "One number can be valid in more than one lens: audited consolidated reporting, Form 990-style reporting, and public impact storytelling do not always answer the same question.",
        "Questions surface late around timing, scope, entity boundaries, and whether reported movement reflects contributions received, grants paid, assets held, or charitable impact communicated.",
        "Small differences become disproportionately expensive because leaders are not just asking which number is right. They are asking what exactly the number means.",
      ],
      opportunity:
        "Reconciliation should be visible as part of the flow itself, with scope labels and reporting lenses surfaced before a leadership packet is already being assembled.",
      panelBg: "#fff7e8",
      panelBorder: "#f3dfad",
      dotBg: "#d8a037",
      icon: "\u25CC",
    },
    {
      title: "Governance Has To Carry Stewardship",
      signal:
        "Donor confidentiality, office-level visibility, legal boundaries, qualification steps, and executive trust all depend on clear ownership and scoped access.",
      failures: [
        "Reporting confidence can depend too heavily on who prepared the material instead of on visible ownership, repeatable lineage, and defensible scope.",
        "Local offices, national leadership, finance, and stewardship functions do not need the same level of detail, yet access and reporting scope are often explained informally rather than structurally.",
        "Qualification and review activity around grants, charities, and special cases can affect the real operational picture even when it is mostly invisible in leadership reporting.",
      ],
      opportunity:
        "A stronger model makes stewardship tangible: who owns the metric, who can see the record, what lens is being used, and where an exception is still unresolved.",
      panelBg: "#e9f5fb",
      panelBorder: "#7cc3e8",
      dotBg: "#1ba6d9",
      icon: "\u2726",
    },
    {
      title: "Leadership Inherits A Static Story",
      signal:
        "Executive summaries, board narratives, planning conversations, and future AI-assisted analysis all sit at the bottom of the lifecycle and inherit whatever fragility remains above.",
      failures: [
        "Once a narrative leaves the underlying reporting process and enters a slide, memo, or board packet, the connection between question and source truth weakens.",
        "Follow-up questions about office performance, giver trends, grant timing, or complex gift conversion can trigger another round of manual reporting rather than a guided drill into governed truth.",
        "Leaders end up carrying reporting friction into the decision itself, which makes clarity feel slower and confidence feel expensive.",
      ],
      opportunity:
        "Leadership materials should remain attached to the underlying reporting logic so questions about giver behavior, grant movement, office performance, or impact can be answered without starting the cycle over.",
      panelBg: "#f3f5f7",
      panelBorder: "#d8dee5",
      dotBg: "#68717d",
      icon: "\u25A3",
    },
  ];

  const specificPainPoints = [
    {
      title: "Multiple valid reporting lenses",
      copy:
        "NCF communicates through audited financial reporting, IRS-facing reporting, and impact storytelling. The real problem is not that those views differ. It is that leaders need to understand when and why they differ.",
    },
    {
      title: "Network rollup tension",
      copy:
        "A nationwide office model creates natural pressure between local stewardship context and national comparability. Rollups become fragile when offices experience activity differently but are summarized as if they moved in sync.",
    },
    {
      title: "Complex gifts distort simple timelines",
      copy:
        "Real estate, business interests, and other non-cash assets create lag between intake, valuation, liquidation, and realized charitable movement. Those phases should not be forced into the same reporting moment.",
    },
    {
      title: "Grant workflows carry operational risk",
      copy:
        "Grant recommendation, qualification, review, approval, and distribution are not the same event. When reporting compresses them, executives lose visibility into operational friction and hidden backlog.",
    },
    {
      title: "Confidentiality changes the shape of reporting",
      copy:
        "Donor, office, and finance audiences do not need the same view. A leadership-ready reporting model has to preserve trust without flattening everything into one overshared perspective.",
    },
    {
      title: "Leadership materials break from live truth",
      copy:
        "By the time an answer becomes a board slide or executive talking point, it is often separated from the definitions, scope, and exceptions that produced it.",
    },
  ];

  const principles = [
    {
      title: "Separate signal from interpretation",
      copy:
        "Contribution activity, grant movement, balances, and impact communication should not be treated as one event stream.",
    },
    {
      title: "Show the reporting lens",
      copy:
        "Every major number should declare whether it reflects operating activity, financial reporting, or external impact storytelling.",
    },
    {
      title: "Preserve local context in national rollups",
      copy:
        "National clarity should not require stripping away the office-level realities that explain performance.",
    },
    {
      title: "Make stewardship visible",
      copy:
        "Ownership, access, lineage, and unresolved exceptions belong inside the reporting experience, not outside it.",
    },
  ];

  const systemBridge = [
    {
      concept: "Giving signals",
      structure: "ncf_contribution (date, type, value, status, reporting_lens)",
      note: "Volume, value, recommendation, approval, and realized movement each carry their own status + lens label.",
    },
    {
      concept: "Grant lifecycle",
      structure: "ncf_grant states: recommended \u2192 qualified \u2192 approved \u2192 paid",
      note: "Operational friction stays visible because each stage is its own row, not one compressed number.",
    },
    {
      concept: "Office rollups",
      structure: "ncf_office as rollup dimension",
      note: "Local context survives national aggregation; rollups are derived, not destroyed.",
    },
    {
      concept: "Reporting lenses",
      structure: "ncf_reporting_lens reference + lens column on every fact table",
      note: "Financial, operational, and impact reporting are declared, not inferred.",
    },
    {
      concept: "Governance & stewardship",
      structure: "access policy + lineage metadata on ncf_metric",
      note: "Ownership and scope are part of the metric record, not a separate memo.",
    },
  ];

  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: brand.pageBg }}>
      <div className="border-b border-black/10 text-white" style={{ backgroundColor: brand.dark }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10 lg:px-12">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 items-center rounded-sm px-3 text-sm font-semibold tracking-wide"
              style={{ backgroundColor: "#1a1a1c", color: "#f5f5f3" }}
            >
              National Christian Foundation
            </div>
            <div className="hidden text-xs uppercase tracking-[0.24em] text-white/65 md:block">
              Reporting &amp; Stewardship Model
            </div>
          </div>
          <div className="hidden items-center gap-7 text-sm text-white/85 md:flex">
            <span>Executive</span>
            <span>Giving</span>
            <span>Grants</span>
            <span>Offices</span>
            <span>Data Health</span>
            <span>Audit</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8 md:px-10 lg:px-12 lg:py-10">
        <section className="relative overflow-hidden rounded-[34px] border border-black/10 bg-white shadow-sm">
          <div
            className="absolute left-0 top-0 h-40 w-full opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(0,0,0,0.10) 2px, transparent 2.5px)",
              backgroundSize: "18px 18px",
            }}
          />
          <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="relative px-8 py-14 md:px-12 md:py-16">
              <div className="text-xs font-medium uppercase tracking-[0.26em]" style={{ color: brand.cyan }}>
                NCF Reporting &amp; Stewardship Model
              </div>
              <h1 className="mt-5 max-w-4xl text-4xl font-light tracking-tight text-slate-900 md:text-6xl md:leading-[1.04]">
                A clearer reporting path for donor-advised funds, grants, complex gifts, and leadership trust.
              </h1>
              <p className="mt-6 max-w-3xl text-base leading-8 md:text-lg" style={{ color: brand.textMuted }}>
                This environment takes NCF&rsquo;s operational reality and applies it to a governed reporting model: where confidence starts to erode between donor activity,
                grant movement, financial reporting, local office context, and the final leadership story that must hold together.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href={executiveHref}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-sm transition-all hover:opacity-90"
                  style={{ backgroundColor: brand.dark, color: "#f5f5f3" }}
                >
                  Explore the reporting lifecycle in practice
                  <span aria-hidden>&rarr;</span>
                </Link>
                <span className="text-xs uppercase tracking-[0.22em]" style={{ color: brand.textMuted }}>
                  Opens the executive view with lens-labeled metrics
                </span>
              </div>

              <div className="mt-9 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  "donor-advised fund activity",
                  "grant qualification and distribution",
                  "complex gift timing",
                  "network rollups",
                  "reporting-lens clarity",
                  "leadership trust",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-full border px-4 py-2 text-sm font-medium"
                    style={{
                      borderColor: "rgba(27,166,217,0.20)",
                      backgroundColor: brand.cyanSoft,
                      color: "#11789d",
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="relative min-h-[420px] overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #11789d 0%, #1ba6d9 55%, #2f2f31 100%)",
              }}
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 25% 30%, rgba(255,255,255,0.35) 0%, transparent 45%), radial-gradient(circle at 80% 75%, rgba(255,255,255,0.18) 0%, transparent 40%)",
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                <div className="text-xs uppercase tracking-[0.24em] text-white/70">Concept framing</div>
                <div className="mt-3 max-w-lg text-3xl font-light leading-tight md:text-4xl">
                  The challenge is not just producing numbers. It is keeping meaning intact as those numbers move upward.
                </div>
                <div className="mt-4 max-w-md text-sm leading-6 text-white/85">
                  Specific enough to be credible, restrained enough to stay respectful, structured enough to invite the next conversation.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm md:p-7">
            <div className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: brand.cyan }}>
              What this environment is saying
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              NCF&rsquo;s reporting difficulty is structural, not cosmetic
            </h2>
            <div className="mt-5 space-y-4 text-sm leading-7" style={{ color: brand.textMuted }}>
              <p>
                A donor-advised fund organization of NCF&rsquo;s scale has to speak to multiple realities at once: stewardship conversations with givers, disciplined grant operations,
                formal financial reporting, local office performance, and public impact communication.
              </p>
              <p>
                The data problem is not merely fragmentation. It is that these realities mature on different timelines, serve different audiences, and are still expected to resolve into a
                coherent leadership narrative.
              </p>
              <p>
                That is why a stronger reporting model has to do more than aggregate. It has to distinguish signal from interpretation, separate operating truth from reporting lens,
                and keep stewardship intact all the way to the final decision.
              </p>
            </div>
          </div>

          <div
            className="rounded-[30px] border p-6 shadow-sm md:p-7"
            style={{ borderColor: "rgba(142,207,233,0.30)", background: "linear-gradient(135deg, #ecf8fd 0%, #ffffff 100%)" }}
          >
            <div className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: "#11789d" }}>
              Specific pressure points
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Where confidence is most likely to break</h2>
            <div className="mt-5 grid gap-3">
              {specificPainPoints.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border bg-white p-4"
                  style={{ borderColor: "rgba(142,207,233,0.30)" }}
                >
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-2 text-sm leading-6" style={{ color: brand.textMuted }}>
                    {item.copy}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[34px] border border-black/10 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 border-b border-black/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: brand.cyan }}>
                Top-to-bottom flow
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">From donor and grant signal to leadership story</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 md:text-base" style={{ color: brand.textMuted }}>
                Signals enter at the top, interpretation gets heavier in the middle, and leadership inherits whatever ambiguity remains at the bottom.
              </p>
            </div>
            <div
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: brand.cyanSoft, color: "#11789d" }}
            >
              specific to NCF&rsquo;s category and reporting reality
            </div>
          </div>

          <div className="mt-8 mx-auto max-w-5xl space-y-4">
            {stages.map((stage, idx) => (
              <div
                key={stage.title}
                className="group relative overflow-hidden rounded-[30px] border transition-all duration-300 hover:shadow-xl"
                style={{ backgroundColor: stage.panelBg, borderColor: stage.panelBorder }}
              >
                <div className="grid gap-0 md:grid-cols-[0.8fr_1.2fr]">
                  <div className="relative p-6 md:p-7">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundColor: stage.dotBg }}
                      >
                        0{idx + 1}
                      </div>
                      <div className="text-lg text-slate-500">{stage.icon}</div>
                      <div className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Lifecycle stage</div>
                    </div>
                    <div className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{stage.title}</div>
                    <div className="mt-3 text-sm leading-7" style={{ color: brand.textMuted }}>
                      {stage.signal}
                    </div>
                    {idx < stages.length - 1 && (
                      <div className="absolute -bottom-5 left-10 hidden h-10 w-px bg-slate-300 md:block" />
                    )}
                  </div>

                  <div className="relative border-t border-black/5 bg-white/70 p-6 backdrop-blur-sm md:border-l md:border-t-0 md:p-7">
                    <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Likely failure modes</div>
                        <div className="mt-3 space-y-2">
                          {stage.failures.map((item) => (
                            <div
                              key={item}
                              className="flex items-start gap-3 rounded-2xl p-3 ring-1 ring-black/5"
                              style={{ backgroundColor: brand.cardBg }}
                            >
                              <div className="mt-1 h-2.5 w-2.5 rounded-full bg-rose-400" />
                              <div className="text-sm leading-6 text-slate-700">{item}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div
                        className="rounded-[24px] p-4 text-white transition-all duration-300 group-hover:opacity-95"
                        style={{ backgroundColor: idx === 3 ? "#11789d" : "#111827" }}
                      >
                        <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/60">Stronger reporting principle</div>
                        <div className="mt-3 text-sm leading-7 text-white/92">{stage.opportunity}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-[34px] border border-black/10 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 border-b border-black/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: brand.cyan }}>
                How this becomes a system
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                The lifecycle above, mapped to the structure underneath
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 md:text-base" style={{ color: brand.textMuted }}>
                This page is not a deck. The concepts above already have a place to live: governed tables, a lens-labeled metric layer, and access that carries stewardship into the reporting experience itself.
              </p>
            </div>
            <Link
              href={executiveHref}
              className="rounded-full px-4 py-2 text-sm font-medium shadow-sm transition hover:opacity-90"
              style={{ backgroundColor: brand.cyanSoft, color: "#11789d" }}
            >
              See it in the executive view &rarr;
            </Link>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-black/10">
            <table className="w-full text-left text-sm">
              <thead style={{ backgroundColor: brand.cardBg }}>
                <tr>
                  <th className="w-[22%] px-5 py-3 font-semibold text-slate-700">Concept</th>
                  <th className="w-[34%] px-5 py-3 font-semibold text-slate-700">Structure</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Why it matters</th>
                </tr>
              </thead>
              <tbody>
                {systemBridge.map((row, idx) => (
                  <tr
                    key={row.concept}
                    className="align-top"
                    style={{ backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fafafa" }}
                  >
                    <td className="px-5 py-4 font-medium text-slate-900">{row.concept}</td>
                    <td className="px-5 py-4 font-mono text-[12px] text-slate-700">{row.structure}</td>
                    <td className="px-5 py-4 text-slate-700">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm md:p-7">
            <div className="text-xs font-medium uppercase tracking-[0.22em]" style={{ color: brand.cyan }}>
              Design principles for a better flow
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">What a stronger reporting model would respect</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {principles.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-black/8 p-4" style={{ backgroundColor: brand.cardBg }}>
                  <div
                    className="mb-3 h-14 rounded-2xl opacity-85"
                    style={{ background: "linear-gradient(135deg, #1ba6d9 0%, #9fdcf4 100%)" }}
                  />
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="mt-2 text-sm leading-6" style={{ color: brand.textMuted }}>
                    {item.copy}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-black/10 p-6 text-white shadow-sm md:p-7" style={{ backgroundColor: brand.dark }}>
            <div className="text-xs font-medium uppercase tracking-[0.22em] text-white/55">Environment posture</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Built to show understanding before proposing a fix</h2>
            <div className="mt-5 space-y-4 text-sm leading-7 text-white/82">
              <p>
                This version names the kinds of reporting tension NCF is managing: donor-advised fund activity, grant workflow timing,
                complex gift lag, office rollups, confidentiality, and multiple legitimate reporting lenses.
              </p>
              <p>
                It avoids naming internal systems because the point is to show that the pressure points are understood even before the full technical inventory is mapped.
              </p>
              <p>
                The executive view carries the first working surface: metrics with a reporting-lens label, ownership, and lineage visible on click.
              </p>
            </div>
            <div className="mt-6">
              <Link
                href={executiveHref}
                className="inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Open executive view &rarr;
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
