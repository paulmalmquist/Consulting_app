"use client";
import type { ReactNode } from "react";

type RightRailProps = {
  children: ReactNode;
};

export function RightRail({ children }: RightRailProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {children}
    </div>
  );
}
