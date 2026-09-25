import "dotenv/config";
import { prisma } from "../lib/prisma";
import { validateOrder, type LineInput, type Role } from "../lib/order";

/**
 * Replaces all orders with a small, curated set of realistic demo orders that
 * exercise every discount band and the owner-approval path. Safe to re-run.
 *   npm run db:seed:orders
 */
async function main() {
  const dealer = await prisma.dealer.findFirst();
  const adviser = await prisma.user.findUnique({ where: { email: "adviser@solar.test" } });
  const owner = await prisma.user.findUnique({ where: { email: "owner@solar.test" } });
  if (!dealer || !adviser || !owner) throw new Error("Seed users/dealer missing. Run db:seed first.");

  const products = await prisma.product.findMany();
  const byPrice = (p: number) => {
    const found = products.find((x) => Number(x.priceUsd) === p);
    if (!found) throw new Error(`Product priced ${p} not found.`);
    return found;
  };
  const panel = byPrice(515);
  const inverter = byPrice(810);
  const battery = byPrice(2070);

  await prisma.orderLine.deleteMany();
  await prisma.order.deleteMany();

  async function create(userId: string, role: Role, rate: number, lines: LineInput[]) {
    const v = validateOrder({ lines, rate, role });
    if (!v.ok) throw new Error("Invalid demo order: " + JSON.stringify(v.errors));
    await prisma.order.create({
      data: {
        dealerId: dealer!.id,
        adviserId: userId,
        rate: v.order.rate,
        totalUsd: v.order.totalUsd,
        totalSdg: v.order.totalSdg,
        lines: {
          create: v.order.lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            unitPriceUsd: l.unitPriceUsd,
            quantity: l.quantity,
            discountUsd: l.discountUsd,
            discountPct: l.discountPct,
            band: l.band,
            netUsd: l.netUsd,
            ownerApproved: l.ownerApproved,
            approvedById: l.band === "BLOCKED" && l.ownerApproved ? userId : null,
          })),
        },
      },
    });
  }

  const line = (p: typeof panel, quantity: number, discountUsd: number, ownerApproved = false): LineInput => ({
    productId: p.id,
    productName: p.name,
    unitPriceUsd: Number(p.priceUsd),
    quantity,
    discountUsd,
    ownerApproved,
  });

  // 1) Adviser — worked example: $3,570 = 29,274,000 SDG (sand + red bands)
  await create(adviser.id, "ADVISER", 8200, [line(panel, 4, 40), line(inverter, 2, 70)]);

  // 2) Owner — worked example: $5,490 = 45,018,000 SDG (adds a 7.25% owner-approved blocked line)
  await create(owner.id, "OWNER", 8200, [line(panel, 4, 40), line(inverter, 2, 70), line(battery, 1, 150, true)]);

  // 3) Adviser — a clean single-line order (sand band)
  await create(adviser.id, "ADVISER", 8500, [line(inverter, 3, 0)]);

  const count = await prisma.order.count();
  console.log(`Seeded ${count} demo orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
