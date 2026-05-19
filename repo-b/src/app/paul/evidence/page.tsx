import type { Metadata } from "next";
import EvidenceGraphPage from "@/components/resume/EvidenceGraphPage";

export const metadata: Metadata = {
  title: "Evidence Ledger — Paul Malmquist",
  description:
    "A transparent, auditable proof ledger of data engineering, finance, REPE, and AI platform experience. Weighted by shipped systems, demoable artifacts, evidence source, confidence, and named gaps.",
  openGraph: {
    title: "Evidence Ledger — Paul Malmquist",
    description:
      "Every resume claim mapped to shipped experience, Winston platform work, prototypes, or named gaps with planned proof artifacts.",
    type: "profile",
    url: "https://paulmalmquist.com/paul/evidence",
  },
  twitter: {
    card: "summary",
    title: "Evidence Ledger — Paul Malmquist",
    description:
      "Every resume claim mapped to shipped experience, Winston platform work, prototypes, or named gaps.",
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <EvidenceGraphPage />;
}
