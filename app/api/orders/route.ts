import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { error, isDenied, json, requireUser } from "@/lib/http";
import { validateOrder, type LineInput } from "@/lib/order";

const bodySchema = z.object({
  dealerId: z.string().min(1),
  rate: z.number(),
  clientId: z.string().min(1).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        discountUsd: z.number().min(0),
        ownerApproved: z.boolean().optional(),
      })
    )
    .min(1),
});

export async function GET() {
  const guard = await requireUser();
  if (isDenied(guard)) return guard.response;

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { dealer: true, adviser: true, lines: true },
    take: 50,
  });

  return json({
    orders: orders.map((o) => ({
      id: o.id,
      dealer: o.dealer.name,
      adviser: o.adviser.name,
      rate: Number(o.rate),
      totalUsd: Number(o.totalUsd),
      totalSdg: Number(o.totalSdg),
      createdAt: o.createdAt,
      lines: o.lines.length,
    })),
  });
}

export async function POST(req: Request) {
  const guard = await requireUser();
  if (isDenied(guard)) return guard.response;
  const user = guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return error("Invalid order payload.", 400, { issues: parsed.error.flatten() });
  }
  const body = parsed.data;

  // Idempotency: an offline client may replay the same save. Return the existing order.
  if (body.clientId) {
    const existing = await prisma.order.findUnique({ where: { clientId: body.clientId } });
    if (existing) return json({ order: existing, deduped: true }, 200);
  }

  const dealer = await prisma.dealer.findUnique({ where: { id: body.dealerId } });
  if (!dealer) return error("Dealer not found.", 404);

  // Prices come from the database, never from the client. An adviser cannot
  // change a price by crafting the request body.
  const products = await prisma.product.findMany({
    where: { id: { in: body.lines.map((l) => l.productId) } },
  });
  const priceById = new Map(products.map((p) => [p.id, p]));

  const lines: LineInput[] = [];
  for (const line of body.lines) {
    const product = priceById.get(line.productId);
    if (!product) return error(`Product ${line.productId} not found.`, 404);
    lines.push({
      productId: product.id,
      productName: product.name,
      unitPriceUsd: Number(product.priceUsd),
      quantity: line.quantity,
      discountUsd: line.discountUsd,
      ownerApproved: line.ownerApproved,
    });
  }

  const validation = validateOrder({ lines, rate: body.rate, role: user.role });
  if (!validation.ok) {
    return error(validation.errors[0].message, validation.status, {
      code: validation.errors[0].code,
      errors: validation.errors,
    });
  }

  const { order } = validation;
  const created = await prisma.order.create({
    data: {
      clientId: body.clientId,
      dealerId: dealer.id,
      adviserId: user.id,
      rate: order.rate,
      totalUsd: order.totalUsd,
      totalSdg: order.totalSdg,
      lines: {
        create: order.lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          unitPriceUsd: l.unitPriceUsd,
          quantity: l.quantity,
          discountUsd: l.discountUsd,
          discountPct: l.discountPct,
          band: l.band,
          netUsd: l.netUsd,
          ownerApproved: l.ownerApproved,
          approvedById: l.band === "BLOCKED" && l.ownerApproved ? user.id : null,
        })),
      },
    },
    include: { lines: true, dealer: true },
  });

  return json({ order: created, totals: { totalUsd: order.totalUsd, totalSdg: order.totalSdg } }, 201);
}
