import { getSession } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET() {
  return json({ user: await getSession() });
}
