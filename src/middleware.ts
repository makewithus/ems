import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

/**
 * Routes that only super_admin / hr_admin may access.
 * Employees are redirected to /dashboard if they try to reach these.
 */
const ADMIN_ONLY_PATHS = [
  "/employees",
  "/reports",
  "/documents",
  "/issues",
  "/employer",
];

function normalizeRole(role: string | undefined) {
  return role?.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const sessionCookie = request.cookies.get("ems-session")?.value;

  // ── Unauthenticated → redirect to login ──
  if (!isPublic && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Already authenticated trying to visit login → redirect to dashboard ──
  if (isPublic && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // ── Strict Portal Isolation — employees cannot access admin paths ──
  const roleCookie = normalizeRole(request.cookies.get("ems-role")?.value);

  if (sessionCookie) {
    const isEmployee = roleCookie === "employee" || !roleCookie;
    const hittingAdminRoute = ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));

    if (isEmployee && hittingAdminRoute) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
