"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("adviser@solar.test");
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace(params.get("from") || "/order");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed.");
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Order Screen</h1>
        <p className="text-sm text-slate-500">Sign in to continue</p>
      </div>

      <label className="block text-sm">
        <span className="text-slate-700">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          required
        />
      </label>

      <label className="block text-sm">
        <span className="text-slate-700">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
          required
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "Signing in..." : "Sign in"}
      </button>

      <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 space-y-1">
        <p>owner@solar.test / Passw0rd!</p>
        <p>adviser@solar.test / Passw0rd!</p>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Suspense fallback={<div className="text-slate-400">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
