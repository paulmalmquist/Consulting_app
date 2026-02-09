import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Business OS</h1>
          <p className="text-slate-400">
            Data-driven business execution platform.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Login
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-900/50"
          >
            Open App
          </Link>
        </div>

        <p className="text-xs text-slate-500">
          If you are testing on mobile, this page is a simple entry point. Most
          functionality lives under <span className="font-mono">/app</span> and{" "}
          <span className="font-mono">/lab</span>.
        </p>
      </div>
    </main>
  );
}

