import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

export default function PublicLandingPage() {
  return (
    <main className="min-h-screen bg-bm-bg px-6 py-10">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <div className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs inline-flex text-bm-text">
          Public Preview
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-display font-semibold">Business Machine Public</h1>
          <p className="text-bm-muted max-w-2xl">
            Advisory and onboarding surfaces are available publicly. Operational execution surfaces require authenticated workspace access.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
            <h2 className="font-semibold">Public Assistant</h2>
            <p className="mt-2 text-sm text-bm-muted">
              Read-only architecture guidance with governance-aware recommendations.
            </p>
            <Link
              href="/public/onboarding"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "mt-4 inline-flex")}
            >
              Start Onboarding Intake
            </Link>
          </div>

          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/35 p-4">
            <h2 className="font-semibold">Private Workspace</h2>
            <p className="mt-2 text-sm text-bm-muted">
              Plan/confirm/execute command surfaces and tenant operations are private.
            </p>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-4 inline-flex")}
            >
              Sign In
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 text-sm text-bm-muted">
          Any command or operational action from public mode will require sign-in before execution.
        </div>
      </div>
    </main>
  );
}
