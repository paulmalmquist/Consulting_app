import type { Metadata } from "next";
import EvidenceGraphPage from "@/components/resume/EvidenceGraphPage";

export const metadata: Metadata = {
  title: "Evidence Graph — Paul Malmquist",
  description:
    "A transparent map of data engineering, finance, real estate, and AI platform experience. Separates shipped professional work, Winston platform work, prototypes, and active gaps.",
  openGraph: {
    title: "Evidence Graph — Paul Malmquist",
    description:
      "Every resume claim mapped to shipped experience, Winston platform work, prototypes, or named gaps with planned proof artifacts.",
    type: "profile",
    url: "https://paulmalmquist.com/paul/evidence",
  },
  twitter: {
    card: "summary",
    title: "Evidence Graph — Paul Malmquist",
    description:
      "Every resume claim mapped to shipped experience, Winston platform work, prototypes, or named gaps.",
  },
  robots: { index: true, follow: true },
};

export default function Page() {
  return <EvidenceGraphPage />;
}
