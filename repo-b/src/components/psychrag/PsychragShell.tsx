"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getPsychragSupabaseClient, usePsychragSession } from "@/lib/psychrag/auth";

const NAV_ITEMS = [
  { href: "/psychrag/patient/chat", label: "Patient" },
  { href: "/psychrag/therapist/dashboard", label: "Therapist" },
  { href: "/psychrag/admin/library", label: "Admin" },
];

export function PsychragShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { email } = usePsychragSession();

  async function signOut() {
    const client = getPsychragSupabaseClient();
    await client?.auth.signOut();
    window.location.href = "/psychrag/login";
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(197,232,221,0.55),_transparent_45%),linear-gradient(180deg,_#f7fbf7,_#ecf3ef_45%,_#f6f0ea)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
        <header className="mb-8 rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_18px_60px_rgba(67,88,74,0.12)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Link href="/psychrag" className="text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                PsychRAG
              </Link>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Evidence-grounded therapy support, clinician review, and safety-forward patient sharing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    pathname?.startsWith(item.href)
                      ? "bg-slate-900 text-white"
                      : "bg-white/80 text-slate-700 hover:bg-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {email ? <Badge variant="accent">{email}</Badge> : null}
              {email ? (
                <Button variant="secondary" size="sm" onClick={signOut}>
                  Sign out
                </Button>
              ) : (
                <Link href="/psychrag/login" className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
