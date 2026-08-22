"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/forms";

const REASON_MESSAGES: Record<string, string> = {
  not_found: "That invite link doesn't exist.",
  revoked: "That invite link has been revoked.",
  expired: "That invite link has expired.",
  used_up: "That invite link has already been used.",
  wrong_email: "This invite was sent to a different email address than the one you're signed in with.",
};

export async function acceptInvite(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const token = formData.get("token");
  if (typeof token !== "string" || token.length === 0) return { ok: false, error: "Missing invite token." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token }).single();
  if (error) return { ok: false, error: error.message };
  if (!data.granted) return { ok: false, error: REASON_MESSAGES[data.reason ?? ""] ?? "Could not accept this invite." };

  redirect("/");
}
