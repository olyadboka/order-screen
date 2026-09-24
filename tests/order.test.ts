import { describe, expect, it } from "vitest";
import { computeLine, validateOrder, RATE_FLOOR } from "@/lib/order";

const RATE = 8200;

const L1 = { productId: "p1", productName: "Panel", unitPriceUsd: 515, quantity: 4, discountUsd: 40 };
const L2 = { productId: "p2", productName: "Inverter", unitPriceUsd: 810, quantity: 2, discountUsd: 70 };
const L3 = { productId: "p3", productName: "Battery", unitPriceUsd: 2070, quantity: 1, discountUsd: 150 };

describe("worked example lines", () => {
  it("line 1: 4 x $515 - $40 -> 1.94%, sand, $2,020", () => {
    const r = computeLine(L1);
    expect(r.discountPct).toBe(1.94);
    expect(r.band).toBe("SAND");
    expect(r.netUsd).toBe(2020);
  });

  it("line 2: 2 x $810 - $70 -> 4.32%, red, $1,550", () => {
    const r = computeLine(L2);
    expect(r.discountPct).toBe(4.32);
    expect(r.band).toBe("RED");
    expect(r.netUsd).toBe(1550);
  });

  it("line 3: 1 x $2,070 - $150 -> 7.25%, blocked, $1,920", () => {
    const r = computeLine(L3);
    expect(r.discountPct).toBe(7.25);
    expect(r.band).toBe("BLOCKED");
    expect(r.netUsd).toBe(1920);
  });
});

describe("order totals", () => {
  it("without the blocked line: $3,570 = 29,274,000 SDG, and it saves", () => {
    const v = validateOrder({ lines: [L1, L2], rate: RATE, role: "ADVISER" });
    expect(v.ok).toBe(true);
    expect(v.status).toBe(200);
    expect(v.order.totalUsd).toBe(3570);
    expect(v.order.totalSdg).toBe(29_274_000);
  });

  it("with the blocked line approved by owner: $5,490 = 45,018,000 SDG", () => {
    const v = validateOrder({
      lines: [L1, L2, { ...L3, ownerApproved: true }],
      rate: RATE,
      role: "OWNER",
    });
    expect(v.ok).toBe(true);
    expect(v.order.totalUsd).toBe(5490);
    expect(v.order.totalSdg).toBe(45_018_000);
  });
});

describe("server-side enforcement", () => {
  it("adviser cannot save a 7.25% line without approval -> 403", () => {
    const v = validateOrder({ lines: [L1, L2, L3], rate: RATE, role: "ADVISER" });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
    expect(v.errors[0].code).toBe("LINE_REQUIRES_APPROVAL");
  });

  it("adviser cannot self-approve a blocked line -> 403", () => {
    const v = validateOrder({
      lines: [{ ...L3, ownerApproved: true }],
      rate: RATE,
      role: "ADVISER",
    });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(403);
    expect(v.errors[0].code).toBe("ADVISER_CANNOT_APPROVE");
  });

  it(`rate below ${RATE_FLOOR} is refused -> 400`, () => {
    const v = validateOrder({ lines: [L1], rate: 7999, role: "ADVISER" });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(400);
    expect(v.errors[0].code).toBe("RATE_BELOW_FLOOR");
  });

  it("rate exactly at the floor is accepted", () => {
    const v = validateOrder({ lines: [L1], rate: RATE_FLOOR, role: "ADVISER" });
    expect(v.ok).toBe(true);
  });
});

describe("band boundaries", () => {
  it("exactly 3% is sand", () => {
    expect(computeLine({ ...L1, unitPriceUsd: 100, quantity: 1, discountUsd: 3 }).band).toBe("SAND");
  });
  it("exactly 5% is red", () => {
    expect(computeLine({ ...L1, unitPriceUsd: 100, quantity: 1, discountUsd: 5 }).band).toBe("RED");
  });
  it("just above 5% is blocked", () => {
    expect(computeLine({ ...L1, unitPriceUsd: 100, quantity: 1, discountUsd: 5.01 }).band).toBe("BLOCKED");
  });
});
