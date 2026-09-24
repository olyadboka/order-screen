"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeLine, validateOrder, RATE_FLOOR, type Band, type Role } from "@/lib/order";
import { enqueue, flushOutbox, pendingCount } from "@/lib/offline";

interface Product { id: string; name: string; priceUsd: number }
interface Dealer { id: string; name: string }
interface DraftLine { productId: string; quantity: number; discountUsd: number; ownerApproved: boolean }

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const sdg = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const bandStyle: Record<Band, string> = {
  SAND: "bg-amber-100 text-amber-800 border-amber-300",
  RED: "bg-red-100 text-red-700 border-red-300",
  BLOCKED: "bg-rose-200 text-rose-900 border-rose-400",
};
const bandLabel: Record<Band, string> = { SAND: "sand", RED: "red", BLOCKED: "blocked" };

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

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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
  }, []);

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
  const canSave = dealerId !== "" && lines.length > 0 && !rateBelowFloor && !blockedUnapproved;

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const v = computed.validation;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">New Order</h1>
            <p className="text-xs text-slate-500">
              {user.name} · {user.role} {isOwner && "· can approve & set prices"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-1 ${online ? "text-emerald-600" : "text-amber-600"}`}>
              <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
              {online ? "online" : "offline"}
            </span>
            {pending > 0 && <span className="text-amber-600">{pending} queued</span>}
            <button onClick={logout} className="text-slate-500 hover:text-slate-900">Sign out</button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {message && (
          <div
            className={`rounded-md border px-4 py-2 text-sm ${
              message.kind === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : message.kind === "warn"
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        <section className="bg-white rounded-xl border border-slate-200 p-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-600">Dealer</span>
            <select
              value={dealerId}
              onChange={(e) => setDealerId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="text-slate-600">Exchange rate (SDG per $, min {RATE_FLOOR})</span>
            <input
              type="number"
              value={rateInput}
              min={RATE_FLOOR}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={clampRate}
              className={`mt-1 w-full rounded-md border px-3 py-2 ${rateBelowFloor ? "border-red-400 bg-red-50" : "border-slate-300"}`}
            />
            {rateBelowFloor && <span className="text-xs text-red-600">Below floor — will reset to {RATE_FLOOR}.</span>}
          </label>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 p-4 border-b border-slate-100">
            <select
              value={pickProductId}
              onChange={(e) => setPickProductId(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {usd.format(p.priceUsd)}</option>
              ))}
            </select>
            <button onClick={addLine} className="rounded-md bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800">
              Add product
            </button>
            <span className="text-xs text-slate-400">Prices are fixed{isOwner ? "" : " (owner-only)"}.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Unit $</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Discount $</th>
                  <th className="px-3 py-2 font-medium">Discount %</th>
                  <th className="px-3 py-2 font-medium">Line $</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">Add a product to begin.</td>
                  </tr>
                )}
                {lines.map((line, i) => {
                  const c = computed.perLine[i];
                  return (
                    <tr key={i} className="border-t border-slate-100 align-middle">
                      <td className="px-4 py-2">{c.productName}</td>
                      <td className="px-3 py-2 text-slate-500">{usd.format(c.unitPriceUsd)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.discountUsd}
                          onChange={(e) => updateLine(i, { discountUsd: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs ${bandStyle[c.band]}`}>
                          {c.discountPct.toFixed(2)}% · {bandLabel[c.band]}
                        </span>
                        {c.band === "BLOCKED" && (
                          <div className="mt-1">
                            {isOwner ? (
                              <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={line.ownerApproved}
                                  onChange={(e) => updateLine(i, { ownerApproved: e.target.checked })}
                                />
                                Approve this line
                              </label>
                            ) : (
                              <span className="text-xs text-rose-700">Owner approval required</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">{usd.format(c.netUsd)}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600">✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-2xl font-semibold">{usd.format(v.order.totalUsd)}</div>
            <div className="text-slate-500">{sdg.format(v.order.totalSdg)} SDG at rate {v.order.rate}</div>
            {blockedUnapproved && <div className="text-sm text-rose-700">A blocked line needs owner approval before saving.</div>}
          </div>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="rounded-md bg-emerald-600 px-6 py-3 text-white font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save order"}
          </button>
        </section>
      </div>
    </main>
  );
}
