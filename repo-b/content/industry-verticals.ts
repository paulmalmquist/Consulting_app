export type IndustryCard = {
  title: string;
  description: string;
};

export type ReconstructCard = {
  title: string;
  description: string;
  outcome: string;
};

export type IndustrySection = {
  title: string;
  intro?: string;
  items: string[];
  closing?: string[];
};

export type IndustryVertical = {
  slug: 'real-estate-private-equity' | 'consumer-credit' | 'medical' | 'legal';
  label: string;
  themeKey: 'cyan' | 'amber' | 'rose' | 'violet';
  teaser: string;
  contactLabel: string;
  heroImageUrl: string;
  heroHeadline: string;
  heroSubheadline: string;
  whyItBreaks: IndustrySection;
  whatWeChange: IndustrySection;
  buyerProfile: string[];
  buyerSentence: string;
  reconstructCards: ReconstructCard[];
  engagementModel: {
    intro: string;
    principles: string[];
  };
  credibility: {
    intro: string;
    pillars: Array<{
      title: string;
      description: string;
    }>;
  };
  controlStatement: string;
  outcomeCards: IndustryCard[];
  typicalResults: string[];
  pageEndCta: string;
};

export const INDUSTRY_VERTICALS: IndustryVertical[] = [
  {
    slug: 'real-estate-private-equity',
    label: 'Real Estate Private Equity',
    themeKey: 'amber',
    teaser:
      'Turn fund data into answers LPs can trust.',
    contactLabel: 'Real Estate Private Equity',
    heroImageUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1800&q=80',
    heroHeadline: 'Turn fund data into answers LPs can trust.',
    heroSubheadline:
      'Clean fund, asset, and investor data so answers are traceable from source to output. The model stays yours. The math stays defensible.',
    whyItBreaks: {
      title: 'Why It Breaks',
      intro: 'The model isn\'t the problem. The chain around the model is.',
      items: [
        'Underwriting assumptions drift between analyst versions before IC sees the deal.',
        'The waterfall is defended out of one spreadsheet and one person\'s memory.',
        'Capital calls and distributions get tied out by hand every quarter.',
        'LP reporting is rebuilt from scratch each cycle because the inputs never settle.'
      ],
      closing: [
        'The breakdown isn\'t in the math.',
        'It\'s that no two people on the team would build the same number twice.'
      ]
    },
    whatWeChange: {
      title: 'What We Change',
      intro:
        'We get the fund data into one place, the waterfall logic out of the spreadsheet, and the reporting cycle into a system that runs the same way twice. Then AI — yours or a vendor\'s — can do something useful with it.',
      items: [
        'One source of truth for fund-level data, version-controlled and ownership-clear.',
        'Waterfall logic written down in a system the team can read, audit, and change without breaking IRRs.',
        'Capital activity that flows through a workflow with named owners and an audit trail, not an inbox.',
        'LP reporting assembled from the underlying data, not from last quarter\'s deck plus a few overrides.'
      ],
      closing: [
        'No silent forks of the model.',
        'No reporting rebuilt from memory.',
        'The math is the same on Tuesday as it was on Friday.'
      ]
    },
    buyerProfile: [
      'CFOs and COOs at REPE firms whose LP reporting still depends on one analyst with a folder of spreadsheets.',
      'IR leaders who get asked about AI in every LP meeting and don\'t have a serious answer yet.',
      'Operating partners watching deal screening eat partner hours that should go to underwriting.',
      'Firms that want AI on top of their fund data without giving up control of the model.'
    ],
    buyerSentence: 'Built for REPE operators who want the data right before the AI goes on top.',
    reconstructCards: [
      {
        title: 'Fund Data Layer',
        description:
          'One source of truth for asset, fund, and investor data. Pulled from Yardi, MRI, the asset team\'s Excel, and the IR portal — landed in a place every report can read.',
        outcome: 'The same number shows up in the LP report, the IC pack, and the GP dashboard.'
      },
      {
        title: 'Waterfall Out of Excel',
        description:
          'Waterfall logic written down in a system, version-controlled, with the math the audit team can read.',
        outcome: 'A waterfall change takes an hour and an approval, not a week and a panic.'
      },
      {
        title: 'Capital Activity Workflow',
        description:
          'Capital calls and distributions move through a workflow with owners, approvals, and a trail. The inbox stops being the system.',
        outcome: 'Capital call errors drop into the noise. The IR team stops apologizing.'
      },
      {
        title: 'AI-Ready LP Reporting',
        description:
          'The LP report assembles itself from the underlying data. What used to take a week of analyst time becomes a day of review — and an AI agent can draft the cover letter.',
        outcome: 'The GP gets back the week the analyst used to lose to reporting.'
      }
    ],
    engagementModel: {
      intro:
        'One workflow at a time. Fixed scope. Fixed fee. Parallel run before anything cuts over. The team that owns it after we leave is your team.',
      principles: [
        'We pick the workflow with the most reporting pain and the most AI upside.',
        'We build alongside the current process. Nothing breaks while we work.',
        'We hand back a runbook your analyst can run and your auditor can read.',
        'The data layer we build is yours. No platform lock-in. No SaaS subscription with our logo on it.'
      ]
    },
    credibility: {
      intro:
        'REPE operations live or die on whether the same number means the same thing to the GP, the LP, and the audit team. We work where those three views meet.',
      pillars: [
        {
          title: 'Fund Operations Fluency',
          description:
            'Asset reporting, capital events, and IC prep treated as one operating system, not four spreadsheets.'
        },
        {
          title: 'Model Integrity',
          description:
            'Waterfall, IRR, and allocation math kept controlled, versioned, and reviewable — not stored in a sheet only one person can open.'
        },
        {
          title: 'LP-Grade Reporting',
          description:
            'LP packages, capital account statements, and covenant outputs built so an LP\'s analyst can tie them out without a phone call.'
        },
        {
          title: 'AI on a Real Foundation',
          description:
            'The AI tools you adopt — copilots, agents, summarizers — work because the data underneath them is real, not because the demo was good.'
        }
      ]
    },
    controlStatement:
      'An AI that can\'t read your fund data without a human in the middle isn\'t going to help you raise the next fund.',
    outcomeCards: [
      {
        title: 'One Source of Truth for Fund Data',
        description:
          'The number in the LP report, the IC pack, and the GP dashboard is the same number, sourced the same way, every time.'
      },
      {
        title: 'A Waterfall the Audit Team Can Read',
        description:
          'Logic out of Excel, into a system, with a change history. IRR doesn\'t move because someone bumped a cell.'
      },
      {
        title: 'Capital Activity Without the Email Chain',
        description:
          'Calls and distributions through a workflow with owners and an audit trail. Errors drop. IR stops apologizing.'
      },
      {
        title: 'AI That Works the First Time',
        description:
          'The agent, copilot, or summary tool you pick has clean inputs. It does what the demo promised.'
      }
    ],
    typicalResults: [
      'Quarterly LP reporting cycle cut from a week of analyst time to a day of review.',
      'One source of truth for fund-level data — the same numbers in the LP report, the IC pack, and the GP dashboard.',
      'Waterfall logic the audit team can read without opening Excel.',
      'An AI summary on the GP\'s phone Sunday night that the CFO is willing to put their name on.'
    ],
    pageEndCta: 'See where the fund data is blocking the AI strategy.'
  },
  {
    slug: 'consumer-credit',
    label: 'Consumer Credit',
    themeKey: 'cyan',
    teaser:
      'AI-ready credit. Examiner-ready proof.',
    contactLabel: 'Consumer Credit',
    heroImageUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1800&q=80',
    heroHeadline:
      'AI-ready credit. Examiner-ready proof.',
    heroSubheadline:
      'Bring policy, decision data, and review evidence into a form AI can use and examiners can follow.',
    whyItBreaks: {
      title: 'Why It Breaks',
      intro: 'Credit policy isn\'t usually wrong. The execution around it is.',
      items: [
        'The policy lives in a PDF nobody reads cover to cover.',
        'Exception queues grow in inboxes nobody owns end to end.',
        'Overrides happen in chat and never make it back into the data.',
        'Servicing handoffs lose context between teams. The borrower notices.'
      ],
      closing: [
        'The risk isn\'t bad intent.',
        'It\'s that your decision history isn\'t actually a history. It\'s a story people tell from memory.'
      ]
    },
    whatWeChange: {
      title: 'What We Change',
      intro:
        'We get the policy machine-readable, the decisions captured, and the overrides traceable. Then the AI underwriter, the AI assist, or the AI servicing tool you pick can do its job without inventing answers.',
      items: [
        'Policy in a structured form an AI can cite, line by line.',
        'Exception queues in a workflow with an owner, a clock, and a reason code.',
        'Overrides recorded against the rule they overrode, with the rationale attached.',
        'Servicing handoffs that carry context — borrower notes, prior decisions, exception flags — instead of dropping it.'
      ],
      closing: [
        'No more shadow spreadsheets.',
        'No more "ask Maria, she remembers that one."',
        'The decision an AI makes is one a human can defend.'
      ]
    },
    buyerProfile: [
      'Chief Risk and Chief Credit officers at lenders whose policy is in a PDF and whose decisions are in inboxes.',
      'Heads of Underwriting watching exception volume grow faster than headcount.',
      'Compliance and audit leaders who don\'t want to be surprised by what an AI tool decided last quarter.',
      'Lenders evaluating credit AI vendors and noticing that the demo data looks nothing like their own.'
    ],
    buyerSentence: 'Built for credit teams that want AI in the decision loop without losing the audit trail.',
    reconstructCards: [
      {
        title: 'Policy in a Form a Machine Can Read',
        description:
          'Your underwriting and servicing policy out of PDFs, into a structured corpus an AI can cite — line by line, version by version.',
        outcome: 'Every AI-assisted decision comes with the policy section it relied on.'
      },
      {
        title: 'Exception Queue With an Owner',
        description:
          'Exceptions move through a workflow. One owner. One clock. One reason code. No more inbox triage.',
        outcome: 'Routing delays drop. Nothing sits unowned for a week.'
      },
      {
        title: 'Override Trail',
        description:
          'Every override captured against the rule it overrode, with the rationale, the analyst, and the outcome.',
        outcome: 'The override pattern shows up in monthly review instead of in a regulator letter.'
      },
      {
        title: 'Servicing Handoff That Carries Context',
        description:
          'Borrower notes, prior decisions, and exception flags travel with the file. The next team starts where the last one left off.',
        outcome: 'Borrower complaints about "I told the last person already" drop sharply.'
      }
    ],
    engagementModel: {
      intro:
        'One workflow at a time. The first one is usually the policy corpus or the exception queue, because both unblock everything else.',
      principles: [
        'Pick the workflow with the most decision pain and the most regulatory exposure.',
        'Build alongside the current process so nothing breaks while we work.',
        'Hand back a system your analysts run and your compliance team signs off on.',
        'No black boxes. Every AI-assisted decision is traceable to policy and data.'
      ]
    },
    credibility: {
      intro:
        'Credit operations fail at the seam between underwriting, servicing, and compliance — usually because the policy, the data, and the override history don\'t live in the same place. We work at that seam.',
      pillars: [
        {
          title: 'Credit Logic Awareness',
          description:
            'We\'ve sat through enough exception queues to know where the failure modes hide.'
        },
        {
          title: 'Explainability by Design',
          description:
            'Every AI-assisted decision in the systems we build comes with the policy section, the data point, and the rule that produced it.'
        },
        {
          title: 'Servicing Handoffs That Hold',
          description:
            'The handoff is the failure point. We rebuild it to carry context, not lose it.'
        },
        {
          title: 'Audit-Ready by Default',
          description:
            'Documentation is generated from the workflow, not assembled before the exam.'
        }
      ]
    },
    controlStatement:
      'An AI underwriter you can\'t defend in an exam is one you shouldn\'t deploy.',
    outcomeCards: [
      {
        title: 'Policy a Machine Can Cite',
        description:
          'AI-assisted decisions come with the policy section they used. The examiner can follow the chain.'
      },
      {
        title: 'Exception Queue Under Control',
        description:
          'One owner per item, one clock per decision. Routing delays drop, queue ages stop sneaking up on the team.'
      },
      {
        title: 'Override History That Exists',
        description:
          'Every override captured against the rule. Patterns surface in monthly review, not in a regulator letter.'
      },
      {
        title: 'AI That Earns Its Seat at the Table',
        description:
          'Underwriting AI you can put in front of an examiner without rehearsing the answer.'
      }
    ],
    typicalResults: [
      'Credit policy in a form an AI can cite, an analyst can search, and an examiner can read.',
      'Exception queue with one owner per item and a clock on every decision.',
      'Override history that ties back to the rule, the reason, and the analyst — every time.',
      'An AI underwriter or assistant whose answer comes with sources you can defend.'
    ],
    pageEndCta: 'See where the policy and the data aren\'t AI-ready yet.'
  },
  {
    slug: 'medical',
    label: 'Medical',
    themeKey: 'rose',
    teaser:
      'Denials move faster when the data is together.',
    contactLabel: 'Medical',
    heroImageUrl: 'https://images.unsplash.com/photo-1504439468489-c8920d796a29?auto=format&fit=crop&w=1800&q=80',
    heroHeadline:
      'Denials move faster when the data is together.',
    heroSubheadline:
      'Bring payer portal data, denial history, and authorization work queues into one controlled workflow.',
    whyItBreaks: {
      title: 'Why It Breaks',
      intro:
        'Revenue cycle workflows don\'t usually fail for lack of effort. They fail because the data and the queue sit in different places — and nobody can see the whole picture in one screen.',
      items: [
        'Authorization status changes get lost between payer portals and the team that needs to act on them.',
        'Denials are triaged days late, after the backlog has already formed.',
        'Coding and reconciliation rely on tie-outs nobody documented.',
        'Ownership blurs between intake, clinical, and billing. The owner of the work is whoever happens to look at the queue today.'
      ],
      closing: [
        'The exposure isn\'t abstract.',
        'It\'s reimbursement leakage, delayed cash, and a finance team that can\'t tell you why this month is worse than last.'
      ]
    },
    whatWeChange: {
      title: 'What We Change',
      intro:
        'We pull the revenue cycle data into one place, write down the routing logic in a form an AI can use, and put the queue in a system with owners and clocks. Then the AI tools you\'ve been pitched can actually move the needle.',
      items: [
        'One queue across payers, owners, and aging — not seven portals and a download.',
        'Authorization, denial, and payer reconciliation data landing in one place with one set of rules.',
        'Coding logic written down in a form an AI can cite, not a binder a coder remembers.',
        'Ownership and escalation logic that survives someone going on PTO.'
      ],
      closing: [
        'No more queue-by-folklore.',
        'No more reconciliation-by-spreadsheet.',
        'The AI vendor\'s demo finally runs on your data.'
      ]
    },
    buyerProfile: [
      'CFOs and VPs of Revenue Cycle at multi-site providers and MSOs whose margin depends on denial recovery.',
      'Operations leaders running prior auth and denial queues across more payer portals than they can count.',
      'Practice administrators who have evaluated three revenue cycle AI tools and walked away from all three.',
      'Providers who want AI to help, not add another login and another queue.'
    ],
    buyerSentence:
      'Built for revenue cycle teams who want AI to actually shorten the cash conversion cycle, not extend the demo.',
    reconstructCards: [
      {
        title: 'One Queue Across Payers',
        description:
          'Authorization, denial, and follow-up work in one queue with one set of rules — instead of seven payer portals and a daily download.',
        outcome: 'The team works from one screen. Denials get triaged the same day, not the same week.'
      },
      {
        title: 'Denial Pattern Visibility',
        description:
          'Denial reasons coded, aggregated, and surfaced where finance can see the trend forming.',
        outcome: 'The denial AI vendor\'s tool starts working — because the inputs are finally clean.'
      },
      {
        title: 'Coding Logic Written Down',
        description:
          'CPT and payer-specific coding rules in a form an AI assist can cite and a new coder can learn from.',
        outcome: 'First-pass clean claim rate goes up. New coder ramp time drops.'
      },
      {
        title: 'Reimbursement Reporting From Real Data',
        description:
          'Reporting assembled from the actual queue, not from a manually reconciled spreadsheet.',
        outcome: 'The finance team explains the month before the close call, not after it.'
      }
    ],
    engagementModel: {
      intro:
        'One workflow at a time. Usually the denial queue first — it\'s where the cash leaks loudest.',
      principles: [
        'Start where the cash leaks. Usually denials. Sometimes prior auth.',
        'Build alongside the current process so nothing in the billing cycle breaks while we work.',
        'Hand back a system the team uses every day and a runbook the new hire can follow.',
        'The data we land in your warehouse is yours. The AI tools you pick can read it directly.'
      ]
    },
    credibility: {
      intro:
        'Revenue cycle margin lives in the cracks between intake, clinical, billing, and the payer. We work in those cracks.',
      pillars: [
        {
          title: 'Revenue Cycle Depth',
          description:
            'Denial rates, payer reconciliation variance, and reimbursement timing handled as the financial issues they are.'
        },
        {
          title: 'Workflow Before AI',
          description:
            'Broken queues get fixed first. AI on top of a broken queue just makes the noise faster.'
        },
        {
          title: 'Compliance-Conscious by Default',
          description:
            'CPT alignment, reporting obligations, and documentation controls embedded in the workflow from day one.'
        },
        {
          title: 'Operational Visibility',
          description:
            'Practice-level dashboards tied to the actual queue, not to a spreadsheet a manager rebuilds Monday morning.'
        }
      ]
    },
    controlStatement:
      'The cash conversion cycle is the only AI metric that matters in revenue cycle. Anything else is a demo.',
    outcomeCards: [
      {
        title: 'One Queue, One Screen',
        description:
          'Authorization, denial, and follow-up work consolidated. The team stops switching portals all day.'
      },
      {
        title: 'Denial Recovery That Compounds',
        description:
          'Patterns visible early. The same denial doesn\'t happen 200 times before someone notices.'
      },
      {
        title: 'Coding That Survives Turnover',
        description:
          'Rules out of the binder, into a system. New coders ramp faster, AI assists cite the right rule.'
      },
      {
        title: 'Cash Conversion Cycle That Shortens',
        description:
          'The number that matters moves the right direction every month, with the receipts to show why.'
      }
    ],
    typicalResults: [
      'One queue across payers, with owners, clocks, and aging in one screen.',
      'Denial rework down sharply because the team sees the pattern before it accumulates.',
      'Coding rules in a form an AI assist can cite, not a binder.',
      'Cash conversion cycle that gets shorter every month, not noisier.'
    ],
    pageEndCta: 'See where the queue is blocking the cash conversion cycle.'
  },
  {
    slug: 'legal',
    label: 'Legal',
    themeKey: 'violet',
    teaser:
      'Get the legal record straight.',
    contactLabel: 'Legal',
    heroImageUrl: 'https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=1800&q=80',
    heroHeadline:
      'Get the legal record straight.',
    heroSubheadline:
      'Bring matter data, billing narratives, and intake logic into one reviewable record.',
    whyItBreaks: {
      title: 'Why It Breaks',
      intro: 'Legal judgment isn\'t the bottleneck. The administrative chain around it is.',
      items: [
        'Intake criteria mean different things in different practice groups.',
        'Matter status updates happen in email and never make it back into the system.',
        'Document triage adds days before the substantive work even starts.',
        'Billing narratives get cleaned up at the last minute, every cycle, by someone whose job that isn\'t.'
      ],
      closing: [
        'The problem isn\'t expertise.',
        'It\'s that the firm\'s data isn\'t structured the way the firm actually works.'
      ]
    },
    whatWeChange: {
      title: 'What We Change',
      intro:
        'We get the matter taxonomy, the intake logic, and the billing narrative format written down — in one place, in a form an AI tool can actually use. Then the AI you adopt does the work without a three-month cleanup per matter type.',
      items: [
        'Intake criteria standardized across practice groups, with a decision logic an AI can follow.',
        'Matter states governed in the system instead of tracked in side conversations.',
        'Document triage with controlled checkpoints so the substantive work starts sooner.',
        'Time entries and billing narratives tied to the matter event, captured at the time, not reconstructed at the end of the month.'
      ],
      closing: [
        'No more "ask the partner what this matter actually is."',
        'No more last-minute narrative cleanup.',
        'The firm\'s data finally looks like the firm\'s work.'
      ]
    },
    buyerProfile: [
      'COOs and Directors of Legal Ops at firms whose AI investments aren\'t producing the results the marketing promised.',
      'Managing partners watching non-billable time grow faster than the matter book.',
      'In-house legal ops leaders responsible for matter visibility across business units that don\'t speak the same way.',
      'Firms that have bought a drafting AI and quietly found it doesn\'t work on real matters.'
    ],
    buyerSentence:
      'Built for legal operators who want AI tools to actually save partner time, not generate first drafts no one will sign.',
    reconstructCards: [
      {
        title: 'Intake That Means the Same Thing',
        description:
          'Intake forms, qualification logic, and routing standardized across practice groups, in a form an AI can apply consistently.',
        outcome: 'The same matter type means the same thing on every desk. Intake AI starts working.'
      },
      {
        title: 'Matter State in the System',
        description:
          'Status changes captured at the moment they happen, in the matter management system, not in email.',
        outcome: 'Partners and clients see the same status. Updates stop being a side project.'
      },
      {
        title: 'Billing Narratives Tied to Events',
        description:
          'Time entries captured against the underlying work event, with the narrative written at the time, not the end of the month.',
        outcome: 'Realization goes up. End-of-month cleanup goes down. Client write-offs drop.'
      },
      {
        title: 'AI Drafting on Real Inputs',
        description:
          'Templates, prior matters, and firm-specific style fed to drafting AI tools in a form they can use.',
        outcome: 'First drafts that partners actually sign. Review time drops without losing voice.'
      }
    ],
    engagementModel: {
      intro:
        'Pick one practice group. Get the data and the workflow right for that group. Move to the next.',
      principles: [
        'Start with the practice group whose AI tools have failed loudest. The cleanup pays back fastest there.',
        'Build alongside the current matter system. Nothing in the billing cycle breaks while we work.',
        'Hand back a runbook the legal ops team owns and a partner-level summary the managing partner reads on a Sunday.',
        'No black boxes. The AI\'s output is traceable to the firm\'s own templates and prior matters.'
      ]
    },
    credibility: {
      intro:
        'Legal operations performance lives in the seam between intake, the matter system, the timekeeper, and the bill. We work in that seam.',
      pillars: [
        {
          title: 'Matter-Level Insight',
          description:
            'We trace where intake quality drops and where matter status starts disagreeing with reality.'
        },
        {
          title: 'Non-Billable Time Reduction',
          description:
            'Administrative drag attacked through workflow, not through asking the team to try harder.'
        },
        {
          title: 'Document Workflow Without Theater',
          description:
            'Document classification and triage built for partner speed, not for a vendor\'s screenshot.'
        },
        {
          title: 'Reporting That Holds Up With Clients',
          description:
            'Time entry, billing narrative, and client reporting aligned so what the client sees matches what the partner billed.'
        }
      ]
    },
    controlStatement:
      'A drafting AI is only as good as the templates and matters you\'ve actually written down.',
    outcomeCards: [
      {
        title: 'Intake That Holds Up Across Practice Groups',
        description: 'One definition per matter type. AI applies it the same way every time.'
      },
      {
        title: 'Matter Status That Matches Reality',
        description: 'Status in the system equals status the partner would tell you. The client sees one truth.'
      },
      {
        title: 'Realization That Goes Up',
        description: 'Time and narrative captured at the moment, not the month-end. Write-offs drop.'
      },
      {
        title: 'AI Drafts Worth Signing',
        description: 'Templates and prior matters in a form drafting AI can use. First drafts that don\'t get rewritten.'
      }
    ],
    typicalResults: [
      'Intake that means the same thing in every practice group.',
      'Matter state changes captured in the system, not in side email.',
      'Billing narratives written at the time of the work, not the end of the month.',
      'AI drafting and review tools that produce output partners will sign without rewriting.'
    ],
    pageEndCta: 'See where the matter data is blocking the AI tools you\'ve already bought.'
  }
];

export const INDUSTRY_VERTICAL_BY_SLUG: Record<IndustryVertical['slug'], IndustryVertical> =
  INDUSTRY_VERTICALS.reduce(
    (acc, vertical) => {
      acc[vertical.slug] = vertical;
      return acc;
    },
    {} as Record<IndustryVertical['slug'], IndustryVertical>
  );
