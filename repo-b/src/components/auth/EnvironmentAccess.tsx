"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  environmentCatalog,
  environmentDisplayHomePath,
  environmentLoginPath,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import {
  applyEnvironmentClientState,
  clearLegacyEnvironmentClientState,
  logoutPlatformSession,
} from "@/lib/platformSessionClient";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

function shellStyle(slug: EnvironmentSlug) {
  const branding = environmentCatalog[slug];
  return {
    ["--env-accent" as string]: branding.accent,
    ["--env-accent-soft" as string]: branding.accentSoft,
    ["--env-button-text" as string]: branding.buttonText,
    backgroundImage: `${branding.shellGradient}, linear-gradient(180deg, #07090d, #05070b)`,
  };
}

function submitButtonClass(disabled?: boolean) {
  return [
    "inline-flex h-11 w-full items-center justify-center rounded-[1rem] px-4 text-sm font-semibold uppercase tracking-[0.12em] transition-[transform,box-shadow,background-color,border-color] duration-150",
    "bg-[hsl(var(--env-accent)/1)] text-[hsl(var(--env-button-text)/1)] shadow-[0_18px_40px_-22px_hsl(var(--env-accent)/0.78)]",
    "hover:translate-y-[-1px] hover:bg-[hsl(var(--env-accent-soft)/1)]",
    "disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60",
    disabled ? "pointer-events-none" : "",
  ].join(" ");
}

export function EnvironmentAuthShell({
  slug,
  title,
  subtitle,
  children,
  aside,
}: {
  slug: EnvironmentSlug;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const branding = environmentCatalog[slug];

  return (
    <main
      className="relative isolate min-h-screen overflow-hidden px-4 py-6 text-white sm:px-6 sm:py-10"
      style={shellStyle(slug) as React.CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.1] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 sm:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1.05fr)_460px] lg:gap-8">
        <section className="max-w-2xl space-y-4 sm:space-y-6">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60">
            {branding.familyLabel}
          </div>
          <div className="space-y-4">
            <h1 className="font-command max-w-xl text-[clamp(2.5rem,14vw,5.4rem)] uppercase leading-[0.92] tracking-[0.05em] text-white">
              {title}
            </h1>
            <p className="max-w-xl text-base leading-7 text-white/72 sm:text-lg">
              {subtitle}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-white/58 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 sm:rounded-[1.4rem] sm:py-4">
              Distinct entry point
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 sm:rounded-[1.4rem] sm:py-4">
              Explicit environment scope
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 px-4 py-3 sm:rounded-[1.4rem] sm:py-4">
              Shared platform identity
            </div>
          </div>
          {aside}
        </section>

        <Card
          className="border border-white/10 bg-transparent shadow-[0_28px_60px_-34px_rgba(2,6,23,0.95)] backdrop-blur-sm"
          style={{ backgroundImage: branding.panelGradient } as React.CSSProperties}
        >
          <CardContent className="p-5 sm:p-8 lg:p-9">{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}

export function EnvironmentLoginForm({
  slug,
  returnTo,
}: {
  slug: EnvironmentSlug;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const branding = environmentCatalog[slug];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loginHint = useMemo(() => environmentDisplayHomePath(slug), [slug]);

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
          environmentSlug: slug,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
        activeEnvironment?: { env_id: string; env_slug: string; business_id?: string | null };
      };

      if (!response.ok) {
        throw new Error(payload.error || "Authentication failed");
      }

      applyEnvironmentClientState(payload.activeEnvironment || null);
      router.push(payload.redirectTo || loginHint);
      router.refresh();
    } catch (cause) {
      const msg =
        cause instanceof Error
          ? cause.message
          : cause != null && typeof cause === "object" && "message" in cause && typeof (cause as { message: unknown }).message === "string"
          ? (cause as { message: string }).message
          : "Authentication failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-white/60">{branding.label}</p>
        <h2 className="font-command text-[2rem] uppercase tracking-[0.05em] text-white">{branding.loginTitle}</h2>
        <p className="text-sm leading-6 text-white/64">{branding.loginSubtitle}</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-2 text-sm text-white/60">
          <span>Email</span>
          <Input
            autoComplete="email"
            inputMode="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            required
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <button type="submit" className={submitButtonClass(loading)} disabled={loading}>
          {loading ? "Opening environment..." : "Continue"}
        </button>
      </form>

      <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.16em] text-white/42">
        <Link href={environmentDisplayHomePath(slug)} className="hover:text-white">
          Back to {branding.label}
        </Link>
        <span>Scoped session</span>
      </div>
    </div>
  );
}

