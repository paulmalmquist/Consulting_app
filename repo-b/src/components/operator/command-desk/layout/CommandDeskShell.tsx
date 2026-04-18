"use client";
import type { CSSProperties, ReactNode } from "react";

type CommandDeskShellProps = {
  topBar: ReactNode;
  filterStrip?: ReactNode;
  kpiStrip?: ReactNode;
  left: ReactNode;
  rightRail?: ReactNode;
  bottomBand?: ReactNode;
  statusBar?: ReactNode;
  theme?: "dark" | "light";
};

export function CommandDeskShell({
  topBar,
  filterStrip,
  kpiStrip,
  left,
  rightRail,
  bottomBand,
  statusBar,
  theme = "dark",
}: CommandDeskShellProps) {
  const rootStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: "var(--bg-base)",
    color: "var(--fg-1)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--fs-13)",
    overflow: "hidden",
  };

  return (
    <div data-command-desk data-theme={theme} style={rootStyle}>
      <div style={{ flex: "none" }}>{topBar}</div>
      {filterStrip && <div style={{ flex: "none" }}>{filterStrip}</div>}
      {kpiStrip && <div style={{ flex: "none" }}>{kpiStrip}</div>}
      <div
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: rightRail ? "minmax(0, 1fr) 360px" : "minmax(0, 1fr)",
        }}
        className="cd-main-split"
      >
        <div
          style={{
            position: "relative",
            minHeight: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "var(--bg-base)",
          }}
        >
          {left}
        </div>
        {rightRail && (
          <aside
            className="cd-rail"
            style={{
              borderLeft: "1px solid var(--line-2)",
              background: "var(--bg-void)",
              minHeight: 0,
              overflowY: "auto",
              padding: 10,
            }}
          >
            {rightRail}
          </aside>
        )}
      </div>
      {bottomBand && <div style={{ flex: "none" }}>{bottomBand}</div>}
      {statusBar && <div style={{ flex: "none" }}>{statusBar}</div>}

      <style jsx>{`
        @media (max-width: 1023px) {
          :global([data-command-desk]) .cd-main-split {
            grid-template-columns: 1fr !important;
          }
          :global([data-command-desk]) .cd-rail {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
