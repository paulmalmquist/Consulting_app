"use client";

import { useState } from "react";

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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-semibold">Demo Lab Access</h1>
        <p className="text-sm text-slate-400 mt-2">
          Enter the shared invite code to continue.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Invite code</label>
            <input
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Enter code"
              type="password"
              required
            />
          </div>
          {error ? (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold py-2 transition"
          >
            {loading ? "Checking..." : "Enter Demo Lab"}
          </button>
        </form>
      </div>
    </main>
  );
}
