import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./auth";
import type { Role } from "./order";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function requireUser(): Promise<SessionUser | { response: NextResponse }> {
  const user = await getSession();
  if (!user) return { response: error("Not authenticated.", 401) };
  return user;
}

export async function requireRole(role: Role): Promise<SessionUser | { response: NextResponse }> {
  const user = await getSession();
  if (!user) return { response: error("Not authenticated.", 401) };
  if (user.role !== role) return { response: error(`Requires ${role} role.`, 403) };
  return user;
}

export function isDenied(x: unknown): x is { response: NextResponse } {
  return typeof x === "object" && x !== null && "response" in x;
}
