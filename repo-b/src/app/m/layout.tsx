import type { ReactNode } from 'react';
import { IBM_Plex_Mono, Inter, Orbitron } from 'next/font/google';
import { LayoutShell } from '@/components/marketing/layout/LayoutShell';
import './marketing.css';

// Nested layout for /m/* in Phase 1. This file gets renamed/moved into
// src/app/(marketing)/layout.tsx during Phase 3 when marketing takes over `/`.
// Phase 1 constraint: do NOT set metadata here. Root layout's robots:noindex
// is inherited intentionally until Phase 4.

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-marketing-sans',
  display: 'swap'
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-marketing-display',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-marketing-mono',
  display: 'swap',
  weight: ['400', '500']
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`marketing-shell ${inter.variable} ${orbitron.variable} ${plexMono.variable}`}>
      <LayoutShell>{children}</LayoutShell>
    </div>
  );
}
