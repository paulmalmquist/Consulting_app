import type { CSSProperties, ReactNode } from "react";

/**
 * DataPipelineFlow — left-to-right Source → Model → Pipeline → Govern → Deliver
 * with an AI operating layer riding above the cards. The AI layer signals that
 * agents are useful only after data, definitions, and access are governed —
 * not as a separate product bolted onto the pipeline.
 *
 * Visual rules followed: cyberpunk touches kept restrained (clipped corners,
 * thin neon lines, dark panels, mono labels), no smooth SaaS rounding. Lives
 * inside .marketing-shell so all colors resolve from the --nv-* tokens.
 */

const clipCard =
  "polygon(0 14px, 14px 0, calc(100% - 22px) 0, 100% 22px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 22px 100%, 0 calc(100% - 22px))";
const clipRow =
  "polygon(0 8px, 8px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 10px 100%, 0 calc(100% - 10px))";
const clipPill =
  "polygon(0 5px, 5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px))";
const clipChip =
  "polygon(0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px))";

const sources = [
  { name: "ERP", detail: "Financial and operating records", glyph: "erp" },
  { name: "CRM", detail: "Pipeline, contacts, history", glyph: "crm" },
  { name: "Internal tools", detail: "Where the work happens", glyph: "tools" },
  { name: "Files / Excel", detail: "Absorbed into the record", glyph: "files" },
  { name: "Third-party data", detail: "External feeds and portals", glyph: "cloud" },
] as const;

const users = [
  { name: "Executives", detail: "Dashboards that drive decisions", glyph: "exec" },
  { name: "Analysts", detail: "Self-serve with trusted data", glyph: "analyst" },
  { name: "Operations", detail: "Answers in the flow of work", glyph: "ops" },
  { name: "AI agents", detail: "Use governed context to draft, check, and execute approved work", glyph: "agent" },
] as const;

const aiStages = [
  { id: "classify", label: "classify" },
  { id: "map", label: "map" },
  { id: "monitor", label: "monitor" },
  { id: "act", label: "act" },
] as const;

const flowStrip = ["Source", "Model", "Automate", "Govern", "Deliver"] as const;

