import { prisma } from "@/lib/prisma";
import { json } from "@/lib/http";

export async function GET() {
  const dealers = await prisma.dealer.findMany({ orderBy: { name: "asc" } });
  return json({ dealers: dealers.map((d) => ({ id: d.id, name: d.name })) });
}
