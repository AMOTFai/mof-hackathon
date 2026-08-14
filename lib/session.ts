import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

// V1 auth: a signed-in user is identified by their user id in an httpOnly cookie.
// No passwords — sign-in looks up (or creates) a user by email. Good enough for a
// single trusted event; swap for magic-link/OAuth before any public deployment.
const COOKIE = "motf_uid";

export async function setSession(userId: string) {
  cookies().set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 2 weeks
  });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export async function getCurrentUser() {
  const uid = cookies().get(COOKIE)?.value;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid }, include: { team: true } });
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireStaff() {
  const user = await requireUser();
  if (user.role === "participant") redirect("/");
  return user;
}
