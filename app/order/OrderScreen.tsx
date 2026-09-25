"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { computeLine, validateOrder, RATE_FLOOR, type Band, type Role } from "@/lib/order";
import { enqueue, flushOutbox, pendingCount } from "@/lib/offline";
import NavTabs from "@/app/_components/NavTabs";

interface Product { id: string; name: string; priceUsd: number }
interface Dealer { id: string; name: string }
interface DraftLine { productId: string; quantity: number; discountUsd: number; ownerApproved: boolean }
interface RecentOrder { id: string; dealer: string; adviser: string; totalUsd: number; totalSdg: number; createdAt: string; lineCount: number }

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const sdg = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const bandStyle: Record<Band, string> = {
  SAND: "bg-sun-50 text-sun-700 border-sun-200",
  RED: "bg-red-50 text-red-700 border-red-200",
  BLOCKED: "bg-rose-100 text-rose-800 border-rose-300",
};
const bandLabel: Record<Band, string> = { SAND: "sand", RED: "red", BLOCKED: "blocked" };

function productImage(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("inverter")) return "/images/product-inverter.jpg";
  if (n.includes("batter")) return "/images/product-battery.jpg";
  if (n.includes("controller")) return "/images/product-controller.jpg";
  if (n.includes("mount")) return "/images/product-mounting.jpg";
  return "/images/product-panel.jpg";
}

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

