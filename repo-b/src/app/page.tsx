import Link from "next/link";
import { buttonVariants } from "@/components/ui/buttonVariants";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bm-bg px-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold font-display">Winston</h1>
          <p className="text-bm-muted text-sm">Select your access path to continue.</p>
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
      </div>
    </main>
  );
}