export function GenericPlatformLoginForm({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      if (!accessToken) throw new Error("Supabase session was not established");

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, returnTo }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
        activeEnvironment?: { env_id: string; env_slug: string; business_id?: string | null };
      };
      if (!response.ok) throw new Error(payload.error || "Authentication failed");

      applyEnvironmentClientState(payload.activeEnvironment || null);
      router.push(payload.redirectTo || "/admin");
      router.refresh();
    } catch (cause) {
      const msg =
        cause instanceof Error
          ? cause.message
          : cause != null && typeof cause === "object" && "message" in cause && typeof (cause as { message: unknown }).message === "string"
          ? (cause as { message: string }).message
          : "Authentication failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <EnvironmentAuthShell
      slug="novendor"
      title="Winston Control Tower"
      subtitle="Platform administration, membership control, and system-level entry without collapsing environment boundaries."
      aside={
        <div className="text-sm leading-7 text-white/58">
          Use a branded environment route when you already know where you are operating:
          {" "}
          <Link href="/novendor/login" className="text-white hover:text-[hsl(var(--env-accent)/1)]">Novendor</Link>,
          {" "}
          <Link href="/floyorker/login" className="text-white hover:text-[hsl(var(--env-accent)/1)]">Floyorker</Link>,
          {" "}
          <Link href="/resume/login" className="text-white hover:text-[hsl(var(--env-accent)/1)]">Resume</Link>,
          {" "}
          <Link href="/trading/login" className="text-white hover:text-[hsl(var(--env-accent)/1)]">Trading</Link>.
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/60">Platform access</p>
          <h2 className="font-command text-[2rem] uppercase tracking-[0.05em] text-white">Control Tower access</h2>
          <p className="text-sm leading-6 text-white/64">
            Use this route for platform administration. Environment-specific entry stays available when you want the session to resolve directly into a branded workspace.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm text-white/60">
            <span>Email</span>
            <Input
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              required
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <button type="submit" className={submitButtonClass(loading)} disabled={loading}>
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
    </EnvironmentAuthShell>
  );
}

export function EnvironmentUnauthorizedState({ slug }: { slug: EnvironmentSlug }) {
  const branding = environmentCatalog[slug];

  return (
    <EnvironmentAuthShell
      slug={slug}
      title={branding.unauthorizedTitle}
      subtitle={branding.unauthorizedBody}
      aside={
        <div className="text-sm leading-7 text-white/60">
          If this looks wrong, ask an owner or admin to grant membership for the
          {" "}
          <span className="text-white">{branding.label}</span>
          {" "}
          environment.
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-white/60">
          Your platform identity is active, but the environment boundary held. No session was silently redirected into the wrong workspace.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={environmentLoginPath(slug)} className={submitButtonClass(false)}>
            Try another account
          </Link>
          <button
            type="button"
            onClick={() => void logoutPlatformSession()}
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/12 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Clear session
          </button>
        </div>
      </div>
    </EnvironmentAuthShell>
  );
}

export function ResumePublicExperience() {
  return (
    <EnvironmentAuthShell
      slug="resume"
      title="Paul Malmquist"
      subtitle="Operator-builder working at the seam between business systems, applied AI, and productized execution."
      aside={
        <div className="grid gap-3 text-sm text-white/60 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            Build operating systems that turn messy business workflows into usable product surfaces.
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            Blend product, data, AI, and implementation details without losing business clarity.
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/60">Public portfolio</p>
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Selected focus areas</h2>
        </div>

        <div className="space-y-3 text-sm leading-6 text-white/60">
          <p>Business-machine design for consulting, operating environments, and internal platforms.</p>
          <p>Workflow-heavy product architecture spanning data, copilots, control surfaces, and execution loops.</p>
          <p>Delivery systems that make complex businesses feel legible without dumbing them down.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/resume/login" className={submitButtonClass(false)}>
            Resume admin login
          </Link>
          <button
            type="button"
            onClick={() => {
              clearLegacyEnvironmentClientState();
              window.location.href = "/novendor";
            }}
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/12 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Open platform family
          </button>
        </div>
      </div>
    </EnvironmentAuthShell>
  );
}
