import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, DM_Mono } from 'next/font/google';
import { LayoutShell } from '@/components/marketing/layout/LayoutShell';
import './marketing.css';

const ORIGIN = process.env.NEXT_PUBLIC_MARKETING_ORIGIN ?? 'https://novendor.ai';

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  robots: { index: true, follow: true },
  openGraph: {
    siteName: 'Novendor',
    type: 'website',
  },
  alternates: {
    canonical: '/',
  },
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-marketing-sans',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-marketing-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`marketing-shell ${inter.variable} ${dmMono.variable}`}>
      <LayoutShell>{children}</LayoutShell>
    </div>
  );
}
