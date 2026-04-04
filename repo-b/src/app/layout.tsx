import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Inter_Tight, JetBrains_Mono, Josefin_Sans } from "next/font/google";
import "@fontsource/league-gothic/400.css";
import "./globals.css";
import Providers from "@/components/Providers";
import { mandaloreCommand } from "@/lib/brandFonts";

export const metadata: Metadata = {
  title: "Winston",
  description:
    "AI execution environment for real estate private equity, project delivery, and institutional operations. Fund reporting, waterfall logic, capital activity, and portfolio monitoring.",
  openGraph: {
    title: "Winston — AI Execution Environment",
    description:
      "Fund reporting, waterfall logic, capital activity, and portfolio monitoring. Built for institutional operations.",
    siteName: "Winston",
    type: "website",
    url: "https://paulmalmquist.com",
    images: [
      {
        url: "/og-winston.png",
        width: 1200,
        height: 630,
        alt: "Winston — AI Execution Environment for Institutional Operations",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Winston — AI Execution Environment",
    description:
      "Fund reporting, waterfall logic, capital activity, and portfolio monitoring. Built for institutional operations.",
    images: ["/og-winston.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const bodyFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const editorialFont = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-editorial",
  display: "swap",
});

const labelFont = Josefin_Sans({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "600"],
  variable: "--font-label",
  display: "swap",
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} ${mandaloreCommand.variable} ${editorialFont.variable} ${labelFont.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
