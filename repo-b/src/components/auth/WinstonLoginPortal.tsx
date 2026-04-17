"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/Input";
import { applyEnvironmentClientState } from "@/lib/platformSessionClient";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

function panelInputClassName() {
  return "h-12 rounded-xl border-white/12 bg-white/[0.08] text-white placeholder:text-white/32 focus-visible:border-white/24 focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.14)]";
}

const resumeLinks = [
  {
    href: "/paul",
    label: "View Paul's Resume",
    accentClassName:
      "border-white/18 bg-white/[0.06] text-white/72 hover:border-white/30 hover:bg-white/[0.10] hover:text-white",
  },
  {
    href: "/richard",
    label: "View Richard's Resume",
    accentClassName:
      "border-cyan-300/24 bg-cyan-300/[0.07] text-cyan-50/88 hover:border-cyan-200/38 hover:bg-cyan-300/[0.13] hover:text-white",
  },
] as const;

export function WinstonLoginPortal({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Supabase is not configured in this environment.");
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const { data } = await client.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Supabase session was not established");
      }

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
        activeEnvironment?: {
          env_id: string;
          env_slug: string;
          business_id?: string | null;
        } | null;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed");
      }

      applyEnvironmentClientState(payload.activeEnvironment || null);
      router.push(payload.redirectTo || "/app");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#05070b] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.14), transparent 0, transparent 22%)",
            "radial-gradient(circle at 50% 18%, rgba(151,160,176,0.18), transparent 34%)",
            "radial-gradient(circle at 16% 18%, rgba(82,92,110,0.18), transparent 24%)",
            "radial-gradient(circle at 84% 24%, rgba(74,83,99,0.16), transparent 24%)",
            "linear-gradient(180deg, #06070b 0%, #090c12 48%, #05060a 100%)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 12% 22%, rgba(255,255,255,0.26) 0 1px, transparent 1.6px)",
            "radial-gradient(circle at 21% 41%, rgba(255,255,255,0.18) 0 1px, transparent 1.5px)",
            "radial-gradient(circle at 33% 17%, rgba(255,255,255,0.2) 0 1.2px, transparent 1.8px)",
            "radial-gradient(circle at 48% 9%, rgba(255,255,255,0.18) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 61% 28%, rgba(255,255,255,0.2) 0 1px, transparent 1.6px)",
            "radial-gradient(circle at 77% 15%, rgba(255,255,255,0.22) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 86% 38%, rgba(255,255,255,0.16) 0 1.2px, transparent 1.8px)",
            "radial-gradient(circle at 72% 63%, rgba(255,255,255,0.12) 0 1px, transparent 1.7px)",
            "radial-gradient(circle at 18% 74%, rgba(255,255,255,0.16) 0 1.1px, transparent 1.7px)",
            "radial-gradient(circle at 44% 81%, rgba(255,255,255,0.12) 0 1px, transparent 1.6px)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-screen"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100vh-5rem)]">
        <div className="grid w-full max-w-[58rem] gap-6 lg:grid-cols-[minmax(0,1.05fr)_380px] lg:items-center lg:gap-10">
          <section className="max-w-2xl space-y-4 sm:space-y-6">
            <div className="inline-flex items-center rounded-full border border-white/18 bg-white/[0.05] px-4 py-1.5 text-[11px] uppercase tracking-[0.28em] text-white/70">
              System Access
            </div>

            <div className="space-y-3 sm:space-y-4">
              <h1
                className="font-command text-[clamp(2.9rem,16vw,6.2rem)] font-bold uppercase leading-[0.95] tracking-[0.05em] text-white"
                style={{ textShadow: "0 0 18px rgba(255,255,255,0.06)" }}
              >
                WINSTON
              </h1>
              <p className="max-w-xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
                Winston is a full-stack operating system I built for real estate, consulting, and AI delivery. After sign-in, you&apos;ll see the workspaces available to your account.
              </p>
            </div>

            <div className="grid max-w-2xl gap-3 sm:max-w-none sm:grid-cols-2">
              {resumeLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch
                  className={`inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full border px-5 py-3 text-center text-[11px] uppercase tracking-[0.2em] transition-all ${link.accentClassName}`}
                >
                  <span className="h-px w-3.5 bg-current" />
                  {link.label}
                </Link>
              ))}
            </div>

          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_28px_60px_-34px_rgba(2,6,23,0.95)] backdrop-blur-md sm:rounded-[1.8rem] sm:p-6">
            <div className="space-y-2 border-b border-white/10 pb-5">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/44">Winston login</p>
              <h2 className="font-command text-[1.7rem] uppercase tracking-[0.06em] text-white">Sign In</h2>
            </div>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2 text-sm text-white/60">
                <span>Email</span>
                <Input
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={panelInputClassName()}
                  required
                />
              </label>

              <label className="block space-y-2 text-sm text-white/60">
                <span>Password</span>
                <Input
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={panelInputClassName()}
                  required
                />
              </label>

              {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(58,208,173,0.95),rgba(38,198,218,0.92))] px-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition-[transform,filter] duration-150 hover:-translate-y-[1px] hover:brightness-105 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

          </section>
        </div>
      </div>
    </main>
  );
}
