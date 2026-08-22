import type { Role } from "@/lib/enums";

export const LOGIN_PATH = "/login";
export const VERIFY_PATH = "/verify";
export const JOIN_PATH = "/join";
export const AUTH_CALLBACK_PATH = "/auth/callback";

export const ROLE_HOME: Record<Role, string> = {
  admin: "/organizer",
  organizer: "/organizer",
  judge: "/judge",
  recruiter: "/recruiter",
  participant: "/dashboard",
};

const ROLE_PRIORITY: Role[] = ["admin", "organizer", "judge", "recruiter", "participant"];

export const ALUMNI_HOME = "/alumni";

type RouteGuard =
  | { prefix: string; kind: "roles"; roles: readonly Role[] }
  | { prefix: string; kind: "alumni" };

export const PROTECTED_ROUTES: RouteGuard[] = [
  { prefix: "/dashboard", kind: "roles", roles: ["participant"] },
  { prefix: "/judge", kind: "roles", roles: ["judge"] },
  { prefix: "/organizer", kind: "roles", roles: ["organizer", "admin"] },
  { prefix: "/recruiter", kind: "roles", roles: ["recruiter"] },
  { prefix: "/alumni", kind: "alumni" },
];

export const INVITE_PATH_PREFIX = "/invite/";

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === LOGIN_PATH ||
    pathname === VERIFY_PATH ||
    pathname === AUTH_CALLBACK_PATH ||
    pathname.startsWith(`${AUTH_CALLBACK_PATH}/`) ||
    // Signed-out visitors need to see the invite preview (event + role)
    // before being asked to sign in — the page itself decides what to show
    // based on auth state, same as /login does.
    pathname.startsWith(INVITE_PATH_PREFIX)
  );
}

export function safeNextPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export function pickPrimaryRole(roles: readonly Role[]): Role | null {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return null;
}

export function homePath(roles: readonly Role[], isAlumnus: boolean): string {
  const primary = pickPrimaryRole(roles);
  if (primary) return ROLE_HOME[primary];
  if (isAlumnus) return ALUMNI_HOME;
  return JOIN_PATH;
}

export function pathAllowed(
  pathname: string,
  roles: readonly Role[],
  isAlumnus: boolean,
): boolean {
  const guard = PROTECTED_ROUTES.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`),
  );
  if (!guard) return true;
  if (guard.kind === "alumni") return isAlumnus;
  return guard.roles.some((role) => roles.includes(role));
}
