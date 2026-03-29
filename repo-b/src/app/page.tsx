import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bm-bg px-6">
      <div className="w-full max-w-3xl space-y-10 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-display">Winston</h1>
          <p className="text-bm-muted text-sm max-w-md mx-auto leading-relaxed">
            Shared identity, environment-scoped access, and distinct product entry points for the Winston platform family.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/novendor" className={buttonVariants({ variant: "primary" })}>
            Enter Novendor
          </Link>
          <Link href="/floyorker" className={buttonVariants({ variant: "secondary" })}>
            Enter Floyorker
          </Link>
          <Link href="/resume" className={buttonVariants({ variant: "secondary" })}>
            Open My Resume
          </Link>
          <Link href="/trading" className={buttonVariants({ variant: "secondary" })}>
            Enter Trading Platform
          </Link>
        </div>
        <div className="flex justify-center">
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Platform / Admin Login
          </Link>
        </div>
        <div className="pt-2 border-t border-bm-border">
          <p className="text-bm-muted text-xs mb-2">Not yet on Winston?</p>
          <a
            href="https://novendor.ai/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bm-accent text-sm font-medium hover:underline"
          >
            Request a walkthrough &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
