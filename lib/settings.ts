import { prisma } from "./prisma";
import { RATE_FLOOR } from "./order";

export const DEFAULT_RATE_KEY = "default_exchange_rate";

export async function getDefaultRate(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: DEFAULT_RATE_KEY } });
  const value = row ? Number(row.value) : RATE_FLOOR;
  return Number.isFinite(value) && value >= RATE_FLOOR ? value : RATE_FLOOR;
}

export async function setDefaultRate(rate: number): Promise<number> {
  const safe = Math.max(rate, RATE_FLOOR);
  await prisma.setting.upsert({
    where: { key: DEFAULT_RATE_KEY },
    create: { key: DEFAULT_RATE_KEY, value: String(safe) },
    update: { value: String(safe) },
  });
  return safe;
}
