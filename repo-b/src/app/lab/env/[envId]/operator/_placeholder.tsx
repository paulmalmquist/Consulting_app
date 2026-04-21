"use client";
import { useRouter, useParams } from "next/navigation";

import {
  Caps,
  LeftSidebar,
  OperatingSurfaceShell,
} from "@/components/operator/command-desk";
import { operatorSidebarSections } from "./_sidebar";

type PlaceholderProps = {
  activeKey: string;
  title: string;
  purpose: string;
  forwardNote: string;
};

export function OperatorModePlaceholder({
  activeKey,
  title,
  purpose,
  forwardNote,
}: PlaceholderProps) {
  const router = useRouter();
  const params = useParams<{ envId: string }>();
  const envId = params?.envId;

  return (
    <OperatingSurfaceShell
      leftSidebar={
        <LeftSidebar
          brand={
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
              <Caps size={9} color="var(--fg-3)">NOVENDOR</Caps>
              <Caps size={9} color="var(--neon-cyan)">OPERATOR</Caps>
            </div>
          }
          sections={envId ? operatorSidebarSections(envId) : []}
          activeKey={activeKey}
          onBack={envId ? () => router.push(`/lab/env/${envId}/operator`) : undefined}
        />
      }
      left={
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 60,
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <Caps size={10} color="var(--fg-3)">RESERVED OPERATING MODE</Caps>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: "var(--fg-1)",
                margin: "12px 0",
                lineHeight: 1,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 16,
                lineHeight: 1.45,
                color: "var(--fg-2)",
                margin: "0 0 16px",
              }}
            >
              {purpose}
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: ".04em",
                color: "var(--fg-3)",
                margin: 0,
              }}
            >
              {forwardNote}
            </p>
          </div>
        </div>
      }
    />
  );
}
