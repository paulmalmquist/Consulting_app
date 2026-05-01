import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
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

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-theme="dark"
      className={`marketing-shell ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <LayoutShell>{children}</LayoutShell>
    </div>
  );
}
