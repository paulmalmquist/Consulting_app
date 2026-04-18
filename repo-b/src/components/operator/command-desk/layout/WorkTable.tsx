"use client";
import type { CSSProperties, ReactNode } from "react";

export type WorkTableColumn<T> = {
  key: string;
  header: string;
  width: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
};

export type WorkTableRowAccent = {
  borderLeft?: string;
  glow?: boolean;
  rowTint?: string;
};

type WorkTableProps<T> = {
  rows: T[];
  columns: WorkTableColumn<T>[];
  rowKey: (row: T) => string;
  selectedId?: string | null;
  onSelect?: (row: T) => void;
  rowAccent?: (row: T) => WorkTableRowAccent | undefined;
  stickyHeader?: boolean;
  emptyState?: ReactNode;
};

export function WorkTable<T>({
  rows,
  columns,
  rowKey,
  selectedId,
  onSelect,
  rowAccent,
  stickyHeader = true,
  emptyState,
}: WorkTableProps<T>) {
  const grid = columns.map((c) => c.width).join(" ");

  const headerStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: grid,
    padding: "6px 14px",
    borderBottom: "1px solid var(--line-2)",
    background: "var(--bg-panel-2)",
    color: "var(--fg-3)",
    letterSpacing: ".08em",
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "var(--font-mono)",
  };
  if (stickyHeader) {
    headerStyle.position = "sticky";
    headerStyle.top = 0;
    headerStyle.zIndex = 2;
  }

  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 0, background: "var(--bg-base)" }}>
      <div style={headerStyle}>
        {columns.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? "left" }}>
            {c.header}
          </div>
        ))}
      </div>
      {rows.length === 0 && emptyState && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--fg-3)" }}>{emptyState}</div>
      )}
      {rows.map((row) => {
        const id = rowKey(row);
        const active = selectedId === id;
        const accent = rowAccent?.(row);
        const borderLeft = active
          ? "2px solid var(--neon-cyan)"
          : accent?.borderLeft ?? "2px solid transparent";
        return (
          <div
            key={id}
            onClick={() => onSelect?.(row)}
            style={{
              display: "grid",
              gridTemplateColumns: grid,
              padding: "7px 14px",
              borderBottom: "1px solid var(--line-1)",
              background: active
                ? "var(--bg-row-active)"
                : accent?.rowTint ?? "transparent",
              borderLeft,
              color: "var(--fg-1)",
              cursor: onSelect ? "pointer" : "default",
              boxShadow: accent?.glow && !active ? "inset 0 0 0 1px rgba(255,31,61,.06)" : "none",
              transition: "background 80ms",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = "var(--bg-row-hover)";
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = accent?.rowTint ?? "transparent";
            }}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                style={{ textAlign: c.align ?? "left", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {c.render(row)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
