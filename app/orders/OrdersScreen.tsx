"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Band, Role } from "@/lib/order";
import NavTabs from "@/app/_components/NavTabs";

interface OrderLine {
  productName: string;
  quantity: number;
  unitPriceUsd: number;
  discountUsd: number;
  discountPct: number;
  band: Band;
  netUsd: number;
  ownerApproved: boolean;
}
interface OrderRow {
  id: string;
  dealer: string;
  adviser: string;
  rate: number;
  totalUsd: number;
  totalSdg: number;
  createdAt: string;
  lineCount: number;
  approvedCount: number;
  lines: OrderLine[];
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const sdg = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const bandStyle: Record<Band, string> = {
  SAND: "bg-sun-50 text-sun-700 border-sun-200",
  RED: "bg-red-50 text-red-700 border-red-200",
  BLOCKED: "bg-rose-100 text-rose-800 border-rose-300",
};

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

export default function OrdersScreen({ user }: { user: { name: string; role: Role } }) {
  const router = useRouter();
  const isOwner = user.role === "OWNER";

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-sun-400 to-sun-600 text-white shadow-lift">
              <SunMark className="h-5 w-5" />
            </span>
            <div className="hidden leading-tight sm:block">
              <h1 className="text-[15px] font-semibold tracking-tight">Order Desk</h1>
              <p className="text-xs text-muted">
                {user.name} · <span className="capitalize">{user.role.toLowerCase()}</span>
              </p>
            </div>
          </div>

          <NavTabs />

          <button
            onClick={logout}
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-canvas hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Orders</h2>
          <span className="text-sm text-muted">
            {isOwner ? "All advisers" : "Your orders"}
            {!loading && !failed && ` · ${orders.length}`}
          </span>
        </div>

        {loading && (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center text-muted shadow-card">
            Loading orders…
          </div>
        )}

        {failed && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
            Could not load orders. Please refresh.
          </div>
        )}

        {!loading && !failed && orders.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface p-12 text-center shadow-card">
            <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-muted">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sun-50 text-sun-500">
                <SunMark className="h-6 w-6" />
              </span>
              <p className="text-sm">No orders yet. Saved orders will appear here.</p>
            </div>
          </div>
        )}

        {!loading && !failed && orders.map((o) => {
          const open = openId === o.id;
          return (
            <section key={o.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <button
                onClick={() => setOpenId(open ? null : o.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-sun-50/30"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{o.dealer}</span>
                    {o.approvedCount > 0 && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                        {o.approvedCount} owner-approved
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {when.format(new Date(o.createdAt))} · {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                    {isOwner && ` · ${o.adviser}`}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="nums text-lg font-semibold tracking-tight">{usd.format(o.totalUsd)}</div>
                    <div className="nums text-xs text-muted">{sdg.format(o.totalSdg)} SDG · rate {o.rate}</div>
                  </div>
                  <span className={`text-muted transition ${open ? "rotate-180" : ""}`}>⌄</span>
                </div>
              </button>

              {open && (
                <div className="border-t border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th className="px-5 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Unit $</th>
                        <th className="px-3 py-2 font-medium">Discount %</th>
                        <th className="px-3 py-2 text-right font-medium">Line $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.lines.map((l, i) => (
                        <tr key={i} className="border-b border-line/70 last:border-0">
                          <td className="px-5 py-2.5 font-medium text-ink">{l.productName}</td>
                          <td className="nums px-3 py-2.5 text-ink-soft">{l.quantity}</td>
                          <td className="nums px-3 py-2.5 text-muted">{usd.format(l.unitPriceUsd)}</td>
                          <td className="px-3 py-2.5">
                            <span className={`nums inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${bandStyle[l.band]}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                              {l.discountPct.toFixed(2)}%{l.band === "BLOCKED" && l.ownerApproved ? " · approved" : ""}
                            </span>
                          </td>
                          <td className="nums px-3 py-2.5 text-right font-semibold text-ink">{usd.format(l.netUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
