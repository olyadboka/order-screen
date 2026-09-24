import { prisma } from "@/lib/prisma";
import { error, isDenied, json, requireUser } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireUser();
  if (isDenied(guard)) return guard.response;

  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { dealer: true, adviser: true, lines: true },
  });
  if (!order) return error("Order not found.", 404);

  return json({
    order: {
      id: order.id,
      dealer: order.dealer.name,
      adviser: order.adviser.name,
      rate: Number(order.rate),
      totalUsd: Number(order.totalUsd),
      totalSdg: Number(order.totalSdg),
      createdAt: order.createdAt,
      lines: order.lines.map((l) => ({
        productName: l.productName,
        unitPriceUsd: Number(l.unitPriceUsd),
        quantity: l.quantity,
        discountUsd: Number(l.discountUsd),
        discountPct: Number(l.discountPct),
        band: l.band,
        netUsd: Number(l.netUsd),
        ownerApproved: l.ownerApproved,
      })),
    },
  });
}
