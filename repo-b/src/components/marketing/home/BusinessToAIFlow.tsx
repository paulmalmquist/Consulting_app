import type { ReactNode } from "react";

/**
 * BusinessToAIFlow — homepage translation layer.
 *
 * Five-stage operating path (Business logic → Data engineering → BI →
 * Modeling → AI execution) followed by a three-panel band that grounds the
 * promise: common company problems, what Novendor adds, and a small terminal
 * trace that makes the controlled-execution claim concrete.
 *
 * Stays inside .marketing-shell so all colors resolve from --nv-* tokens.
 * Cyberpunk treatment kept restrained: clipped corners, thin neon accent
 * stripes, mono uppercase labels — no glow halos, no large neon blocks.
 */

const clipNode =
  "polygon(14px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 14px)";
const clipBand =
  "polygon(12px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 12px)";

type FlowNode = {
  num: string;
  kicker: string;
  title: string;
  body: string;
  tags: readonly string[];
  tone: "teal" | "copper" | "warning" | "success" | "pink";
};

const flow: readonly FlowNode[] = [
  {
    num: "01",
    kicker: "business logic",
    title: "Map how work really happens",
    body: "Find the approvals, workarounds, owner gaps, and decision points that slow the business down.",
    tags: ["Process", "Owners", "Exceptions"],
    tone: "teal",
  },
  {
    num: "02",
    kicker: "data engineering",
    title: "Make the data usable",
    body: "Connect source systems, clean records, preserve lineage, and keep raw exports available for audit.",
    tags: ["SQL", "Python", "Warehouse"],
    tone: "copper",
  },
  {
    num: "03",
    kicker: "BI layer",
    title: "Give the business a shared view",
    body: "Define metrics, build semantic models, expose reconciled dashboards, and remove conflicting answers.",
    tags: ["Power BI", "DAX", "Semantic"],
    tone: "warning",
  },
  {
    num: "04",
    kicker: "modeling",
    title: "Encode the decision logic",
    body: "Turn rules, scenarios, thresholds, and forecasts into repeatable models the team can inspect.",
    tags: ["Scenarios", "Rules", "Forecast"],
    tone: "success",
  },
  {
    num: "05",
    kicker: "AI execution",
    title: "Run AI inside guardrails",
    body: "Use AI where it can read, reason, draft, classify, route, and recommend with receipts and review.",
    tags: ["RAG", "Tools", "Audit"],
    tone: "pink",
  },
];

const problems = [
  { tag: "Systems", body: "Critical records are split across ERPs, CRMs, portals, files, and team-owned spreadsheets." },
  { tag: "Metrics", body: "Teams use the same words for different calculations, then argue over whose report is right." },
  { tag: "Handoffs", body: "Approvals, exceptions, and status changes happen in email, chat, and offline trackers." },
  { tag: "AI risk", body: "Leadership wants AI output before the data, definitions, and review paths are ready." },
];

const additions = [
  { tag: "States", body: "Every workflow gets clear status, ownership, exception handling, and rollback paths." },
  { tag: "Evidence", body: "Every AI-assisted answer carries source context, data trail, and review visibility." },
  { tag: "Control", body: "The company keeps the operating logic instead of burying it inside another vendor tool." },
];

