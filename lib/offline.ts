"use client";

import Dexie, { type Table } from "dexie";

export interface OutboxOrder {
  clientId: string;
  payload: unknown;
  createdAt: number;
  status: "pending" | "synced" | "error";
  lastError?: string;
}

class OfflineDb extends Dexie {
  outbox!: Table<OutboxOrder, string>;

  constructor() {
    super("order-screen");
    this.version(1).stores({ outbox: "clientId, status, createdAt" });
  }
}

let db: OfflineDb | null = null;
function getDb(): OfflineDb {
  if (!db) db = new OfflineDb();
  return db;
}

export async function enqueue(clientId: string, payload: unknown): Promise<void> {
  await getDb().outbox.put({ clientId, payload, createdAt: Date.now(), status: "pending" });
}

export async function pendingCount(): Promise<number> {
  return getDb().outbox.where("status").equals("pending").count();
}

/** Try to POST every pending order. Idempotent server-side via clientId. */
export async function flushOutbox(): Promise<{ synced: number; failed: number }> {
  const items = await getDb().outbox.where("status").equals("pending").toArray();
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (res.ok) {
        await getDb().outbox.update(item.clientId, { status: "synced" });
        synced++;
      } else if (res.status >= 400 && res.status < 500) {
        // A 4xx will never succeed on retry (e.g. rejected discount). Park it.
        const body = await res.json().catch(() => ({}));
        await getDb().outbox.update(item.clientId, { status: "error", lastError: body.error ?? `HTTP ${res.status}` });
        failed++;
      } else {
        failed++;
      }
    } catch {
      failed++; // still offline; leave as pending
    }
  }
  return { synced, failed };
}
