"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SunMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 2.4v2.6M12 19v2.6M21.6 12H19M5 12H2.4M18.8 5.2l-1.8 1.8M7 17l-1.8 1.8M18.8 18.8L17 17M7 7 5.2 5.2" />
      </g>
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("adviser@solar.test");
  const [password, setPassword] = useState("Passw0rd!");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Until the client mounts, the submit handler is not attached; keep the
  // button disabled so an early click can never silently no-op.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

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
    <div className="w-full max-w-sm rise">
      <div className="mb-8 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-sun-400 to-sun-600 text-white shadow-lift">
          <SunMark className="h-5 w-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight text-ink">Order Desk</span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted">Sign in to price and place solar orders.</p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-ink-soft">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink shadow-sm transition placeholder:text-muted"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink-soft">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink shadow-sm transition placeholder:text-muted"
            required
          />
        </label>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !ready}
          className="w-full rounded-lg bg-gradient-to-b from-sun-500 to-sun-600 px-4 py-2.5 font-semibold text-white shadow-lift transition hover:from-sun-400 hover:to-sun-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in…" : !ready ? "Loading…" : "Sign in"}
        </button>
      </form>

      <div className="mt-8 rounded-xl border border-line bg-sun-50/60 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-sun-700">Demo access</p>
        <div className="mt-1.5 grid gap-0.5 text-xs text-ink-soft nums">
          <p><span className="text-muted">Owner</span> · owner@solar.test / Passw0rd!</p>
          <p><span className="text-muted">Adviser</span> · adviser@solar.test / Passw0rd!</p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Hero */}
      <section className="relative hidden overflow-hidden bg-espresso lg:block">
        <img
          src="/images/hero-solar.jpg"
          alt="Solar panel array beneath a golden sunset sky"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/55 to-espresso/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-espresso/40 to-transparent" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 backdrop-blur">
              <SunMark className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Order Desk</span>
          </div>

          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Every order, priced to the cent.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Fixed USD pricing, disciplined discount bands, and an enforced exchange-rate floor —
              so advisers move fast and margins stay protected.
            </p>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center bg-canvas px-6 py-12">
        <Suspense fallback={<div className="text-muted">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
