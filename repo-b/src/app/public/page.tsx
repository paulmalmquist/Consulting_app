import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

export default function PublicLandingPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_28%),linear-gradient(180deg,rgba(6,10,15,1),rgba(5,8,12,1))] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
        <div className="inline-flex rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs text-bm-text">
          Public Preview
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_320px] lg:items-end">
          <div className="space-y-3">
            <h1 className="text-3xl font-display font-semibold sm:text-4xl">Business Machine Public</h1>
            <p className="max-w-2xl text-sm leading-7 text-bm-muted sm:text-base">
              Public surfaces stay focused on discovery and onboarding. Execution, command, and tenant operations remain inside authenticated workspaces.
            </p>
          </div>
          <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-4 text-sm text-bm-muted">
            Any command or operational action from public mode will require sign-in before execution.
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/35 p-5">
            <h2 className="font-semibold">Public Assistant</h2>
            <p className="mt-2 text-sm leading-6 text-bm-muted">
              Read-only architecture guidance with governance-aware recommendations.
            </p>
            <div className="mt-4 rounded-xl border border-bm-border/60 bg-bm-surface/20 px-4 py-3 text-xs uppercase tracking-[0.14em] text-bm-muted2">
              Intake -&gt; context capture -&gt; authenticated follow-up
            </div>
            <Link
              href="/public/onboarding"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4 inline-flex")}
            >
              Start Onboarding Intake
            </Link>
          </div>

          <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/35 p-5">
            <h2 className="font-semibold">Private Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-bm-muted">
              Plan/confirm/execute command surfaces and tenant operations are private.
            </p>
            <div className="mt-4 grid gap-2 text-xs text-bm-muted2 sm:grid-cols-2">
              <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-3 py-3">Environment-scoped access</div>
              <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-3 py-3">Desktop-grade control surfaces</div>
            </div>
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-4 inline-flex")}
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
