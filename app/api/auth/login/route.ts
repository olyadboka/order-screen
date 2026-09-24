import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { error, json } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Email and password are required.", 400);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return error("Invalid email or password.", 401);
  }

  const session = { id: user.id, email: user.email, name: user.name, role: user.role };
  await setSessionCookie(await createSessionToken(session));
  return json({ user: session });
}
