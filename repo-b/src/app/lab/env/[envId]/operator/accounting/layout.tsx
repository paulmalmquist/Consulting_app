import type { CSSProperties, ReactNode } from "react";
import { IBM_Plex_Sans, JetBrains_Mono, Orbitron } from "next/font/google";

import "@/components/operator/command-desk/tokens.css";
import "@/components/operator/command-desk/tokens-light.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-orbitron",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

export default function AccountingDeskLayout({ children }: { children: ReactNode }) {
  // Match the consulting/pipeline shell so Accounting feels like the same
  // execution OS. --bm-* HSL vars drive shared shadcn-style components;
  // colorScheme allows native form controls to follow the active theme.
  const shellStyle: CSSProperties & Record<`--${string}`, string> = {
    minHeight: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "transparent",
    colorScheme: "dark light",
    "--bm-bg": "213 29% 6%",
    "--bm-bg-2": "216 30% 5%",
    "--bm-surface": "213 25% 9%",
    "--bm-surface-2": "213 22% 12%",
    "--bm-border": "215 24% 16%",
    "--bm-border-strong": "215 18% 24%",
    "--bm-text": "213 41% 93%",
    "--bm-text-muted": "215 16% 57%",
    "--bm-text-muted-2": "215 13% 40%",
    "--bm-accent": "200 89% 60%",
    "--bm-accent-2": "200 89% 55%",
    "--bm-danger": "0 84% 60%",
    "--bm-warning": "43 96% 56%",
    "--bm-success": "160 84% 39%",
  };

  return (
    <div
      className={`${orbitron.variable} ${jetbrains.variable} ${plex.variable}`}
      style={shellStyle}
    >
      {children}
    </div>
  );
}
