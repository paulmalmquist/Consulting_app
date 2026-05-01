'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconUserCircle } from '../ui/icons';

function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith('bm_session='));
}

export function AccountButton() {
  const [href, setHref] = useState<string>('/login');

  useEffect(() => {
    setHref(hasSessionCookie() ? '/app' : '/login');
  }, []);

  return (
    <Link
      href={href}
      aria-label={href === '/app' ? 'Go to app' : 'Sign in'}
      className="inline-flex items-center justify-center rounded-[4px] border border-[rgba(232,236,242,0.10)] p-1.5 text-nv-dim transition hover:border-[rgba(232,236,242,0.20)] hover:text-nv-muted"
    >
      <IconUserCircle size={18} aria-hidden="true" />
    </Link>
  );
}