export function BusinessToAIFlow() {
  return (
    <div className="nv-bizflow">
      <div className="nv-bizflow__head">
        <p className="nv-eyebrow">
          <span className="nv-eyebrow-dot" />
          Novendor operating logic
        </p>
        <h2 className="nv-h2 nv-bizflow__headline">
          From business friction to governed <em>AI</em> execution.
        </h2>
        <p className="nv-lede nv-bizflow__lede">
          We turn business process, source data, reporting logic, models, and AI-assisted work into one
          controlled operating path.
        </p>
      </div>

      <section className="nv-bizflow__frame">
        <div className="nv-bizflow__topline">
          <span className="nv-bizflow__title">
            Business → Data → Model → AI → Operating control
          </span>
          <span className="nv-bizflow__stamp">Translation layer</span>
        </div>

        <div className="nv-bizflow__flow">
          {flow.map((node, i) => (
            <article
              key={node.num}
              className={`nv-bizflow__node nv-bizflow__node--${node.tone}`}
              style={{ clipPath: clipNode }}
            >
              <p className="nv-bizflow__num">
                {node.num} · {node.kicker}
              </p>
              <h3 className="nv-bizflow__node-title">{node.title}</h3>
              <p className="nv-bizflow__node-body">{node.body}</p>
              <ul className="nv-bizflow__chips">
                {node.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
              {i < flow.length - 1 ? (
                <span className="nv-bizflow__arrow" aria-hidden>
                  →
                </span>
              ) : null}
            </article>
          ))}
        </div>

        <div className="nv-bizflow__bands">
          <Band title="Common company problems" rows={problems} />
          <Band title="What Novendor adds" rows={additions} />
          <Band title="Client-facing translation">
            <Terminal />
          </Band>
        </div>

        <p className="nv-bizflow__caption">
          Execution systems built by people who understand business data from source to decision.
        </p>
      </section>

      <BizFlowStyles />
    </div>
  );
}

function Band({
  title,
  rows,
  children,
}: {
  title: string;
  rows?: readonly { tag: string; body: string }[];
  children?: ReactNode;
}) {
  return (
    <div className="nv-bizflow__band" style={{ clipPath: clipBand }}>
      <h4 className="nv-bizflow__band-title">{title}</h4>
      {rows ? (
        <ul className="nv-bizflow__rows">
          {rows.map((row) => (
            <li key={row.tag} className="nv-bizflow__row">
              <span className="nv-bizflow__row-tag">{row.tag}</span>
              <span className="nv-bizflow__row-body">{row.body}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

function Terminal() {
  return (
    <div className="nv-bizflow__terminal" role="presentation">
      <div className="nv-bizflow__termbar">
        <span>workflow trace</span>
        <span className="nv-bizflow__term-status">controlled</span>
      </div>
      <div className="nv-bizflow__term">
        <div>
          <span className="nv-bizflow__term-prompt">&gt;</span> business rule captured
        </div>
        <div>
          ├─ source data mapped <span className="nv-bizflow__term-ok">valid</span>
        </div>
        <div>
          ├─ metric logic reconciled <span className="nv-bizflow__term-ok">valid</span>
        </div>
        <div>
          ├─ model state approved <span className="nv-bizflow__term-warn">reviewed</span>
        </div>
        <div>
          └─ AI action ready <span className="nv-bizflow__term-cyan">receipt required</span>
        </div>
        <div>
          <span className="nv-bizflow__term-prompt">&gt;</span>{" "}
          <span className="nv-bizflow__term-strong">execute with rollback protection</span>
        </div>
      </div>
    </div>
  );
}

function BizFlowStyles() {
  return (
    <style>{`
      .nv-bizflow {
        --nv-line: rgba(232,236,242,0.10);
        --nv-line-strong: rgba(232,236,242,0.18);
        position: relative;
        color: rgb(var(--nv-text-primary));
      }

      .nv-bizflow__head {
        max-width: 760px;
        margin-bottom: 22px;
      }
      .nv-bizflow__headline { margin: 14px 0 14px; }
      .nv-bizflow__lede { margin: 0; }

      .nv-bizflow__frame {
        position: relative;
        padding: 24px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005)),
          rgb(var(--nv-surface) / 0.92);
        box-shadow:
          inset 0 1px 0 rgb(var(--nv-accent-copper) / 0.45),
          0 28px 80px rgba(0,0,0,0.42);
      }

      .nv-bizflow__topline {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 18px;
      }
      .nv-bizflow__title {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 12.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-primary));
        font-weight: 600;
      }
      .nv-bizflow__stamp {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
      }

      .nv-bizflow__flow {
        position: relative;
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 22px;
      }

      .nv-bizflow__node {
        position: relative;
        min-height: 200px;
        padding: 18px 20px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.005)),
          rgb(var(--nv-surface));
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .nv-bizflow__node::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        height: 2px;
        background: var(--nv-tone, rgb(var(--nv-accent-teal)));
        opacity: 0.7;
      }
      .nv-bizflow__node--teal    { --nv-tone: rgb(var(--nv-accent-teal)); }
      .nv-bizflow__node--copper  { --nv-tone: rgb(var(--nv-accent-copper)); }
      .nv-bizflow__node--warning { --nv-tone: rgb(var(--nv-sem-warning)); }
      .nv-bizflow__node--success { --nv-tone: rgb(var(--nv-sem-success)); }
      .nv-bizflow__node--pink    { --nv-tone: rgb(var(--nv-accent-copper)); }

      .nv-bizflow__num {
        margin: 0 0 12px;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--nv-tone, rgb(var(--nv-accent-teal)));
        font-weight: 600;
      }
      .nv-bizflow__node-title {
        margin: 0 0 10px;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 13px;
        line-height: 1.3;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-primary));
        font-weight: 600;
      }
      .nv-bizflow__node-body {
        margin: 0 0 12px;
        color: rgb(var(--nv-text-secondary));
        font-size: 13px;
        line-height: 1.5;
        flex: 1 1 auto;
      }

      .nv-bizflow__chips {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .nv-bizflow__chips li {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 9px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
        padding: 4px 8px;
        border: 1px solid var(--nv-line);
        background: rgb(var(--nv-bg) / 0.55);
      }

      .nv-bizflow__arrow {
        position: absolute;
        right: -14px;
        top: 64px;
        width: 18px;
        height: 18px;
        display: grid;
        place-items: center;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 14px;
        color: rgb(var(--nv-accent-teal));
        z-index: 3;
      }

      .nv-bizflow__bands {
        display: grid;
        grid-template-columns: 1.15fr 1fr 1fr;
        gap: 14px;
      }
      .nv-bizflow__band {
        position: relative;
        padding: 16px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)),
          rgb(var(--nv-surface-raised));
        box-shadow: inset 0 1px 0 rgb(var(--nv-accent-copper) / 0.30);
        min-width: 0;
      }
      .nv-bizflow__band-title {
        margin: 0 0 12px;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 11.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-primary));
        font-weight: 600;
      }
      .nv-bizflow__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0;
      }
      .nv-bizflow__row {
        display: grid;
        grid-template-columns: 88px minmax(0, 1fr);
        gap: 12px;
        padding: 9px 0;
        border-top: 1px solid var(--nv-line);
        font-size: 12.5px;
        line-height: 1.45;
        color: rgb(var(--nv-text-secondary));
      }
      .nv-bizflow__row:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .nv-bizflow__row-tag {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
      }

      .nv-bizflow__terminal {
        margin-top: 4px;
        border: 1px solid var(--nv-line-strong);
        background: rgb(var(--nv-bg));
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 11.5px;
        line-height: 1.7;
      }
      .nv-bizflow__termbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--nv-line);
        font-size: 9.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
      }
      .nv-bizflow__term-status {
        color: rgb(var(--nv-accent-teal));
      }
      .nv-bizflow__term-status::before {
        content: "● ";
      }
      .nv-bizflow__term {
        padding: 12px;
        color: rgb(var(--nv-text-tertiary));
      }
      .nv-bizflow__term-prompt { color: rgb(var(--nv-accent-copper)); }
      .nv-bizflow__term-ok     { color: rgb(var(--nv-sem-success)); margin-left: 6px; }
      .nv-bizflow__term-warn   { color: rgb(var(--nv-sem-warning)); margin-left: 6px; }
      .nv-bizflow__term-cyan   { color: rgb(var(--nv-accent-teal)); margin-left: 6px; }
      .nv-bizflow__term-strong { color: rgb(var(--nv-text-primary)); }

      .nv-bizflow__caption {
        margin: 18px 0 0;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
      }

      /* Tablet — collapse 5 to 3, then 2 */
      @media (max-width: 1180px) {
        .nv-bizflow__flow { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .nv-bizflow__node:nth-child(n+4) .nv-bizflow__arrow,
        .nv-bizflow__node:nth-child(3) .nv-bizflow__arrow { display: none; }
        .nv-bizflow__bands { grid-template-columns: 1fr 1fr; }
        .nv-bizflow__bands > :last-child { grid-column: 1 / -1; }
      }

      @media (max-width: 820px) {
        .nv-bizflow__frame { padding: 22px; }
        .nv-bizflow__flow { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .nv-bizflow__arrow { display: none; }
        .nv-bizflow__topline { flex-direction: column; align-items: flex-start; gap: 6px; }
      }

      @media (max-width: 560px) {
        .nv-bizflow__flow { grid-template-columns: minmax(0, 1fr); }
        .nv-bizflow__bands { grid-template-columns: minmax(0, 1fr); }
        .nv-bizflow__row { grid-template-columns: minmax(0, 1fr); gap: 4px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .nv-bizflow * { transition: none !important; }
      }
    `}</style>
  );
}
