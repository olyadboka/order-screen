import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";

const PASSWORD = "Passw0rd!";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: "owner@solar.test" },
    update: { passwordHash, role: "OWNER", name: "Owner" },
    create: { email: "owner@solar.test", name: "Owner", role: "OWNER", passwordHash },
  });

  await prisma.user.upsert({
    where: { email: "adviser@solar.test" },
    update: { passwordHash, role: "ADVISER", name: "Adviser" },
    create: { email: "adviser@solar.test", name: "Adviser", role: "ADVISER", passwordHash },
  });

  const dealers = ["Khartoum Solar Co.", "Nile Power Dealers", "Red Sea Energy"];
  for (const name of dealers) {
    const found = await prisma.dealer.findFirst({ where: { name } });
    if (!found) await prisma.dealer.create({ data: { name } });
  }

  const products: Array<{ name: string; priceUsd: number }> = [
    { name: "Solar Panel 550W", priceUsd: 515 },
    { name: "Hybrid Inverter 5kW", priceUsd: 810 },
    { name: "Lithium Battery 10kWh", priceUsd: 2070 },
    { name: "Mounting Kit", priceUsd: 120 },
    { name: "Charge Controller 60A", priceUsd: 245 },
  ];
  for (const p of products) {
    const found = await prisma.product.findFirst({ where: { name: p.name } });
    if (found) await prisma.product.update({ where: { id: found.id }, data: { priceUsd: p.priceUsd } });
    else await prisma.product.create({ data: p });
  }

  await prisma.setting.upsert({
    where: { key: "default_exchange_rate" },
    update: { value: "8200" },
    create: { key: "default_exchange_rate", value: "8200" },
  });

  console.log("Seeded:");
  console.log(`  owner@solar.test / ${PASSWORD}  (OWNER)`);
  console.log(`  adviser@solar.test / ${PASSWORD}  (ADVISER)`);
  console.log(`  ${dealers.length} dealers, ${products.length} products, default rate 8200`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
