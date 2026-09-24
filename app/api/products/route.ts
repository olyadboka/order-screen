import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";

export async function GET() {
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return json({
    products: products.map((p) => ({ id: p.id, name: p.name, priceUsd: Number(p.priceUsd) })),
  });
}
