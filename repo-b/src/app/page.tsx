import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight font-display">
            Business OS
          </h1>
          <p className="text-bm-muted">
            Data-driven business execution platform.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className={buttonVariants({ variant: "primary" })}
          >
            Login
          </Link>
          <Link
            href="/app"
            className={cn(buttonVariants({ variant: "secondary" }), "bg-transparent")}
          >
            Open App
          </Link>
        </div>

        <p className="text-xs text-bm-muted2">
          If you are testing on mobile, this page is a simple entry point. Most
          functionality lives under <span className="font-mono">/app</span> and{" "}
          <span className="font-mono">/lab</span>.
        </p>
      </div>
    </main>
  );
}
