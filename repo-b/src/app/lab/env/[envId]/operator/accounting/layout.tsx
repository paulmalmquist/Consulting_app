import type { ReactNode } from "react";
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
  return (
    <div className={`${orbitron.variable} ${jetbrains.variable} ${plex.variable}`}>
      {children}
    </div>
  );
}
