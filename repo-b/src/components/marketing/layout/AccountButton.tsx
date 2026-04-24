'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCircle } from 'lucide-react';

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
      className="inline-flex items-center justify-center rounded-full border border-slate-700/60 p-1.5 text-slate-400 transition hover:border-emerald-300/40 hover:text-emerald-100"
    >
      <UserCircle size={18} strokeWidth={1.7} aria-hidden="true" />
    </Link>
  );
}
