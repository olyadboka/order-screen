/**
 * Live proof that enforcement lives on the SERVER, not just the UI.
 * Run against a running app:  BASE_URL=http://localhost:3000 npm run prove
 *
 * It logs in as the ADVISER and then, calling the API directly:
 *   1. tries to save the 7.25% line with no approval      -> expects 403
 *   2. tries to save with rate below 8,000                -> expects 400
 *   3. tries to change a product price as an adviser      -> expects 403
 *   4. saves the two-line order the brief says is valid   -> expects 201 + $3,570 / 29,274,000 SDG
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let cookie = "";

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let failures = 0;
function check(name: string, ok: boolean, detail: unknown) {
  const mark = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`[${mark}] ${name}${ok ? "" : `\n        -> ${JSON.stringify(detail)}`}`);
}

async function main() {
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "adviser@solar.test", password: "Passw0rd!" }),
  });
  check("adviser can log in", login.status === 200, login);

  const dealers = (await api("/api/dealers")).body.dealers as Array<{ id: string; name: string }>;
  const products = (await api("/api/products")).body.products as Array<{ id: string; name: string; priceUsd: number }>;
  const dealerId = dealers[0].id;
  const find = (price: number) => products.find((p) => p.priceUsd === price)!.id;
  const panel = find(515);
  const inverter = find(810);
  const battery = find(2070);

  const blocked = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      dealerId,
      rate: 8200,
      lines: [
        { productId: panel, quantity: 4, discountUsd: 40 },
        { productId: inverter, quantity: 2, discountUsd: 70 },
        { productId: battery, quantity: 1, discountUsd: 150 },
      ],
    }),
  });
  check(
    "adviser + 7.25% line + no approval is REFUSED with 403",
    blocked.status === 403 && blocked.body.code === "LINE_REQUIRES_APPROVAL",
    blocked
  );

  const selfApprove = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      dealerId,
      rate: 8200,
      lines: [{ productId: battery, quantity: 1, discountUsd: 150, ownerApproved: true }],
    }),
  });
  check(
    "adviser cannot self-approve a blocked line (403)",
    selfApprove.status === 403 && selfApprove.body.code === "ADVISER_CANNOT_APPROVE",
    selfApprove
  );

  const lowRate = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      dealerId,
      rate: 7999,
      lines: [{ productId: panel, quantity: 4, discountUsd: 40 }],
    }),
  });
  check("rate below 8,000 is refused (400)", lowRate.status === 400 && lowRate.body.code === "RATE_BELOW_FLOOR", lowRate);

  const priceChange = await api(`/api/products/${panel}`, {
    method: "PATCH",
    body: JSON.stringify({ priceUsd: 1 }),
  });
  check("adviser cannot change a price (403)", priceChange.status === 403, priceChange);

  const valid = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      dealerId,
      rate: 8200,
      clientId: `prove-${Date.now()}`,
      lines: [
        { productId: panel, quantity: 4, discountUsd: 40 },
        { productId: inverter, quantity: 2, discountUsd: 70 },
      ],
    }),
  });
  const totals = valid.body.totals ?? {};
  check(
    "two-line order saves: $3,570 = 29,274,000 SDG",
    (valid.status === 201 || valid.body.deduped) && totals.totalUsd === 3570 && totals.totalSdg === 29_274_000,
    valid
  );

  console.log(failures === 0 ? "\nAll proofs passed." : `\n${failures} proof(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
