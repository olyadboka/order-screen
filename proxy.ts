import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/jwt";

const PUBLIC_API = ["/api/auth/login", "/api/auth/logout"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await verifySessionToken(token) : null;

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API.includes(pathname)) return NextResponse.next();
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (user) return NextResponse.redirect(new URL("/order", req.url));
    return NextResponse.next();
  }

  if (!user) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/order/:path*", "/owner/:path*", "/login", "/api/:path*"],
};
