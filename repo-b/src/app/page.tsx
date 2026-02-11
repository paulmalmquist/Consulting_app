import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";
import WinstonLogo from "@/components/brand/WinstonLogo";
import ThemeToggle from "@/components/brand/ThemeToggle";

export default function HomePage() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Watermark logo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <WinstonLogo size={320} className="opacity-[0.03]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <WinstonLogo size={32} />
          <span className="text-lg font-semibold font-display tracking-tight text-bm-text">
            Winston
          </span>
        </div>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-24 sm:py-32 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight font-display max-w-2xl">
          Your Business Machine
        </h1>
        <p className="mt-4 text-lg text-bm-muted max-w-lg">
          Deal flow. CRM. Operations. All powered by Winston — the platform
          that keeps your business running.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Login
          </Link>
          <Link
            href="/app/deals"
            className={cn(
              buttonVariants({ variant: "secondary", size: "lg" }),
              "bg-transparent"
            )}
          >
            Open Deals
          </Link>
        </div>

        <p className="mt-12 text-xs text-bm-muted2 max-w-md">
          Winston connects your deal pipeline, client relationships, and
          operational workflows in a single, auditable platform.
        </p>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-bm-border/40 px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-2 text-sm text-bm-muted2">
          <WinstonLogo size={16} />
          <span>Winston</span>
          <span className="mx-1">·</span>
          <span>Your Business Machine</span>
        </div>
      </footer>
    </main>
  );
}
