import { z } from "zod";
import { RATE_FLOOR } from "@/lib/order";
import { getDefaultRate, setDefaultRate } from "@/lib/settings";
import { error, isDenied, json, requireRole } from "@/lib/http";

export async function GET() {
  return json({ rate: await getDefaultRate(), floor: RATE_FLOOR });
}

const schema = z.object({ rate: z.number() });

// The default (setting) rate is owner-only. Saved orders snapshot their own
// rate and are unaffected by changes here.
export async function PUT(req: Request) {
  const guard = await requireRole("OWNER");
  if (isDenied(guard)) return guard.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("A numeric rate is required.", 400);
  if (parsed.data.rate < RATE_FLOOR) {
    return error(`Exchange rate must be at least ${RATE_FLOOR} SDG per dollar.`, 400, { floor: RATE_FLOOR });
  }

  return json({ rate: await setDefaultRate(parsed.data.rate), floor: RATE_FLOOR });
}
