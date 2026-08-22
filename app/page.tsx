import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/auth/roles";
import { LOGIN_PATH } from "@/lib/auth/paths";

export default async function HomePage() {
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  const access = await resolveAccess();
  redirect(access.home);
}
