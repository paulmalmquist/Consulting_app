"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";
import { useElementWidth } from "@/hooks/usePretext";
import { Button } from "@/components/ui/Button";
import type { GatewayStatus } from "./useGatewayHealth";

// ---------------------------------------------------------------------------
// Font strings for pretext canvas measurement — named fonts, not CSS vars
// ---------------------------------------------------------------------------
const LABEL_FONT = '11px "JetBrains Mono", monospace';
const TITLE_FONT = '600 32px "Inter Tight", sans-serif';
const BODY_FONT = '400 14px "Inter", sans-serif';
const STATUS_FONT = '600 13px "Inter", sans-serif';
const SUBSYS_FONT = '500 10px "JetBrains Mono", monospace';

const LABEL_LH = 14;
const TITLE_LH = 38;
const BODY_LH = 22;
const STATUS_LH = 18;
const SUBSYS_LH = 14;

const DESCRIPTION =
  "Operational readiness across all business environments with fast visibility into live status, recent provisioning, and follow-up signals.";

const STATUS_MSG: Record<GatewayStatus, string> = {
  operational: "All services operational",
  degraded: "Operator services degraded",
  checking: "Checking services\u2026",
};

const SUBSYSTEMS = [
  { label: "SYS", key: "sys" },
  { label: "AI", key: "ai" },
  { label: "DOC", key: "doc" },
  { label: "NET", key: "net" },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type ControlTowerConsoleProps = {
  status: GatewayStatus;
  lastChecked: Date | null;
  activeCount: number;
  totalCount: number;
  industryCount: number;
  recentCount: number;
  loading?: boolean;
  onProvision?: () => void;
};

// ---------------------------------------------------------------------------
// Dot fill classes per status
// ---------------------------------------------------------------------------
const DOT_FILL: Record<GatewayStatus, string> = {
  operational: "fill-bm-success",
  degraded: "fill-bm-warning",
  checking: "fill-bm-muted2",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ControlTowerConsole({
  status,
  lastChecked,
  onProvision,
}: ControlTowerConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true));
  }, []);

  const statusMessage = STATUS_MSG[status];
  const lastCheckedStr = lastChecked
    ? lastChecked.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    : "\u2014";

  // -----------------------------------------------------------------------
  // Pretext measurement — gated on width + fonts
  // -----------------------------------------------------------------------
  const m = useMemo(() => {
    if (width <= 0 || !fontsReady) return null;

    const px = 28;
    const py = 24;
    const cw = width - px * 2;
    const descMax = Math.min(cw, 640);

    // Prepare text segments (cached internally by pretext)
    const supertitleP = prepareWithSegments("OPERATIONS COMMAND", LABEL_FONT);
    const titleP = prepareWithSegments("Control Tower", TITLE_FONT);
    const descP = prepareWithSegments(DESCRIPTION, BODY_FONT);

    // Layout
    const supertitle = layoutWithLines(supertitleP, cw, LABEL_LH);
    const title = layoutWithLines(titleP, cw, TITLE_LH);
    const desc = layoutWithLines(descP, descMax, BODY_LH);

    // Stack zones vertically
    let y = py;

    const supertitleY = y;
    y += supertitle.height + 8;

    const titleY = y;
    y += title.height + 16;

    const descY = y;
    y += desc.height + 24;

    const dividerY = y;
    y += 24;

    const statusY = y;
    const statusBlockH = LABEL_LH + 6 + STATUS_LH;
    y += statusBlockH + 20;

    const subsysY = y;
    y += SUBSYS_LH + 12 + py;

    return {
      px,
      cw,
      supertitleY,
      titleY,
      descY,
      desc,
      dividerY,
      statusY,
      subsysY,
      h: y,
    };
  }, [width, fontsReady]);

  // Subsystem status: DOC is always operational, others follow gateway
  const subsysStatus = (key: string): GatewayStatus =>
    key === "doc" ? "operational" : status;

  const isNarrow = width > 0 && width - 56 < 400;

  return (
    <section className="rounded-xl border border-bm-border/10 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.92),hsl(var(--bm-bg-2)/0.86))] shadow-[0_20px_38px_-34px_rgba(5,9,14,0.95)]">
      <div className="flex flex-col gap-6 px-6 py-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1" ref={containerRef}>
          {m ? (
            <svg
              viewBox={`0 0 ${width} ${m.h}`}
              width="100%"
              height={m.h}
              role="img"
              aria-label={`Control Tower — ${statusMessage}`}
            >
              <defs>
                <filter
                  id="ctcGlow"
                  x="-100%"
                  y="-100%"
                  width="300%"
                  height="300%"
                >
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
                </filter>
              </defs>

              {/* ---- Zone E: Corner tick marks ---- */}
              <g
                stroke="hsl(var(--bm-border))"
                strokeWidth={1}
                strokeOpacity={0.18}
              >
                <line x1={4} y1={4} x2={22} y2={4} />
                <line x1={4} y1={4} x2={4} y2={22} />

                <line x1={width - 22} y1={4} x2={width - 4} y2={4} />
                <line x1={width - 4} y1={4} x2={width - 4} y2={22} />

                <line
                  x1={4}
                  y1={m.h - 4}
                  x2={22}
                  y2={m.h - 4}
                />
                <line
                  x1={4}
                  y1={m.h - 22}
                  x2={4}
                  y2={m.h - 4}
                />

                <line
                  x1={width - 22}
                  y1={m.h - 4}
                  x2={width - 4}
                  y2={m.h - 4}
                />
                <line
                  x1={width - 4}
                  y1={m.h - 22}
                  x2={width - 4}
                  y2={m.h - 4}
                />
              </g>

              {/* ---- Zone A: Header ---- */}
              <text
                x={m.px}
                y={m.supertitleY}
                dominantBaseline="hanging"
                className="fill-bm-muted2"
                fontFamily='"JetBrains Mono", monospace'
                fontSize={11}
                letterSpacing="0.16em"
              >
                OPERATIONS COMMAND
              </text>
              <text
                x={m.px}
                y={m.titleY}
                dominantBaseline="hanging"
                className="fill-bm-text"
                fontFamily='"Inter Tight", sans-serif'
                fontSize={32}
                fontWeight={600}
                letterSpacing="-0.02em"
              >
                Control Tower
              </text>

              {/* ---- Zone B: Description (pretext multiline) ---- */}
              {m.desc.lines.map((line, i) => (
                <text
                  key={i}
                  x={m.px}
                  y={m.descY + i * BODY_LH}
                  dominantBaseline="hanging"
                  className="fill-bm-muted"
                  fontFamily='"Inter", sans-serif'
                  fontSize={14}
                >
                  {line.text}
                </text>
              ))}

              {/* ---- Divider ---- */}
              <line
                x1={m.px}
                y1={m.dividerY}
                x2={width - m.px}
                y2={m.dividerY}
                stroke="hsl(var(--bm-border))"
                strokeWidth={1}
                strokeOpacity={0.12}
              />

              {/* ---- Zone C: Status Console ---- */}
              {/* Status dot */}
              <circle
                cx={m.px + 5}
                cy={m.statusY + LABEL_LH + 6 + STATUS_LH / 2}
                r={4}
                className={DOT_FILL[status]}
              />
              {status === "operational" && (
                <circle
                  cx={m.px + 5}
                  cy={m.statusY + LABEL_LH + 6 + STATUS_LH / 2}
                  r={4}
                  className="fill-bm-success"
                  opacity={0.4}
                  filter="url(#ctcGlow)"
                />
              )}
              {status === "checking" && (
                <circle
                  cx={m.px + 5}
                  cy={m.statusY + LABEL_LH + 6 + STATUS_LH / 2}
                  r={4}
                  className="fill-bm-muted2"
                >
                  <animate
                    attributeName="opacity"
                    values="0.3;0.8;0.3"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Status labels */}
              <text
                x={m.px + 16}
                y={m.statusY}
                dominantBaseline="hanging"
                className="fill-bm-muted2"
                fontFamily='"JetBrains Mono", monospace'
                fontSize={10}
                letterSpacing="0.16em"
              >
                SYSTEM STATUS
              </text>
              <text
                x={m.px + 16}
                y={m.statusY + LABEL_LH + 6}
                dominantBaseline="hanging"
                className="fill-bm-text"
                fontFamily='"Inter", sans-serif'
                fontSize={13}
                fontWeight={600}
              >
                {statusMessage}
              </text>

              {/* Last check (right-aligned, hidden on narrow) */}
              {!isNarrow && (
                <>
                  <text
                    x={width - m.px}
                    y={m.statusY}
                    dominantBaseline="hanging"
                    textAnchor="end"
                    className="fill-bm-muted2"
                    fontFamily='"JetBrains Mono", monospace'
                    fontSize={10}
                    letterSpacing="0.14em"
                  >
                    LAST CHECK
                  </text>
                  <text
                    x={width - m.px}
                    y={m.statusY + LABEL_LH + 6}
                    dominantBaseline="hanging"
                    textAnchor="end"
                    className="fill-bm-muted"
                    fontFamily='"Inter", sans-serif'
                    fontSize={13}
                  >
                    {lastCheckedStr}
                  </text>
                </>
              )}

              {/* ---- Zone D: Subsystem Readout ---- */}
              {SUBSYSTEMS.map((sub, i) => {
                const cellW = m.cw / SUBSYSTEMS.length;
                const cx = m.px + i * cellW + cellW / 2;
                const subSt = subsysStatus(sub.key);
                return (
                  <g key={sub.key}>
                    {i > 0 && (
                      <line
                        x1={m.px + i * cellW}
                        y1={m.subsysY - 2}
                        x2={m.px + i * cellW}
                        y2={m.subsysY + SUBSYS_LH + 8}
                        stroke="hsl(var(--bm-border))"
                        strokeWidth={1}
                        strokeOpacity={0.1}
                      />
                    )}
                    <circle
                      cx={cx - 14}
                      cy={m.subsysY + SUBSYS_LH / 2}
                      r={3}
                      className={DOT_FILL[subSt]}
                    />
                    <text
                      x={cx + 2}
                      y={m.subsysY}
                      dominantBaseline="hanging"
                      textAnchor="middle"
                      className="fill-bm-muted2"
                      fontFamily='"JetBrains Mono", monospace'
                      fontSize={10}
                      fontWeight={500}
                      letterSpacing="0.18em"
                    >
                      {sub.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <ConsoleSkeleton />
          )}
        </div>

        {onProvision && (
          <div className="shrink-0">
            <Button
              variant="secondary"
              size="md"
              onClick={onProvision}
              className="border-bm-border/20 bg-bm-surface/68 px-4 hover:border-bm-accent/40 hover:bg-bm-surface/86"
            >
              + New Environment
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skeleton shown before fonts load / during SSR
// ---------------------------------------------------------------------------
function ConsoleSkeleton() {
  return (
    <div className="space-y-4 py-2" aria-hidden="true">
      <div className="h-3 w-32 animate-pulse rounded bg-bm-surface2/80" />
      <div className="h-8 w-56 animate-pulse rounded bg-bm-surface2/85" />
      <div className="space-y-2">
        <div className="h-4 w-full max-w-lg animate-pulse rounded bg-bm-surface2/70" />
        <div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-bm-surface2/60" />
      </div>
      <div className="h-px bg-bm-border/10" />
      <div className="flex justify-between">
        <div className="h-6 w-40 animate-pulse rounded bg-bm-surface2/70" />
        <div className="h-6 w-24 animate-pulse rounded bg-bm-surface2/70" />
      </div>
    </div>
  );
}
