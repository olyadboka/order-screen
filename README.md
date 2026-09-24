# Order Screen — Solar Distributor Trial

An adviser picks a dealer, adds products at fixed dollar prices, gives a per-line
discount, enters today's exchange rate, and saves. Every rule is enforced on the
**server**; the UI only mirrors it.

## The rules, and where they live

| Rule | Enforcement |
|------|-------------|
| Prices are fixed in dollars; adviser cannot change them | Server reads the price from the DB and **ignores any price in the request body**. Price edits are an OWNER-only endpoint (`PATCH /api/products/:id`). |
| Discount ≤ 3% → **sand**, 3–5% → **red**, > 5% → **blocked** | `lib/order.ts` `classifyBand`, measured against the line's gross value (qty × unit price). |
| A blocked line saves only with owner approval | Server returns **403** unless the line is approved *and* the caller is an OWNER (an adviser cannot self-approve). |
| Exchange rate never below 8,000 | Server returns **400** for rate < 8,000. UI clamps the input to 8,000. |
| A saved order keeps its own rate | The rate is snapshotted onto the `Order` row. Changing the default-rate setting later does not touch saved orders. |

### The worked example (rate 8,200)

| Line | % | Band | Line total |
|------|---|------|-----------|
| 4 × $515, $40 discount | 1.94% | sand | $2,020 |
| 2 × $810, $70 discount | 4.32% | red | $1,550 |
| 1 × $2,070, $150 discount | 7.25% | blocked | $1,920 |

- Without line 3: **$3,570 = 29,274,000 SDG** → saves.
- With line 3 approved by the owner: **$5,490 = 45,018,000 SDG**.

These exact numbers are asserted in `tests/order.test.ts`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · PostgreSQL (Neon) · Prisma
via the **Neon serverless driver adapter** · JWT auth (jose + bcrypt) ·
Dexie (offline outbox) · Vitest.

Money is handled with `decimal.js` end to end — no floats — so the example
reproduces to the cent.

> **Why the Neon serverless adapter?** Many networks block the native Postgres
> port (5432). Prisma runs here through `@prisma/adapter-neon`, which tunnels
> Postgres over HTTPS/WebSocket (443). The schema is applied over the same
> channel (`npm run db:apply`) instead of `prisma migrate`, so setup works even
> where 5432 is blocked — and unchanged on Vercel.

## Setup

1. **Database (Neon).** Create a free project at https://neon.tech and copy the
   connection string into `.env` (see `.env.example`):

   ```
   DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
   AUTH_SECRET="<32+ char secret>"   # openssl rand -hex 32
   ```

2. **Install, apply schema, seed, run:**

   ```bash
   npm install             # also runs `prisma generate` (postinstall)
   npm run db:setup        # applies the schema over HTTPS, then seeds
   npm run dev             # http://localhost:3000
   ```

   `db:setup` = `db:apply` (idempotent DDL over the Neon HTTPS driver) + `db:seed`
   (users, dealers, products, default rate 8,200).

### Seeded logins

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@solar.test | Passw0rd! |
| Adviser | adviser@solar.test | Passw0rd! |

## Proof the server refuses — not just the UI

With the app running:

```bash
npm run prove
```

It logs in as the **adviser** and, calling the API directly, proves:

- 7.25% line with no approval → **403** (`LINE_REQUIRES_APPROVAL`)
- adviser tries to self-approve a blocked line → **403** (`ADVISER_CANNOT_APPROVE`)
- rate below 8,000 → **400** (`RATE_BELOW_FLOOR`)
- adviser tries to change a price → **403**
- the valid two-line order → **201**, `$3,570 = 29,274,000 SDG`

### Reproduce by hand with curl

```bash
# 1) log in as adviser, keep the cookie
curl -s -c cookies.txt -H 'content-type: application/json' \
  -d '{"email":"adviser@solar.test","password":"Passw0rd!"}' \
  http://localhost:3000/api/auth/login

# 2) find a dealer id and the $2,070 product id
curl -s -b cookies.txt http://localhost:3000/api/dealers
curl -s -b cookies.txt http://localhost:3000/api/products

# 3) POST the 7.25% line with NO approval -> HTTP 403
curl -i -s -b cookies.txt -H 'content-type: application/json' \
  -d '{"dealerId":"<DEALER_ID>","rate":8200,
       "lines":[{"productId":"<BATTERY_2070_ID>","quantity":1,"discountUsd":150}]}' \
  http://localhost:3000/api/orders
```

The response is `403` with `{"error":"...requires owner approval","code":"LINE_REQUIRES_APPROVAL"}`.

## Unit tests

```bash
npm test
```

Covers the exact worked-example numbers, the band boundaries (3% / 5% edges),
the rate floor, and the 403 paths — all against the same `lib/order.ts` the API uses.

## Offline (bonus)

The screen keeps working when the connection drops: a save while offline is
written to an IndexedDB outbox (`lib/offline.ts`) and flushed automatically on
reconnect. Each queued order carries a `clientId`; the server treats it as an
idempotency key, so a replay never creates a duplicate.

## Deployment

Deploy to Vercel, set `DATABASE_URL` and `AUTH_SECRET` in the project settings
(pointing at the same Neon database), and run `npm run db:setup` once against it.
The app talks to Neon over HTTPS in every environment, so nothing changes between
local dev and production.

## What I would do differently in the real build

- **Approval as a workflow, not a checkbox.** A blocked line should create an
  approval request the owner acts on (with an audit trail of who approved what
  and when), rather than the owner toggling it inline. The schema already keeps
  `approvedById` for this.
- **Money as integer minor units** (or Postgres `numeric` via Prisma `Decimal`
  only) with a shared, currency-aware formatting layer, plus rounding rules
  agreed with finance up front.
- **Real rate management** — historical rates with effective dates rather than a
  single setting, so reporting can re-value correctly.
- **Server-authored totals returned to the client** as the single source of
  truth for display, with the client computation used only for instant feedback
  (it already reuses `lib/order.ts`, but I'd make the server response canonical
  in the UI).
- **Tests: add API-level integration tests** (spin up the route handlers against
  a test database) and an e2e pass (Playwright) for the offline/sync path.
- **Observability & rate limiting** on the auth and order endpoints, and CSRF
  hardening beyond the `sameSite=lax` cookie.
