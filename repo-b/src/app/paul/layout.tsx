import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paul Malmquist — AI Data Platform Architect",
  description:
    "Director-level data engineer who built governed AI and data platforms managing $4B+ AUM. 11 years of compounding investment data systems — from BI service lines to AI-powered analytics.",
  openGraph: {
    title: "Paul Malmquist — AI Data Platform Architect",
    description:
      "Built governed data and AI systems for Kayne Anderson and JLL. 500+ properties automated, 160 hrs/month eliminated, $4B+ AUM governed.",
    type: "profile",
    url: "https://paulmalmquist.com/paul",
    images: [
      {
        url: "/og-paul.png",
        width: 1200,
        height: 630,
        alt: "Paul Malmquist — AI Data Platform Architect",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Paul Malmquist — AI Data Platform Architect",
    description:
      "Built governed data and AI systems for Kayne Anderson and JLL. 500+ properties automated, $4B+ AUM governed.",
    images: ["/og-paul.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PaulLayout({ children }: { children: React.ReactNode }) {
  // Standalone public layout — no auth shell, no DomainEnvProvider, no sidebar
  return (
    <div className="min-h-screen" style={{ background: "#120d08" }}>
      {children}
    </div>
  );
}