export default function OrderScreen({ user, defaultRate }: { user: { name: string; role: Role }; defaultRate: number }) {
  const router = useRouter();
  const isOwner = user.role === "OWNER";

  const [products, setProducts] = useState<Product[]>([]);
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealerId, setDealerId] = useState("");
  const [rateInput, setRateInput] = useState(String(defaultRate));
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pickProductId, setPickProductId] = useState("");

  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  // Owner-only price editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const refreshRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const body = await res.json();
        setRecentOrders((body.orders ?? []).slice(0, 5));
      }
    } catch { /* offline: leave as-is */ }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/dealers").then((r) => r.json()),
    ])
      .then(([p, d]) => {
        setProducts(p.products ?? []);
        setDealers(d.dealers ?? []);
        if (d.dealers?.[0]) setDealerId(d.dealers[0].id);
        if (p.products?.[0]) setPickProductId(p.products[0].id);
      })
      .catch(() => setMessage({ kind: "warn", text: "Could not load catalog (offline?). Using cached form." }));
    refreshRecent();
  }, [refreshRecent]);

  const refreshPending = useCallback(async () => {
    try { setPending(await pendingCount()); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshPending();
    const goOnline = async () => {
      setOnline(true);
      const { synced } = await flushOutbox();
      await refreshPending();
      if (synced > 0) setMessage({ kind: "ok", text: `Synced ${synced} order(s) queued while offline.` });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refreshPending]);

  const computed = useMemo(() => {
    const inputs = lines.map((l) => {
      const p = productById.get(l.productId);
      return {
        productId: l.productId,
        productName: p?.name ?? "",
        unitPriceUsd: p?.priceUsd ?? 0,
        quantity: l.quantity,
        discountUsd: l.discountUsd,
        ownerApproved: l.ownerApproved,
      };
    });
    const perLine = inputs.map(computeLine);
    const validation = validateOrder({
      lines: inputs,
      rate: Number(rateInput) || 0,
      role: user.role,
    });
    return { perLine, validation };
  }, [lines, productById, rateInput, user.role]);

  const rateBelowFloor = (Number(rateInput) || 0) < RATE_FLOOR;
  const blockedUnapproved = computed.perLine.some((l) => l.band === "BLOCKED" && !l.ownerApproved);
  const discountExceedsLine = computed.perLine.some((l) => l.netUsd < 0);
  const canSave =
    dealerId !== "" && lines.length > 0 && !rateBelowFloor && !blockedUnapproved && !discountExceedsLine;

  function addLine() {
    if (!pickProductId) return;
    setLines((prev) => [...prev, { productId: pickProductId, quantity: 1, discountUsd: 0, ownerApproved: false }]);
  }
  function updateLine(i: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }
  function clampRate() {
    if ((Number(rateInput) || 0) < RATE_FLOOR) {
      setRateInput(String(RATE_FLOOR));
      setMessage({ kind: "warn", text: `Rate cannot be below ${RATE_FLOOR}. Reset to ${RATE_FLOOR}.` });
    }
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const clientId = crypto.randomUUID();
    const payload = {
      dealerId,
      rate: Number(rateInput),
      clientId,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        discountUsd: l.discountUsd,
        ownerApproved: l.ownerApproved,
      })),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const body = await res.json();
        const t = body.totals ?? { totalUsd: computed.validation.order.totalUsd, totalSdg: computed.validation.order.totalSdg };
        setMessage({ kind: "ok", text: `Saved. ${usd.format(t.totalUsd)} = ${sdg.format(t.totalSdg)} SDG at rate ${payload.rate}.` });
        setLines([]);
        refreshRecent();
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage({ kind: "err", text: body.error ?? `Refused (HTTP ${res.status}).` });
      }
    } catch {
      // Offline: queue and sync on reconnect.
      await enqueue(clientId, payload);
      await refreshPending();
      setMessage({ kind: "warn", text: "You are offline. Order saved locally and will sync when the connection returns." });
      setLines([]);
    } finally {
      setSaving(false);
    }
  }

  async function savePrice(productId: string) {
    const price = Number(editValue);
    if (!(price > 0)) {
      setMessage({ kind: "err", text: "Price must be greater than 0." });
      return;
    }
    setSavingPrice(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceUsd: price }),
      });
      if (res.ok) {
        const body = await res.json();
        const np = body.product?.priceUsd ?? price;
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, priceUsd: np } : p)));
        setEditingId(null);
        setMessage({ kind: "ok", text: `Price updated to ${usd.format(np)}.` });
      } else {
        const body = await res.json().catch(() => ({}));
        setMessage({ kind: "err", text: body.error ?? "Could not update price." });
      }
    } catch {
      setMessage({ kind: "warn", text: "Offline — price changes need a connection." });
    } finally {
      setSavingPrice(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const v = computed.validation;
  const lineCount = lines.length;

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
                {isOwner && " · can approve & set prices"}
              </p>
            </div>
          </div>

          <NavTabs />

          <div className="flex items-center gap-3 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                online
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-sun-200 bg-sun-50 text-sun-700"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-sun-500"} ${online ? "" : "animate-pulse"}`} />
              {online ? "Online" : "Offline"}
            </span>
            {pending > 0 && (
              <span className="inline-flex items-center rounded-full border border-sun-200 bg-sun-50 px-2.5 py-1 text-xs font-medium text-sun-700 nums">
                {pending} queued
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition hover:bg-canvas hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
        {message && (
          <div
            className={`rise rounded-xl border px-4 py-3 text-sm ${
              message.kind === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : message.kind === "warn"
                ? "border-sun-200 bg-sun-50 text-sun-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink-soft">Dealer</span>
            <select
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-ink shadow-sm transition"
            >
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-ink-soft">Exchange rate <span className="text-muted">(SDG per $, min {sdg.format(RATE_FLOOR)})</span></span>
            <input
              type="number"
              value={rateInput}
              min={RATE_FLOOR}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={clampRate}
              className={`nums mt-1.5 w-full rounded-lg border px-3.5 py-2.5 shadow-sm transition ${
                rateBelowFloor ? "border-red-400 bg-red-50 text-red-800" : "border-line-strong bg-surface text-ink"
              }`}
            />
            {rateBelowFloor && <span className="mt-1 block text-xs text-red-600">Below floor — will reset to {sdg.format(RATE_FLOOR)}.</span>}
          </label>
        </section>

        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-4 sm:px-5">
            <select
              value={pickProductId}
              onChange={(e) => setPickProductId(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm text-ink shadow-sm transition sm:flex-none sm:min-w-64"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {usd.format(p.priceUsd)}</option>
              ))}
            </select>
            <button
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ink-soft"
            >
              <span className="text-base leading-none">+</span> Add product
            </button>
            <span className="ml-auto text-xs text-muted">Prices are fixed{isOwner ? "" : " · owner-only"}.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-3 py-2.5 font-medium">Unit $</th>
                  <th className="px-3 py-2.5 font-medium">Qty</th>
                  <th className="px-3 py-2.5 font-medium">Discount $</th>
                  <th className="px-3 py-2.5 font-medium">Discount %</th>
                  <th className="px-3 py-2.5 text-right font-medium">Line $</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center">
                      <div className="mx-auto flex max-w-xs flex-col items-center gap-2 text-muted">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sun-50 text-sun-500">
                          <SunMark className="h-6 w-6" />
                        </span>
                        <p className="text-sm">No products yet. Add one above to start building the order.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {lines.map((line, i) => {
                  const c = computed.perLine[i];
                  return (
                    <tr key={i} className="border-b border-line/70 align-middle transition hover:bg-sun-50/30">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={productImage(c.productName)}
                            alt=""
                            className="h-10 w-10 flex-none rounded-lg object-cover ring-1 ring-line-strong"
                          />
                          <span className="font-medium text-ink">{c.productName}</span>
                        </div>
                      </td>
                      <td className="nums px-3 py-3 text-muted">
                        {isOwner ? (
                          editingId === c.productId ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") savePrice(c.productId);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="nums w-24 rounded-lg border border-sun-300 px-2.5 py-1.5 text-ink shadow-sm"
                              />
                              <button
                                onClick={() => savePrice(c.productId)}
                                disabled={savingPrice}
                                aria-label="Save price"
                                className="rounded-md px-1.5 py-1 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                aria-label="Cancel price edit"
                                className="rounded-md px-1.5 py-1 text-muted transition hover:bg-canvas"
                              >
                                ✕
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(c.productId);
                                setEditValue(String(c.unitPriceUsd));
                              }}
                              title="Edit price (owner only)"
                              className="group inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition hover:bg-sun-50 hover:text-ink"
                            >
                              {usd.format(c.unitPriceUsd)}
                              <span className="text-sun-500 opacity-60 group-hover:opacity-100">✎</span>
                            </button>
                          )
                        ) : (
                          usd.format(c.unitPriceUsd)
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                          className="nums w-16 rounded-lg border border-line-strong px-2.5 py-1.5 shadow-sm transition"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.discountUsd}
                          onChange={(e) => updateLine(i, { discountUsd: Math.max(0, Number(e.target.value) || 0) })}
                          className="nums w-24 rounded-lg border border-line-strong px-2.5 py-1.5 shadow-sm transition"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <span className={`nums inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${bandStyle[c.band]}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          {c.discountPct.toFixed(2)}% · {bandLabel[c.band]}
                        </span>
                        {c.band === "BLOCKED" && (
                          <div className="mt-1.5">
                            {isOwner ? (
                              <label className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                                <input
                                  type="checkbox"
                                  checked={line.ownerApproved}
                                  onChange={(e) => updateLine(i, { ownerApproved: e.target.checked })}
                                  className="accent-sun-600"
                                />
                                Approve this line
                              </label>
                            ) : (
                              <span className="text-xs font-medium text-rose-700">Owner approval required</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="nums px-3 py-3 text-right font-semibold text-ink">{usd.format(c.netUsd)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => removeLine(i)}
                          aria-label="Remove line"
                          className="rounded-lg px-2 py-1 text-muted transition hover:bg-red-50 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-gradient-to-br from-surface to-sun-50/40 p-5 shadow-card sm:flex-row sm:items-center">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Order total {lineCount > 0 && <span className="nums text-muted/80">· {lineCount} line{lineCount > 1 ? "s" : ""}</span>}
            </p>
            <div className="nums text-3xl font-semibold tracking-tight text-ink">{usd.format(v.order.totalUsd)}</div>
            <div className="nums text-sm text-ink-soft">{sdg.format(v.order.totalSdg)} SDG at rate {v.order.rate}</div>
            {blockedUnapproved && (
              <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                A blocked line needs owner approval before saving.
              </div>
            )}
            {discountExceedsLine && (
              <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-rose-700">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                A discount is larger than its line value. Reduce it to save.
              </div>
            )}
          </div>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="w-full rounded-xl bg-gradient-to-b from-sun-500 to-sun-600 px-7 py-3.5 font-semibold text-white shadow-lift transition hover:from-sun-400 hover:to-sun-500 disabled:cursor-not-allowed disabled:from-line-strong disabled:to-line-strong disabled:text-muted disabled:shadow-none sm:w-auto"
          >
            {saving ? "Saving…" : "Save order"}
          </button>
        </section>

        {recentOrders.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Recent orders</h2>
              <Link href="/orders" className="text-sm font-medium text-sun-700 transition hover:text-sun-600">
                View all →
              </Link>
            </div>
            <ul>
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href="/orders"
                    className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3 transition last:border-0 hover:bg-sun-50/30"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{o.dealer}</div>
                      <div className="text-xs text-muted">
                        {when.format(new Date(o.createdAt))} · {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                        {isOwner && ` · ${o.adviser}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="nums font-semibold text-ink">{usd.format(o.totalUsd)}</div>
                      <div className="nums text-xs text-muted">{sdg.format(o.totalSdg)} SDG</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
