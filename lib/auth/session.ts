import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH } from "@/lib/auth/paths";

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

export async function ensureProfile(user: User): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;

  const meta = user.user_metadata ?? {};
  await supabase.from("profiles").insert({
    id: user.id,
    email: user.email ?? "",
    full_name: (meta.full_name ?? meta.name ?? meta.user_name ?? null) as string | null,
    avatar_url: (meta.avatar_url ?? null) as string | null,
    github_username: (meta.user_name ?? null) as string | null,
  });
}
