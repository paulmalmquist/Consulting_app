import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bm-bg px-6">
      <div className="w-full max-w-lg space-y-10 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-display">Winston</h1>
          <p className="text-bm-muted text-sm max-w-md mx-auto leading-relaxed">
            AI execution environment for real estate private equity,
            project delivery, and institutional operations.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <Link
            href="/login?loginType=admin"
            className={buttonVariants({ variant: "primary" })}
          >
            Login as Admin
          </Link>
          <Link
            href="/login?loginType=environment"
            className={buttonVariants({ variant: "secondary" })}
          >
            Login to Environment
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
