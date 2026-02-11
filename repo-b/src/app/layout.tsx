import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Winston — Your Business Machine",
  description: "Winston is the data-driven business execution platform that powers deal flow, CRM, and operational workflows.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Winston — Your Business Machine",
    description: "Data-driven business execution platform for deal flow, CRM, and operations.",
    siteName: "Winston",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Winston — Your Business Machine",
    description: "Data-driven business execution platform for deal flow, CRM, and operations.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
