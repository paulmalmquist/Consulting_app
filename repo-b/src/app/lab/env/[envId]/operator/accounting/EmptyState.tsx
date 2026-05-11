"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/operator/command-desk";

type Action = {
  label: string;
  kind?: "primary" | "secondary";
  onClick: () => void;
};

type Props = {
  title: string;
  description?: string;
  actions: Action[];
  icon?: ReactNode;
};

export function EmptyState({ title, description, actions, icon }: Props) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        gap: 12,
        background: "var(--bg-base)",
        color: "var(--fg-1)",
      }}
    >
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 4,
            border: "1px solid var(--line-2)",
            background: "var(--bg-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--fg-3)",
          }}
        >
          {icon}
        </div>
      )}
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 500,
          color: "var(--fg-1)",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12,
            color: "var(--fg-3)",
            textAlign: "center",
            maxWidth: 420,
          }}
        >
          {description}
        </div>
      )}
      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {actions.map((a, i) => (
            <Button key={i} kind={a.kind ?? (i === 0 ? "primary" : "secondary")} size="sm" onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
