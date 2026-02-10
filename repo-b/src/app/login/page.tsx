"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode })
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || "Invalid code");
      }

      window.location.href = "/lab";
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
          <h1 className="text-2xl font-semibold">Demo Lab Access</h1>
          <p className="text-sm text-bm-muted mt-2">
            Enter the shared invite code to continue.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-bm-muted">Invite code</label>
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
              {loading ? "Checking..." : "Enter Demo Lab"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