export function DataPipelineFlow() {
  return (
    <section aria-label="Data strategy execution flow" className="nv-pipeline">
      <div className="nv-pipeline__rail">
        <div className="nv-pipeline__ai" style={{ clipPath: clipCard }}>
          <div className="nv-pipeline__ai-mark" aria-hidden>
            <AiGlyph />
          </div>
          <div className="nv-pipeline__ai-copy">
            <strong>AI operating layer</strong>
            <span>
              Reads context, checks definitions, drafts actions, and runs agents against governed data.
            </span>
          </div>
          <span className="nv-pipeline__ai-chip" style={{ clipPath: clipChip }}>
            human-approved
          </span>
        </div>
        <div className="nv-pipeline__ai-line" aria-hidden />
        {aiStages.map((stage, i) => (
          <span
            key={stage.id}
            className="nv-pipeline__ai-drop"
            data-position={i}
            aria-hidden
          >
            <span className="nv-pipeline__ai-drop-line" />
            <span className="nv-pipeline__ai-drop-label" style={{ clipPath: clipChip }}>
              {stage.label}
            </span>
          </span>
        ))}
      </div>

      <div className="nv-pipeline__cards">
        <PipelineCard index={1} title="Source systems">
          <ul className="nv-pipeline__rows">
            {sources.map((s) => (
              <li key={s.name} className="nv-pipeline__row" style={{ clipPath: clipRow }}>
                <span className="nv-pipeline__row-icon" aria-hidden>
                  <SourceGlyph kind={s.glyph} />
                </span>
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.detail}</small>
                </div>
              </li>
            ))}
          </ul>
          <CardFoot>Your data already lives somewhere.</CardFoot>
        </PipelineCard>

        <PipelineCard index={2} title="Data modeling & warehouse">
          <div className="nv-pipeline__visual">
            <WarehouseGlyph />
          </div>
          <Bullets
            items={[
              "Data warehouse design",
              "Modern lakehouse on Databricks, Snowflake, or Azure",
              "Modeled around the questions leadership asks",
            ]}
          />
          <CardFoot>
            Structured. Modeled.
            <br />
            Built for decisions.
          </CardFoot>
        </PipelineCard>

        <PipelineCard index={3} title="Pipeline & integration">
          <div className="nv-pipeline__visual">
            <PipelineGlyph />
          </div>
          <Bullets
            items={[
              "Pull from the systems where the work lives",
              "ETL/ELT in Python and SQL",
              "State, retries, and observability built in",
            ]}
          />
          <CardFoot>
            Data moves reliably.
            <br />
            Owned end to end.
          </CardFoot>
        </PipelineCard>

        <PipelineCard index={4} title="Semantic layer & governance">
          <div className="nv-pipeline__govern">
            <GovTile label="Metrics & definitions" tone="teal">
              <GovIconMetrics />
            </GovTile>
            <GovTile label="Business logic" tone="copper">
              <GovIconLogic />
            </GovTile>
            <GovTile label="Access & security" tone="warning">
              <GovIconShield />
            </GovTile>
            <GovTile label="Data quality" tone="success">
              <GovIconCheck />
            </GovTile>
          </div>
          <Bullets
            items={[
              "Governed metrics in Power BI",
              "Definitions tied to the source record",
              "Validation, access control, and lineage",
            ]}
          />
          <CardFoot>
            One definition.
            <br />
            Trusted by every team.
          </CardFoot>
        </PipelineCard>

        <PipelineCard index={5} title="End users">
          <ul className="nv-pipeline__rows">
            {users.map((u) => (
              <li key={u.name} className="nv-pipeline__row" style={{ clipPath: clipRow }}>
                <span className="nv-pipeline__row-icon" aria-hidden>
                  <UserGlyph kind={u.glyph} />
                </span>
                <div>
                  <strong>{u.name}</strong>
                  <small>{u.detail}</small>
                </div>
              </li>
            ))}
          </ul>
          <CardFoot>
            Trusted data.
            <br />
            Used by people and agents.
          </CardFoot>
        </PipelineCard>
      </div>

      <div className="nv-pipeline__strip" style={{ clipPath: clipPill }} aria-label="Pipeline stages">
        {flowStrip.map((step, i) => (
          <span key={step} className="nv-pipeline__strip-step" data-position={i}>
            {step}
          </span>
        ))}
      </div>

      <p className="nv-pipeline__control">Control · continuity · auditability</p>

      <PipelineStyles />
    </section>
  );
}

// ── Card scaffolding ──────────────────────────────────────────────────────────

