import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 flex items-center justify-center bg-bm-bg">
      <div className="w-full max-w-xl space-y-6">
        <div className="rounded-full border border-bm-accent/30 bg-bm-accent/10 px-3 py-1 text-xs inline-flex text-bm-text">
          Public Preview
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-display">
            Business OS
          </h1>
          <p className="text-bm-muted">
            Governed execution platform for operational departments.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/public"
            className={buttonVariants({ variant: "secondary" })}
          >
            Public Overview
          </Link>
          <Link
            href="/public/onboarding"
            className={cn(buttonVariants({ variant: "secondary" }), "bg-transparent")}
          >
            Onboarding Intake
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: "primary" })}
          >
            Sign In (Private Workspace)
          </Link>
        </div>

        <p className="text-xs text-bm-muted2">
          Public routes are advisory and onboarding-only. Operational execution
          surfaces under <span className="font-mono">/app</span> and{" "}
          <span className="font-mono">/lab</span> require authenticated access.
        </p>
      </div>
    </main>
  );
}
