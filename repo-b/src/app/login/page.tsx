"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function LoginForm() {
  const searchParams = useSearchParams();
  const loginType = (searchParams.get("loginType") as "admin" | "environment") || "environment";
  const isAdmin = loginType === "admin";

  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const heading = isAdmin ? "Admin Access" : "Environment Access";
  const codeLabel = isAdmin ? "Admin code" : "Access code";
  const submitLabel = isAdmin ? "Enter Admin Dashboard" : "Enter Environment";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode, loginType }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Invalid code");
      }

      const data = await response.json();
      window.location.href = data.redirectTo || (isAdmin ? "/admin" : "/lab/environments");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-bm-muted mt-2">
            {isAdmin
              ? "Enter the admin code to manage environments."
              : "Enter the access code to enter the Business OS."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-bm-muted">{codeLabel}</label>
              <Input
                className="mt-2"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="Enter code"
                type="password"
                required
              />
            </div>
            {error ? (
              <div className="text-sm text-bm-text bg-bm-danger/15 border border-bm-danger/30 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Checking..." : submitLabel}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <a href="/" className="text-xs text-bm-muted hover:text-bm-text">
              ← Back to start
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
