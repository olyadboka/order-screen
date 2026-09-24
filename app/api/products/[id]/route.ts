import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { error, isDenied, json, requireRole } from "@/lib/http";

const schema = z.object({ priceUsd: z.number().positive() });

// Prices are owner-only. An adviser calling this is rejected with 403.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireRole("OWNER");
  if (isDenied(guard)) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("A positive priceUsd is required.", 400);

  const { id } = await ctx.params;
  const exists = await prisma.product.findUnique({ where: { id } });
  if (!exists) return error("Product not found.", 404);

  const updated = await prisma.product.update({
    where: { id },
    data: { priceUsd: parsed.data.priceUsd },
  });
  return json({ product: { id: updated.id, name: updated.name, priceUsd: Number(updated.priceUsd) } });
}
