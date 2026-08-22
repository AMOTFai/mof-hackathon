import { redirect } from "next/navigation";
import type { Role } from "@/lib/enums";
import { pathAllowed } from "@/lib/auth/paths";
import { resolveAccess } from "@/lib/auth/roles";

export async function requireRoles(allowed: readonly Role[]) {
  const access = await resolveAccess();
  if (!allowed.some((role) => access.roles.includes(role))) {
    redirect(access.home);
  }
  return access;
}

export async function requireAlumnus() {
  const access = await resolveAccess();
  if (!access.isAlumnus) redirect(access.home);
  return access;
}

export async function requirePathAccess(pathname: string) {
  const access = await resolveAccess();
  if (!pathAllowed(pathname, access.roles, access.isAlumnus)) {
    redirect(access.home);
  }
  return access;
}