function PipelineCard({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) {
  // Split children so the <CardFoot> always renders in the footer slot,
  // pushed to the bottom of the card. Everything else fills the body and
  // aligns the divider at the same baseline across all five columns.
  const childArray = Array.isArray(children) ? children : [children];
  const foot: ReactNode[] = [];
  const body: ReactNode[] = [];
  for (const child of childArray) {
    if (
      child &&
      typeof child === "object" &&
      "type" in child &&
      (child as { type?: unknown }).type === CardFoot
    ) {
      foot.push(child);
    } else {
      body.push(child);
    }
  }

  return (
    <article className="nv-pipeline__card" style={{ clipPath: clipCard }}>
      <h3 className="nv-pipeline__card-title">
        <span>{index}.</span> {title}
      </h3>
      <div className="nv-pipeline__card-body">{body}</div>
      {foot}
    </article>
  );
}

function CardFoot({ children }: { children: ReactNode }) {
  return <div className="nv-pipeline__card-foot">{children}</div>;
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="nv-pipeline__bullets">
      {items.map((item) => (
        <li key={item}>
          <span aria-hidden className="nv-pipeline__check">
            <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
              <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function GovTile({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "teal" | "copper" | "warning" | "success";
  children: ReactNode;
}) {
  const toneVar: Record<typeof tone, string> = {
    teal: "rgb(var(--nv-accent-teal))",
    copper: "rgb(var(--nv-accent-copper))",
    warning: "rgb(var(--nv-sem-warning))",
    success: "rgb(var(--nv-sem-success))",
  };
  return (
    <div
      className="nv-pipeline__gov-tile"
      style={{ clipPath: clipRow, ["--nv-tile-tone" as string]: toneVar[tone] } as CSSProperties}
    >
      <span className="nv-pipeline__gov-icon" aria-hidden>
        {children}
      </span>
      <strong>{label}</strong>
    </div>
  );
}

// ── Glyphs (inline SVG) ───────────────────────────────────────────────────────

function AiGlyph() {
  return (
    <svg viewBox="0 0 44 44" width="30" height="30" fill="none">
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="square">
        <path d="M22 8v9M22 27v9M8 22h9M27 22h9M12 12l6 6M32 12l-6 6M12 32l6-6M32 32l-6-6" />
      </g>
      <g fill="rgb(var(--nv-bg))" stroke="currentColor" strokeWidth="1.6">
        <circle cx="22" cy="22" r="6.6" />
        <circle cx="22" cy="6" r="3.2" />
        <circle cx="22" cy="38" r="3.2" />
        <circle cx="6" cy="22" r="3.2" />
        <circle cx="38" cy="22" r="3.2" />
        <circle cx="10" cy="10" r="2.6" />
        <circle cx="34" cy="10" r="2.6" />
        <circle cx="10" cy="34" r="2.6" />
        <circle cx="34" cy="34" r="2.6" />
      </g>
      <circle cx="22" cy="22" r="2" fill="currentColor" />
    </svg>
  );
}

function WarehouseGlyph() {
  return (
    <svg viewBox="0 0 160 140" width="148" height="128" fill="none" aria-hidden>
      <path
        d="M18 48 80 18l62 30v68H18V48Z"
        fill="rgb(var(--nv-surface) / 0.55)"
        stroke="rgb(var(--nv-accent-teal) / 0.55)"
        strokeWidth="1.4"
      />
      <g stroke="rgb(var(--nv-accent-teal) / 0.30)" strokeWidth="1">
        <path d="M18 48h124M32 48v68M56 48v68M80 48v68M104 48v68M128 48v68M18 70h124M18 92h124" />
        <path d="M80 18v30M42 36l38 12 38-12" />
      </g>
      <path
        d="M54 61h52v42H54z"
        fill="rgb(var(--nv-accent-teal) / 0.18)"
        stroke="rgb(var(--nv-accent-teal) / 0.65)"
        strokeWidth="1.3"
      />
      <g
        fill="rgb(var(--nv-accent-copper) / 0.22)"
        stroke="rgb(var(--nv-accent-copper) / 0.6)"
        strokeWidth="1.1"
      >
        <rect x="62" y="69" width="36" height="7" />
        <rect x="62" y="82" width="36" height="7" />
        <rect x="62" y="95" width="36" height="7" />
      </g>
    </svg>
  );
}

function PipelineGlyph() {
  return (
    <svg viewBox="0 0 120 120" width="112" height="112" fill="none" aria-hidden>
      <path
        d="M16 20h44a14 14 0 0 1 14 14v22a14 14 0 0 0 14 14h16"
        stroke="rgb(var(--nv-accent-teal) / 0.7)"
        strokeWidth="1.6"
      />
      <path
        d="M16 60h28a14 14 0 0 1 14 14v22"
        stroke="rgb(var(--nv-accent-copper) / 0.6)"
        strokeWidth="1.4"
      />
      <g
        fill="rgb(var(--nv-surface) / 0.7)"
        stroke="rgb(var(--nv-accent-teal) / 0.7)"
        strokeWidth="1.4"
      >
        <rect x="6" y="14" width="14" height="12" style={{ clipPath: clipRow }} />
        <rect x="6" y="54" width="14" height="12" style={{ clipPath: clipRow }} />
      </g>
      <g
        fill="rgb(var(--nv-surface) / 0.7)"
        stroke="rgb(var(--nv-accent-copper) / 0.7)"
        strokeWidth="1.4"
      >
        <rect x="100" y="64" width="14" height="12" />
        <rect x="50" y="92" width="14" height="12" />
      </g>
      <g fill="rgb(var(--nv-accent-teal) / 0.8)">
        <circle cx="36" cy="20" r="2" />
        <circle cx="74" cy="48" r="2" />
        <circle cx="98" cy="70" r="2" />
        <circle cx="42" cy="60" r="2" />
        <circle cx="58" cy="84" r="2" />
      </g>
      <g
        stroke="rgb(var(--nv-accent-teal) / 0.4)"
        strokeWidth="1"
        strokeDasharray="2 3"
      >
        <path d="M22 30v22M88 80v14" />
      </g>
    </svg>
  );
}

function GovIconMetrics() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
      <path d="M6 23h20M8 18l5-5 4 4 7-9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 6v20h20" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
    </svg>
  );
}

function GovIconLogic() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
      <path
        d="M7 8h8v6H7zM17 18h8v6h-8zM11 14v4h10M21 14v4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="21" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function GovIconShield() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
      <path
        d="M16 4 26 8v7c0 6-4 10-10 13C10 25 6 21 6 15V8l10-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M12 16l3 3 6-7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function GovIconCheck() {
  return (
    <svg viewBox="0 0 32 32" width="22" height="22" fill="none">
      <path d="M8 7h16v18H8z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 13h8M12 17h5M12 21h8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="24" cy="8" r="3.6" fill="currentColor" opacity="0.28" />
    </svg>
  );
}

function SourceGlyph({ kind }: { kind: (typeof sources)[number]["glyph"] }) {
  switch (kind) {
    case "erp":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 9h16M9 4v16" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
        </svg>
      );
    case "crm":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "tools":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path
            d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
      );
    case "files":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M6 3h9l4 4v14H6z" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 11h7M9 14h7M9 17h5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "cloud":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path
            d="M7 17h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6 10.5 3.5 3.5 0 0 0 7 17Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
  }
}

