import type { Metadata } from "next";
import ResumeThemeInit from "../paul/ResumeThemeInit";

export const metadata: Metadata = {
  title: "Richard de Oliveira — Credit Risk & Analytics Systems",
  description:
    "Operator of lending decision systems across underwriting, portfolio analytics, and credit-risk infrastructure. $1.7B+ monthly originations, +14% credit quality, -100 bps expected loss, +15% automation.",
  openGraph: {
    title: "Richard de Oliveira — Credit Risk & Analytics Systems",
    description:
      "Execution-first proof system for underwriting, portfolio analytics, and lending decision infrastructure.",
    type: "profile",
    url: "https://paulmalmquist.com/richard",
  },
  twitter: {
    card: "summary_large_image",
    title: "Richard de Oliveira — Credit Risk & Analytics Systems",
    description:
      "Execution-first proof system for underwriting, portfolio analytics, and lending decision infrastructure.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RichardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--ros-bg, #f8f5f0)" }}>
      <ResumeThemeInit />
      {children}
    </div>
  );
}