function UserGlyph({ kind }: { kind: (typeof users)[number]["glyph"] }) {
  switch (kind) {
    case "exec":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path d="M4 19h16M6 19V9l6 4 6-4v10" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "analyst":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.4" />
          <path d="m20 20-4-4" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "ops":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.4" />
          <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case "agent":
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <rect x="5" y="6" width="14" height="11" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="9" cy="11" r="1.2" fill="currentColor" />
          <circle cx="15" cy="11" r="1.2" fill="currentColor" />
          <path d="M12 6V3M9 17l-1 3M15 17l1 3" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      );
  }
}

// ── Scoped styles ─────────────────────────────────────────────────────────────
// Keeps the marketing CSS file untouched. Component-scoped via the
// .nv-pipeline parent class; tokens still come from --nv-* on .marketing-shell.

function PipelineStyles() {
  return (
    <style>{`
      .nv-pipeline {
        --nv-line: rgba(232,236,242,0.10);
        --nv-line-strong: rgba(232,236,242,0.18);
        position: relative;
        color: rgb(var(--nv-text-primary));
      }

      .nv-pipeline__rail {
        position: relative;
        height: 132px;
        margin-bottom: 8px;
      }

      .nv-pipeline__ai {
        position: relative;
        z-index: 2;
        width: min(620px, 60%);
        margin: 0 auto;
        padding: 14px 18px;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 16px;
        align-items: center;
        border: 1px solid rgb(var(--nv-accent-copper) / 0.32);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0)),
          radial-gradient(360px 80px at 22% 0%, rgb(var(--nv-accent-teal) / 0.14), transparent 66%),
          radial-gradient(340px 80px at 82% 100%, rgb(var(--nv-accent-copper) / 0.10), transparent 68%),
          rgb(var(--nv-surface) / 0.85);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 0 28px rgb(var(--nv-accent-copper) / 0.12),
          0 18px 40px rgba(0,0,0,0.32);
      }

      .nv-pipeline__ai-mark {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        color: rgb(var(--nv-accent-teal));
        border: 1px solid rgb(var(--nv-accent-teal) / 0.4);
        background: rgb(var(--nv-accent-teal) / 0.08);
        clip-path: polygon(50% 0, 100% 26%, 88% 82%, 50% 100%, 12% 82%, 0 26%);
      }

      .nv-pipeline__ai-copy strong {
        display: block;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 11.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-primary));
        margin-bottom: 3px;
      }
      .nv-pipeline__ai-copy span {
        display: block;
        font-size: 12.5px;
        line-height: 1.4;
        color: rgb(var(--nv-text-tertiary));
      }

      .nv-pipeline__ai-chip {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgb(var(--nv-accent-copper));
        border: 1px solid rgb(var(--nv-accent-copper) / 0.35);
        background: rgb(var(--nv-accent-copper) / 0.08);
        padding: 5px 9px;
        white-space: nowrap;
      }

      .nv-pipeline__ai-line {
        position: absolute;
        left: 17%;
        right: 17%;
        top: 86px;
        height: 1px;
        background: linear-gradient(90deg,
          transparent,
          rgb(var(--nv-accent-copper) / 0.55),
          rgb(var(--nv-accent-teal) / 0.4),
          rgb(var(--nv-accent-copper) / 0.55),
          transparent);
        opacity: 0.7;
        z-index: 1;
      }

      .nv-pipeline__ai-drop {
        position: absolute;
        top: 84px;
        transform: translateX(-50%);
        display: grid;
        justify-items: center;
        gap: 4px;
        z-index: 1;
      }
      .nv-pipeline__ai-drop[data-position="0"] { left: 20%; }
      .nv-pipeline__ai-drop[data-position="1"] { left: 40%; }
      .nv-pipeline__ai-drop[data-position="2"] { left: 60%; }
      .nv-pipeline__ai-drop[data-position="3"] { left: 80%; }

      .nv-pipeline__ai-drop-line {
        width: 1px;
        height: 24px;
        background: linear-gradient(180deg,
          rgb(var(--nv-accent-copper) / 0.85),
          rgb(var(--nv-accent-teal) / 0.55),
          transparent);
      }
      .nv-pipeline__ai-drop-label {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-secondary));
        background: rgb(var(--nv-surface) / 0.92);
        border: 1px solid rgb(var(--nv-accent-teal) / 0.28);
        padding: 4px 7px;
        white-space: nowrap;
      }

      .nv-pipeline__cards {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 16px;
        align-items: stretch;
      }

      .nv-pipeline__card {
        position: relative;
        min-height: 520px;
        padding: 28px 26px 26px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0) 36%),
          linear-gradient(135deg, rgb(var(--nv-accent-teal) / 0.045), rgb(var(--nv-accent-copper) / 0.028) 50%, transparent),
          rgb(var(--nv-surface));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 24px 56px rgba(0,0,0,0.32);
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .nv-pipeline__card::after {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 2px;
        background: linear-gradient(90deg,
          rgb(var(--nv-accent-teal) / 0.85),
          rgb(var(--nv-accent-copper) / 0.7),
          transparent 72%);
        opacity: 0.7;
      }

      .nv-pipeline__card-title {
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 12px;
        line-height: 1.35;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-primary));
        margin: 0 0 22px;
        font-weight: 500;
        min-height: 32px;
      }
      .nv-pipeline__card-title span {
        color: rgb(var(--nv-accent-teal));
        margin-right: 4px;
      }

      .nv-pipeline__card-body {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }

      .nv-pipeline__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }

      .nv-pipeline__row {
        position: relative;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        min-height: 50px;
        border: 1px solid var(--nv-line);
        background: rgb(var(--nv-bg) / 0.55);
        min-width: 0;
      }
      .nv-pipeline__row::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 2px;
        height: 100%;
        background: linear-gradient(180deg, rgb(var(--nv-accent-teal) / 0.6), transparent);
        opacity: 0.55;
      }
      .nv-pipeline__row-icon {
        color: rgb(var(--nv-text-secondary));
        display: grid;
        place-items: center;
      }
      .nv-pipeline__row > div { min-width: 0; }
      .nv-pipeline__row strong {
        display: block;
        font-size: 13px;
        font-weight: 500;
        line-height: 1.35;
        color: rgb(var(--nv-text-primary));
      }
      .nv-pipeline__row small {
        display: block;
        margin-top: 2px;
        font-size: 11.5px;
        line-height: 1.4;
        color: rgb(var(--nv-text-tertiary));
      }

      .nv-pipeline__visual {
        height: 168px;
        display: grid;
        place-items: center;
        color: rgb(var(--nv-accent-teal));
      }

      .nv-pipeline__govern {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin: 0;
      }
      .nv-pipeline__gov-tile {
        position: relative;
        display: grid;
        grid-template-columns: 26px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        padding: 14px 12px;
        min-width: 0;
        min-height: 64px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0) 60%),
          rgb(var(--nv-surface-raised));
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.06),
          0 6px 14px rgba(0,0,0,0.18);
      }
      .nv-pipeline__gov-tile::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        width: 2px;
        height: 100%;
        background: linear-gradient(180deg, var(--nv-tile-tone), transparent);
        opacity: 0.55;
      }
      .nv-pipeline__gov-icon {
        color: var(--nv-tile-tone);
        opacity: 0.85;
        display: grid;
        place-items: center;
      }
      .nv-pipeline__gov-tile strong {
        font-size: 12px;
        line-height: 1.3;
        font-weight: 500;
        color: rgb(var(--nv-text-primary));
        min-width: 0;
        overflow-wrap: break-word;
      }

      .nv-pipeline__bullets {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 12px;
      }
      .nv-pipeline__bullets li {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr);
        gap: 10px;
        font-size: 13px;
        line-height: 1.45;
        color: rgb(var(--nv-text-secondary));
        max-width: 32ch;
      }
      .nv-pipeline__check {
        color: rgb(var(--nv-accent-teal));
        display: grid;
        place-items: center;
        margin-top: 2px;
      }

      .nv-pipeline__card-foot {
        margin-top: 22px;
        padding-top: 14px;
        border-top: 1px solid var(--nv-line);
        font-size: 12.5px;
        line-height: 1.45;
        color: rgb(var(--nv-text-secondary));
        text-align: center;
      }

      .nv-pipeline__strip {
        margin: 28px auto 0;
        padding: 16px 24px;
        border: 1px solid var(--nv-line-strong);
        background:
          linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)),
          rgb(var(--nv-surface) / 0.82);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 18px 48px rgba(0,0,0,0.26);
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 10px;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 12.5px;
      }
      .nv-pipeline__strip-step {
        text-align: center;
        color: rgb(var(--nv-accent-teal));
        position: relative;
      }
      .nv-pipeline__strip-step:not(:last-child)::after {
        content: "→";
        position: absolute;
        right: -8px;
        top: 50%;
        transform: translateY(-50%);
        color: rgb(var(--nv-text-tertiary));
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      .nv-pipeline__strip-step[data-position="3"] { color: rgb(var(--nv-accent-copper)); }
      .nv-pipeline__strip-step[data-position="4"] { color: rgb(var(--nv-sem-success)); }

      .nv-pipeline__control {
        margin: 18px 0 0;
        text-align: center;
        font-family: var(--font-marketing-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgb(var(--nv-text-tertiary));
      }

      /* Tablet — collapse 5 cards into 2 columns, AI rail still spans */
      @media (max-width: 1180px) {
        .nv-pipeline__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .nv-pipeline__rail { height: auto; margin-bottom: 24px; }
        .nv-pipeline__ai { width: 100%; }
        .nv-pipeline__ai-line,
        .nv-pipeline__ai-drop { display: none; }
      }

      /* Mobile — single column, AI layer collapses to its panel only */
      @media (max-width: 720px) {
        .nv-pipeline__cards { grid-template-columns: minmax(0, 1fr); }
        .nv-pipeline__ai {
          grid-template-columns: auto 1fr;
          padding: 14px;
        }
        .nv-pipeline__ai-chip {
          grid-column: 2;
          justify-self: start;
        }
        .nv-pipeline__strip {
          grid-template-columns: minmax(0, 1fr);
          gap: 6px;
        }
        .nv-pipeline__strip-step::after { display: none; }
      }

      @media (prefers-reduced-motion: reduce) {
        .nv-pipeline * { transition: none !important; }
      }
    `}</style>
  );
}
